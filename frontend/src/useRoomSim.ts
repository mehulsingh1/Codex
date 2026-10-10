import { useEffect, useRef, useState } from 'react'
import { levelBus } from './audio/levelBus'
import { rosterIds } from './personas'
import type { RoomConfig, RoomState, TranscriptLine } from './types'

const LINES: Record<string, string[]> = {
  dominator: [
    'Let me be direct. This is not even a debate, the answer is obvious and we should move on.',
    'Sorry to cut in, but that is exactly the weak point in that argument.',
  ],
  data: [
    'The numbers back a more nuanced view. Roughly sixty percent of surveyed firms report mixed results.',
    'Building on that, a 2023 study showed the effect is real but uneven across sectors.',
  ],
  quiet: ['One thing nobody has said: we are all assuming the same definition. That changes the whole answer.'],
  drifter: ['This reminds me of how cricket coaching works, honestly. Same pressure, same timing.'],
  diplomat: ['I think you are both right in part. Can we agree the real question is how, not whether?'],
}
const STUDENT_LINES = [
  'I would like to start by defining the topic so we all argue about the same thing.',
  'Building on Meera, I think the data points to a conditional answer, not a yes or no.',
]

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Scripted stand-in for the WebSocket session. Produces the same RoomState the real client will. */
export function useRoomSim(config: RoomConfig | null, seconds = 8 * 60): RoomState {
  const [speaker, setSpeaker] = useState<string | null>(null)
  const [thinking, setThinking] = useState<string | null>(null)
  const [interrupts, setInterrupts] = useState(0)
  const [caption, setCaption] = useState<RoomState['caption']>(null)
  const [transcript, setTranscript] = useState<TranscriptLine[]>([])
  const [remaining, setRemaining] = useState(seconds)
  const speakerRef = useRef<string | null>(null)

  useEffect(() => {
    if (!config) return
    let dead = false
    const ai = rosterIds(config)
    const t0 = Date.now()
    let lineId = 0
    const used: Record<string, number> = {}
    const next = (id: string) => {
      const pool = id === 'student' ? STUDENT_LINES : id === 'moderator' ? [`Welcome everyone. Today's topic: ${config.topic}. Share your views and build on each other. You have eight minutes.`] : LINES[id]
      const i = (used[id] = (used[id] ?? -1) + 1)
      return pool[i % pool.length]
    }

    const say = async (who: string, interruptAt?: number) => {
      setThinking(who)
      await wait(who === 'student' ? 200 : 1100)
      if (dead) return
      setThinking(null)
      setSpeaker(who)
      speakerRef.current = who
      const words = next(who).split(' ')
      const stop = interruptAt ? Math.floor(words.length * interruptAt) : words.length
      const startT = (Date.now() - t0) / 1000
      for (let i = 1; i <= stop; i++) {
        if (dead) return
        setCaption({ speaker: who, text: words.slice(0, i).join(' ') })
        await wait(170)
      }
      const text = words.slice(0, stop).join(' ') + (interruptAt ? '…' : '')
      setTranscript((tr) => [...tr, { id: lineId++, speaker: who, text, t: startT, interrupted: !!interruptAt }])
      if (interruptAt) setInterrupts((n) => n + 1)
      await wait(interruptAt ? 150 : 500)
    }

    ;(async () => {
      await wait(800)
      await say('moderator')
      while (!dead) {
        await say(ai[0])
        await say(ai[1])
        await say('student')
        await say(ai[2 % ai.length], 0.5) // student barges in mid-sentence
        await say('student')
        await say(ai[3 % ai.length])
        await say(ai[4 % ai.length])
        setSpeaker(null)
        await wait(1500) // a silent beat
      }
    })()

    const timer = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000)
    return () => { dead = true; clearInterval(timer) }
  }, [config])

  // Fake audio levels so the glow rings pulse. The real client replaces this with AnalyserNode readings.
  useEffect(() => {
    const id = setInterval(() => {
      const t = performance.now() / 1000
      const wave = 0.35 + 0.35 * Math.abs(Math.sin(t * 7.3)) + 0.2 * Math.random()
      const s = speakerRef.current
      levelBus.speaker = s && s !== 'student' ? Math.min(1, wave) : 0
      levelBus.mic = s === 'student' ? Math.min(1, wave) : 0
    }, 33)
    return () => clearInterval(id)
  }, [])

  return { speaker, thinking, interrupts, caption, transcript, remaining }
}
