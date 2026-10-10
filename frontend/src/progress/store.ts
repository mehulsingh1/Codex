import type { ReportData } from '../report/api'
import type { TranscriptLine } from '../types'

export interface SessionSummary {
  id: string
  at: string // ISO date
  topic: string
  lang: string
  format: string
  overall: number
  scores: Record<string, number | null>
  studentShare: number // 0..1
  studentWords: number
  fillersPer100: number
  cutOffAi: number
}

const KEY = 'gd-arena-sessions'
const MAX = 30

export function loadSessions(): SessionSummary[] {
  try {
    const raw = localStorage.getItem(KEY)
    const list = raw ? (JSON.parse(raw) as SessionSummary[]) : []
    return Array.isArray(list) ? list : []
  } catch {
    return [] // storage blocked or corrupted: just show no history
  }
}

export function clearSessions() {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}

const FILLERS = /\b(um+|uh+|erm?|you know|basically|i mean|sort of|kind of)\b/gi

export function summarise(id: string, topic: string, lang: string, format: string, transcript: TranscriptLine[], r: ReportData): SessionSummary | null {
  if (r.overall == null) return null
  const mine = transcript.filter((l) => l.speaker === 'student').map((l) => l.text).join(' ')
  const words = mine.split(/\s+/).filter(Boolean).length
  return {
    id, at: new Date().toISOString(), topic, lang, format,
    overall: r.overall,
    scores: Object.fromEntries(r.categories.map((c) => [c.key, c.score])),
    studentShare: r.shares.find((s) => s.speaker === 'student')?.share ?? 0,
    studentWords: words,
    fillersPer100: words ? ((mine.match(FILLERS)?.length ?? 0) / words) * 100 : 0,
    cutOffAi: Number(r.stats.times_student_cut_off_ai ?? 0),
  }
}

/** Saves once per session id (a re-render or "generate again" must not add a duplicate). */
export function saveSession(s: SessionSummary) {
  try {
    const list = loadSessions().filter((x) => x.id !== s.id)
    localStorage.setItem(KEY, JSON.stringify([...list, s].slice(-MAX)))
  } catch { /* storage full or blocked: progress just is not kept */ }
}

/** Small preferences (caption size, captions on/off, patience) kept per browser. */
export interface Prefs { capSize: number; captionsOn: boolean; patience: number }
const PREFS = 'gd-arena-prefs'
export const defaultPrefs: Prefs = { capSize: 1, captionsOn: true, patience: 1000 }

export function loadPrefs(): Prefs {
  try {
    return { ...defaultPrefs, ...(JSON.parse(localStorage.getItem(PREFS) ?? '{}') as Partial<Prefs>) }
  } catch {
    return defaultPrefs
  }
}

export function savePrefs(p: Prefs) {
  try { localStorage.setItem(PREFS, JSON.stringify(p)) } catch { /* ignore */ }
}
