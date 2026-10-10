import type { RoomConfig, TranscriptLine } from '../types'

/** Fixed sample so the report screen can be previewed (?demo=report) without running a session. */
export const SAMPLE_CONFIG: RoomConfig = { topic: 'Should India adopt a four-day work week?', panel: 3, format: 'standard', lang: 'en' }

const L = (id: number, speaker: string, text: string, t: number, tEnd: number, interrupted = false): TranscriptLine =>
  ({ id, speaker, text, t, tEnd, interrupted })

export const SAMPLE_TRANSCRIPT: TranscriptLine[] = [
  L(0, 'moderator', 'Welcome everyone. Our topic is whether India should adopt a four-day work week. Arjun, you may start.', 0, 6),
  L(1, 'dominator', "Four days will cripple productivity; companies will lose about 20% output, and India can't afford that lag.", 7, 13),
  L(2, 'data', 'Actually, trials in similar economies showed only a small dip in output initially, which recovered within months as firms restructured tasks.', 14, 22),
  L(3, 'student', 'I would start by defining productivity: output per hour, not hours at a desk. Um, so I think the four day week can work.', 24, 33),
  L(4, 'moderator', 'Student, could you elaborate on how you would measure output per hour in Indian firms?', 34, 40),
  L(5, 'dominator', 'Student, even if you measure output per hour, cutting a day forces longer shifts and fatigue.', 41, 45, true),
  L(6, 'student', 'Building on Meera, a four day week works best where output is measurable, so we should pilot it by sector.', 45.5, 52),
  L(7, 'quiet', 'If we only look at sector pilots, we miss the hidden cost of coordinating supply chains that rely on a five-day rhythm.', 53, 60),
  L(8, 'moderator', 'We now begin the closing round. Please give a one sentence final statement.', 61, 66),
  L(9, 'student', 'To conclude, a sector by sector pilot is the responsible path.', 68, 72),
]
