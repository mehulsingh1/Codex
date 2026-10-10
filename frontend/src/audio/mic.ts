import { apiUrl } from '../api'
import { getAudioContext } from './context'
import { levelBus } from './levelBus'

export type MicResult = 'ok' | 'denied' | 'unavailable'

interface Handlers {
  onSpeechStart: () => void
  onSpeechEnd: () => void
  /** Live caption text (interim) from the browser recogniser. */
  onInterim: (text: string) => void
  /** Final text for part of the utterance, from either the browser recogniser or Whisper. */
  onFinal: (text: string) => void
  onNotice: (msg: string) => void
}

interface RecognitionLike {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}

const FRAME_MS = 30
const START_FRAMES = 5 // about 150 ms of voice before we call it speech (fewer false barge-ins from clicks and coughs)
const END_SILENCE_MS = 450 // silence that ends an utterance; the backend adds the patience window on top

/** State of one spoken answer, from the first loud frame to the end of the pause. */
interface Utterance {
  delivered: boolean // text for this utterance has been sent on
  whisper?: boolean // Whisper's text won the race
  recogText?: boolean // the browser recogniser produced text for it
  recorder?: MediaRecorder
  chunks?: Blob[]
}

/** Microphone with a simple RMS voice detector, live captions (Web Speech) and a Whisper fallback. */
export class Mic {
  private stream: MediaStream | null = null
  private analyser: AnalyserNode | null = null
  private timer = 0
  private cur: Utterance = { delivered: false }
  private pre: Utterance | null = null // recording that began on the first loud frame, before speech was confirmed
  private recog: RecognitionLike | null = null
  private speaking = false
  private voiceFrames = 0
  private silenceMs = 0
  private floor = 0.004
  private speechLevel = 0 // how loud the student is while talking (smoothed): background noise is judged against this
  private speechStartedAt = 0
  private lastSpeechEnd = 0
  private lastDelivered = 0 // when text for an answer was last sent on; late recogniser echoes right after it are ignored
  private startedAt = 0
  private peak = 0
  private warnedSilent = false
  private active = false
  muted = false
  aiPlaying = false // set by the room: raises the bar so speaker bleed is not mistaken for the student

  private h: Handlers
  private lang: 'en' | 'hi'

  constructor(h: Handlers, lang: 'en' | 'hi') {
    this.h = h
    this.lang = lang
  }

  async start(): Promise<MicResult> {
    if (!navigator.mediaDevices?.getUserMedia) return 'unavailable'
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
    } catch (e) {
      const name = (e as DOMException).name
      return name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable'
    }
    const ctx = getAudioContext()
    try { await ctx.resume() } catch { /* the page click handler normally already did this */ }
    const src = ctx.createMediaStreamSource(this.stream)
    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = 1024
    src.connect(this.analyser) // not connected to the destination: no self-echo
    this.active = true
    this.startedAt = performance.now()
    this.startRecognition()
    const data = new Float32Array(this.analyser.fftSize)
    this.timer = window.setInterval(() => this.frame(data), FRAME_MS)
    return 'ok'
  }

  stop() {
    this.active = false
    clearInterval(this.timer)
    try { this.recog?.stop() } catch { /* not started */ }
    try { this.cur.recorder?.stop() } catch { /* not recording */ }
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    levelBus.mic = 0
  }

  private frame(data: Float32Array<ArrayBuffer>) {
    if (!this.analyser) return
    this.analyser.getFloatTimeDomainData(data)
    let sum = 0
    for (const v of data) sum += v * v
    const rms = Math.sqrt(sum / data.length)
    levelBus.mic = this.muted ? 0 : Math.min(1, rms * 12)
    this.peak = Math.max(this.peak, rms)
    if (!this.warnedSilent && performance.now() - this.startedAt > 10000 && this.peak < 0.002) {
      // A live mic is never this quiet: it is muted, unplugged, or the wrong device is selected.
      this.warnedSilent = true
      this.h.onNotice('No sound is coming from your microphone. Check which mic Chrome is using (lock icon in the address bar) and that it is not muted. You can also type your answers.')
    }
    if (this.muted) return

    const bar = Math.max(0.008, this.floor * 2.5) * (this.aiPlaying ? 1.8 : 1)
    // Once speaking, "still talking" means louder than a third of your own speaking level. A fan, traffic
    // or a hum that is louder than the quiet start threshold then counts as silence instead of keeping you "speaking" forever.
    const loud = rms > (this.speaking ? Math.max(bar, this.speechLevel * 0.35) : bar)
    if (!loud) this.floor = this.floor * 0.97 + rms * 0.03 // keep learning the room's noise level
    if (this.speaking && loud) this.speechLevel = this.speechLevel * 0.92 + rms * 0.08

    // Safety net: no answer is 20 seconds of unbroken sound. End it and treat the current level as the new noise floor.
    if (this.speaking && performance.now() - this.speechStartedAt > 20000) {
      this.floor = Math.max(this.floor, rms / 2)
      this.endSpeech()
      return
    }

    if (loud) {
      this.silenceMs = 0
      this.voiceFrames++
      // Start recording on the first loud frame so the first word is not clipped while we confirm it is speech.
      if (!this.speaking && this.voiceFrames === 1 && !this.pre) { this.pre = { delivered: false }; this.startRecording(this.pre) }
      if (!this.speaking && this.voiceFrames >= START_FRAMES) this.beginSpeech()
    } else {
      this.voiceFrames = 0
      if (!this.speaking && this.pre) { // it was only a blip, not speech: throw the recording away
        try { this.pre.recorder?.stop() } catch { /* not recording */ }
        this.pre = null
      }
      if (this.speaking) {
        this.silenceMs += FRAME_MS
        if (this.silenceMs >= END_SILENCE_MS) this.endSpeech()
      }
    }
  }

  private beginSpeech() {
    this.speaking = true
    this.speechStartedAt = performance.now()
    this.speechLevel = Math.max(this.speechLevel * 0.5, this.floor * 3)
    this.silenceMs = 0
    this.cur = this.pre ?? { delivered: false }
    this.pre = null
    if (!this.cur.recorder) this.startRecording(this.cur)
    this.h.onSpeechStart()
  }

  private endSpeech() {
    this.speaking = false
    this.lastSpeechEnd = performance.now()
    this.h.onSpeechEnd()
    // Whisper starts the moment you stop talking, in parallel with the browser recogniser.
    // Whichever delivers text first wins; the other result for this utterance is dropped.
    this.finishRecording(this.cur)
  }

  /** Deliver text for an utterance once. Returns false if something already delivered it. */
  private deliver(u: Utterance, text: string): boolean {
    if (u.delivered) return false
    u.delivered = true
    this.lastDelivered = performance.now()
    this.h.onFinal(text)
    return true
  }

  // ----- live captions via the browser recogniser (Chrome / Edge) -----
  private startRecognition() {
    const Ctor = (window as unknown as { SpeechRecognition?: new () => RecognitionLike; webkitSpeechRecognition?: new () => RecognitionLike })
    const R = Ctor.SpeechRecognition ?? Ctor.webkitSpeechRecognition
    if (!R) return // Whisper alone still works
    const r = new R()
    r.continuous = true
    r.interimResults = true
    r.lang = this.lang === 'hi' ? 'hi-IN' : 'en-IN'
    r.onresult = (e) => {
      if (this.muted) return
      // While an AI is talking, text we hear is probably its own voice through the speakers.
      if (this.aiPlaying && !this.speaking) return
      // A late result for an answer we already sent is not new speech.
      if (!this.speaking && performance.now() - this.lastDelivered < 5000) return
      // Words recognised but the level detector missed them (quiet mic): count it as speech.
      if (!this.speaking && performance.now() - this.lastSpeechEnd > 1500) { this.silenceMs = 0; this.beginSpeech() }
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        const text = res[0].transcript.trim()
        if (!text) continue
        if (res.isFinal) {
          // Chrome splits long answers into several finals. Once Whisper has delivered the whole
          // utterance these would repeat it, so they are dropped.
          if (!this.cur.whisper) { this.lastDelivered = performance.now(); this.h.onFinal(text) }
          this.cur.recogText = true
        } else {
          this.h.onInterim(text)
        }
      }
    }
    r.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return
      this.h.onNotice('Live captions are unavailable here, so your speech is transcribed after you stop talking.')
    }
    r.onend = () => { if (this.active) { try { r.start() } catch { /* already started */ } } }
    try { r.start() } catch { /* Whisper alone still works */ }
    this.recog = r
  }

  // ----- Whisper: record each utterance and upload it as soon as it ends -----
  private startRecording(u: Utterance) {
    if (!this.stream) return
    u.chunks = []
    try {
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported?.(t))
      u.recorder = new MediaRecorder(this.stream, { ...(mimeType && { mimeType }), audioBitsPerSecond: 32000 })
    } catch {
      try { u.recorder = new MediaRecorder(this.stream) } catch { return }
    }
    u.recorder.ondataavailable = (e) => { if (e.data.size) u.chunks!.push(e.data) }
    u.recorder.start()
  }

  private finishRecording(u: Utterance) {
    const rec = u.recorder
    if (!rec || rec.state !== 'recording') return
    rec.onstop = async () => {
      const mime = rec.mimeType || 'audio/webm'
      const blob = new Blob(u.chunks ?? [], { type: mime })
      if (blob.size < 1500) return
      const form = new FormData()
      form.append('audio', blob, `speech.${mime.includes('mp4') ? 'mp4' : mime.includes('ogg') ? 'ogg' : 'webm'}`)
      form.append('language', this.lang === 'hi' ? 'hi' : 'en')
      let failed = true
      for (let attempt = 0; attempt < 2 && failed; attempt++) {
        try {
          const r = await fetch(apiUrl('/stt'), { method: 'POST', body: form })
          if (r.ok) {
            failed = false
            const { text } = (await r.json()) as { text: string }
            // Use Whisper's text unless the browser recogniser already delivered this utterance.
            if (text && !u.recogText) { u.whisper = true; this.deliver(u, text) }
          }
        } catch { /* retry once */ }
      }
      if (failed) {
        // Only complain if the browser recogniser has not covered for it.
        window.setTimeout(() => {
          if (!u.recogText && !u.delivered) this.h.onNotice("Couldn't transcribe that. You can type your answer instead.")
        }, 2500)
      }
    }
    rec.stop()
  }
}
