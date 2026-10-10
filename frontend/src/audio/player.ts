import { audioState, getAudioContext } from './context'
import { levelBus } from './levelBus'

export interface PlayHandlers {
  /** A sentence has just started playing (index into the sentences array). */
  onSentence: (i: number) => void
  /** TTS from the server failed for a sentence, so browser speech was used instead. */
  onFallback: () => void
  /** The browser is keeping sound suspended until the user interacts with the page. */
  onBlocked: () => void
}

/**
 * Plays an AI turn sentence by sentence. All sentences are requested at once so the next one is
 * ready before the current one ends. cancel() stops sound within a frame and says how much was heard.
 */
export class VoicePlayer {
  private gen = 0
  private started = 0
  private source: AudioBufferSourceNode | null = null
  private aborters: AbortController[] = []
  private analyser: AnalyserNode | null = null
  private raf = 0
  private fakeTimer = 0
  playing = false

  private meter() {
    const ctx = getAudioContext()
    if (!this.analyser) {
      this.analyser = ctx.createAnalyser()
      this.analyser.fftSize = 512
      this.analyser.connect(ctx.destination)
    }
    const data = new Uint8Array(this.analyser.fftSize)
    const tick = () => {
      this.analyser!.getByteTimeDomainData(data)
      let sum = 0
      for (const v of data) sum += ((v - 128) / 128) ** 2
      const target = Math.min(1, Math.sqrt(sum / data.length) * 5)
      levelBus.speaker += (target - levelBus.speaker) * 0.35
      this.raf = requestAnimationFrame(tick)
    }
    cancelAnimationFrame(this.raf)
    tick()
  }

  private stopMeter() {
    cancelAnimationFrame(this.raf)
    clearInterval(this.fakeTimer)
    levelBus.speaker = 0
  }

  private async fetchAudio(persona: string, lang: string, text: string, gen: number): Promise<AudioBuffer | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (gen !== this.gen) return null
      const ac = new AbortController()
      this.aborters.push(ac)
      try {
        const r = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voice: persona, lang }),
          signal: ac.signal,
        })
        if (r.status === 503) return null // server says: use browser speech
        if (!r.ok) throw new Error(String(r.status))
        return await getAudioContext().decodeAudioData(await r.arrayBuffer())
      } catch {
        if (ac.signal.aborted) return null
      }
    }
    return null
  }

  private playBuffer(buf: AudioBuffer): Promise<void> {
    return new Promise((resolve) => {
      const ctx = getAudioContext()
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.connect(this.analyser!)
      src.onended = () => resolve()
      this.source = src
      src.start()
    })
  }

  private speakBrowser(text: string, lang: string): Promise<void> {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) return resolve()
      const u = new SpeechSynthesisUtterance(text)
      u.lang = lang === 'hi' ? 'hi-IN' : 'en-IN'
      u.onend = u.onerror = () => { clearInterval(this.fakeTimer); levelBus.speaker = 0; resolve() }
      // Browser speech cannot be analysed, so fake a level so the visuals still pulse.
      this.fakeTimer = window.setInterval(() => { levelBus.speaker = 0.35 + Math.random() * 0.4 }, 90)
      speechSynthesis.speak(u)
    })
  }

  async playTurn(persona: string, lang: string, sentences: string[], h: PlayHandlers): Promise<'done' | 'cancelled'> {
    const my = ++this.gen
    this.started = 0
    this.playing = true
    try { await getAudioContext().resume() } catch { /* handled below */ }
    if (audioState() !== 'running') h.onBlocked()
    this.meter()
    const audio = sentences.map((s) => this.fetchAudio(persona, lang, s, my))
    for (let i = 0; i < sentences.length; i++) {
      const buf = await audio[i]
      if (this.gen !== my) return 'cancelled'
      this.started = i + 1
      h.onSentence(i)
      if (buf) {
        await this.playBuffer(buf)
      } else {
        h.onFallback()
        await this.speakBrowser(sentences[i], lang)
      }
      if (this.gen !== my) return 'cancelled'
    }
    this.playing = false
    this.stopMeter()
    return 'done'
  }

  /** Stop everything now. Returns how many sentences had started (the student "heard" those). */
  cancel(): number {
    const heard = this.started
    this.gen++
    this.aborters.forEach((a) => a.abort())
    this.aborters = []
    try { this.source?.stop() } catch { /* already stopped */ }
    this.source = null
    if ('speechSynthesis' in window) speechSynthesis.cancel()
    this.playing = false
    this.started = 0
    this.stopMeter()
    return heard
  }
}
