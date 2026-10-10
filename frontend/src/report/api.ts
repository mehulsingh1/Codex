import { apiUrl } from '../api'
import type { TranscriptLine } from '../types'

export interface Share { speaker: string; name: string; seconds: number; words: number; share: number }
export interface Point { text: string; quote: string; line_id: number; t: number; speaker: string }
export interface Category { key: string; label: string; score: number | null; summary: string; points: Point[] }
export interface Missed { suggestion: string; quote: string; line_id: number | null; t: number | null; speaker: string }

export interface ReportData {
  empty: boolean
  error: string | null
  overall: number | null
  summary: string
  shares: Share[]
  stats: Record<string, number | null>
  categories: Category[]
  missed: Missed[]
  dropped: number
}

export async function fetchReport(topic: string, transcript: TranscriptLine[]): Promise<ReportData> {
  const body = {
    topic,
    transcript: transcript.map((l) => ({
      id: l.id, speaker: l.speaker, text: l.text, t_start: l.t, t_end: l.tEnd ?? null, interrupted: !!l.interrupted,
    })),
  }
  const r = await fetch(apiUrl('/report'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(`report failed (${r.status})`)
  return (await r.json()) as ReportData
}

export const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`
