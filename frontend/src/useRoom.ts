import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic } from './audio/mic'
import { VoicePlayer } from './audio/player'
import { RoomClient } from './audio/roomClient'
import type { Connection, ServerMsg } from './audio/roomClient'
import type { MicStatus, RoomConfig, RoomControls, RoomState, TranscriptLine } from './types'

interface Entry {
  id: number
  speaker: string
  text: string
  t_start: number
  t_end: number | null
  interrupted: boolean
}

const toLine = (e: Entry): TranscriptLine => ({
  id: e.id, speaker: e.speaker, text: e.text, t: e.t_start, tEnd: e.t_end, interrupted: e.interrupted,
})

const upsert = (list: TranscriptLine[], line: TranscriptLine) => {
  const i = list.findIndex((l) => l.id === line.id)
  if (i === -1) return [...list, line].sort((a, b) => a.id - b.id)
  const copy = [...list]
  copy[i] = line
  return copy
}

/** The live room: WebSocket session + spoken AI turns + microphone. Produces the same RoomState as the simulator. */
export function useRoom(
  config: RoomConfig,
  patienceMs: number,
  onEnded: (transcript: TranscriptLine[]) => void,
): { state: RoomState; ctl: RoomControls } {
  const [speaker, setSpeaker] = useState<string | null>(null)
  const [thinking, setThinking] = useState<string | null>(null)
  const [interrupts, setInterrupts] = useState(0)
  const [caption, setCaption] = useState<RoomState['caption']>(null)
  const [transcript, setTranscript] = useState<TranscriptLine[]>([])
  const [remaining, setRemaining] = useState(8 * 60)
  const [connection, setConnection] = useState<Connection>('connecting')
  const [micStatus, setMicStatus] = useState<MicStatus>('starting')
  const [micOn, setMicOnState] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const [observing, setObserving] = useState(config.format === 'fishbowl')

  const client = useRef<RoomClient | null>(null)
  const mic = useRef<Mic | null>(null)
  const player = useRef<VoicePlayer | null>(null)
  const toastTimer = useRef(0)
  const onEndedRef = useRef(onEnded)
  onEndedRef.current = onEnded

  const notify = useCallback((text: string, ms = 6000) => {
    setToast(text)
    clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), ms)
  }, [])

  useEffect(() => {
    const pl = new VoicePlayer()
    player.current = pl
    let fellBack = false
    let lastTurn = -1

    const bargeIn = () => {
      const wasSpeaking = pl.playing
      const heard = pl.cancel() // sound stops here, before the server has even replied
      if (wasSpeaking) setInterrupts((n) => n + 1)
      mic.current && (mic.current.aiPlaying = false)
      return wasSpeaking ? heard : undefined
    }

    const m = new Mic(
      {
        onSpeechStart: () => {
          const heard = bargeIn()
          client.current?.send({ type: 'speech_start', heard_sentences: heard })
        },
        onSpeechEnd: () => client.current?.send({ type: 'speech_end' }),
        onInterim: (text) => setCaption({ speaker: 'student', text }),
        onFinal: (text) => {
          setCaption({ speaker: 'student', text })
          client.current?.send({ type: 'student_text', text, final: true, complete: false })
        },
        onNotice: (msg) => notify(msg),
      },
      config.lang,
    )
    mic.current = m
    m.start().then((s) => {
      setMicStatus(s === 'ok' ? 'on' : s)
      if (s === 'denied') notify('Microphone access was denied. You can type your answers below.', 10000)
      if (s === 'unavailable') notify('No microphone found. You can type your answers below.', 10000)
    })

    const handle = (msg: ServerMsg) => {
      switch (msg.type) {
        case 'snapshot':
          setTranscript((msg.transcript as Entry[]).map(toLine))
          setRemaining(msg.remaining)
          setSpeaker(msg.floor === 'idle' ? null : msg.speaker)
          setObserving(!!msg.observing)
          break
        case 'observing':
          setObserving(!!msg.value)
          break
        case 'state':
          setSpeaker(msg.floor === 'idle' ? null : msg.speaker)
          setThinking(msg.thinking && msg.thinking !== 'all' ? msg.thinking : null)
          break
        case 'turn': {
          const id = msg.id as number
          if (id === lastTurn) break // a resumed session can replay the current turn
          lastTurn = id
          setTranscript((t) => upsert(t, toLine(msg.entry)))
          if (msg.source === 'fallback') notify('The AI hit a hiccup, so the moderator stepped in.')
          if (mic.current) mic.current.aiPlaying = true
          const sentences = msg.sentences as string[]
          pl.playTurn(msg.speaker, config.lang === 'hi' ? 'hi' : 'en', sentences, {
            onSentence: (i) => setCaption({ speaker: msg.speaker, text: sentences.slice(0, i + 1).join(' ') }),
            onBlocked: () => notify('Your browser is blocking sound. Click anywhere on the page to turn it on.', 12000),
            onFallback: () => {
              if (!fellBack) { fellBack = true; notify('Voice service is slow, so browser speech is being used.') }
            },
          }).then((r) => {
            if (r === 'done') {
              if (mic.current) mic.current.aiPlaying = false
              client.current?.send({ type: 'playback_done', id })
            }
          })
          break
        }
        case 'transcript_update':
          setTranscript((t) => upsert(t, toLine(msg.entry)))
          break
        case 'interrupted':
          // Already stopped locally on speech_start; this covers a server-side interrupt too.
          pl.cancel()
          break
        case 'timer':
          setRemaining(msg.remaining)
          break
        case 'nudge':
          notify(msg.text, 8000)
          break
        case 'error':
          notify(msg.message, 10000)
          break
        case 'ended':
          onEndedRef.current((msg.transcript as Entry[]).map(toLine))
          break
      }
    }

    const c = new RoomClient(
      { type: 'start', config: { topic: config.topic, panel: config.panel, format: config.format, lang: config.lang, patience: patienceMs / 1000 } },
      handle,
      (s) => {
        setConnection(s)
        if (s === 'reconnecting') notify('Connection lost. Reconnecting…', 15000)
        if (s === 'open') setToast((t) => (t?.startsWith('Connection lost') ? null : t))
      },
    )
    client.current = c
    c.connect()
    if (new URLSearchParams(location.search).get('test') === '1') {
      ;(window as unknown as { __gd: object }).__gd = { drop: () => c.dropForTest() }
    }

    return () => {
      c.close()
      m.stop()
      pl.cancel()
      clearTimeout(toastTimer.current)
    }
    // The session is created once per room. Patience changes go through setPatience.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, notify])

  useEffect(() => {
    if (mic.current) mic.current.muted = observing || !micOn
  }, [observing, micOn])

  const ctl: RoomControls = {
    micOn,
    setMicOn: (on) => setMicOnState(on),
    micStatus,
    sendText: (text) => {
      const t = text.trim()
      if (!t) return
      const heard = player.current?.cancel()
      if (heard !== undefined) setInterrupts((n) => n + (heard > 0 ? 1 : 0))
      setCaption({ speaker: 'student', text: t })
      client.current?.send({ type: 'speech_start', heard_sentences: heard || undefined })
      client.current?.send({ type: 'student_text', text: t, final: true, complete: true })
    },
    setPatience: (ms) => client.current?.send({ type: 'set_patience', seconds: ms / 1000 }),
    end: () => client.current?.send({ type: 'end' }),
    connection,
    toast,
    observing,
  }

  return { state: { speaker, thinking, interrupts, caption, transcript, remaining }, ctl }
}
