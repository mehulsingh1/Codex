import { motion } from 'framer-motion'
import { useState } from 'react'
import { clearSessions, loadSessions } from './store'
import type { SessionSummary } from './store'

const LABELS: Record<string, string> = {
  opening: 'Opening', ideas: 'Ideas', building: 'Building on others',
  listening: 'Listening', interruptions: 'Handling interruptions', closing: 'Ending strongly',
}
const INK = '#0A8F9C' // single series, so one validated hue

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

/** Last 3 sessions versus the ones before them. Positive delta = the number went up. */
function trend(values: number[]): number | null {
  if (values.length < 4) return null
  const recent = avg(values.slice(-3))!
  const before = avg(values.slice(0, -3))!
  return recent - before
}

function Arrow({ delta, goodWhenUp, unit = '' }: { delta: number | null; goodWhenUp: boolean; unit?: string }) {
  if (delta == null || Math.abs(delta) < 0.05) return <span className="muted">steady</span>
  const good = goodWhenUp ? delta > 0 : delta < 0
  return (
    <span className={`delta ${good ? 'good' : 'bad'}`}>
      {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}{unit} <span className="sr-only">{good ? 'improving' : 'getting worse'}</span>
    </span>
  )
}

function Line({ points }: { points: number[] }) {
  const W = 300, H = 84, PAD = 14
  const x = (i: number) => PAD + (i * (W - PAD * 2 - 24)) / Math.max(1, points.length - 1)
  const y = (v: number) => H - PAD - (v / 10) * (H - PAD * 2)
  const d = points.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ')
  const last = points.length - 1
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Overall score over your last ${points.length} sessions, now ${points[last].toFixed(1)} out of 10`}>
      <line x1={PAD} x2={W - PAD} y1={y(0)} y2={y(0)} stroke="rgba(120,100,70,0.25)" />
      <motion.path d={d} fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: 'easeOut' }} />
      <circle cx={x(last)} cy={y(points[last])} r={5} fill={INK} stroke="#FBF7EF" strokeWidth={2} />
      <text x={x(last) + 10} y={y(points[last]) + 4} fontSize="13" fontWeight="700" fill="#2B2620">{points[last].toFixed(1)}</text>
    </svg>
  )
}

export default function Progress() {
  const [sessions, setSessions] = useState<SessionSummary[]>(loadSessions)
  if (sessions.length === 0) return null

  const overall = sessions.map((s) => s.overall)
  const catAvg = Object.keys(LABELS)
    .map((k) => ({ k, v: avg(sessions.map((s) => s.scores[k]).filter((v): v is number => v != null)) }))
    .filter((c): c is { k: string; v: number } => c.v != null)
    .sort((a, b) => b.v - a.v)
  const strengths = catAvg.slice(0, 2)
  const focus = catAvg.length > 2 ? catAvg[catAvg.length - 1] : null

  return (
    <section className="progress" aria-labelledby="progress-h">
      <div className="progress-head">
        <h2 id="progress-h">Your progress</h2>
        <span className="muted">{sessions.length} session{sessions.length > 1 ? 's' : ''} saved on this device</span>
        <button className="link-btn" onClick={() => { clearSessions(); setSessions([]) }}>Clear</button>
      </div>
      <div className="progress-grid">
        <div>
          <div className="mini-label">Overall score</div>
          {overall.length >= 2 ? <Line points={overall} /> : <p className="muted">Complete one more session to see a trend.</p>}
        </div>
        <div className="habits">
          <div className="mini-label">Strengths</div>
          <p>{strengths.map((s) => `${LABELS[s.k]} (${s.v.toFixed(1)})`).join(' · ') || 'Not enough data yet'}</p>
          {focus && <><div className="mini-label">Work on</div><p>{LABELS[focus.k]} ({focus.v.toFixed(1)})</p></>}
        </div>
        <div className="habits">
          <div className="mini-label">Habits (last 3 vs earlier)</div>
          <div className="habit"><span>Talk share</span><Arrow delta={(() => { const t = trend(sessions.map((s) => s.studentShare * 100)); return t })()} goodWhenUp unit="%" /></div>
          <div className="habit"><span>Filler words / 100</span><Arrow delta={trend(sessions.map((s) => s.fillersPer100))} goodWhenUp={false} /></div>
          <div className="habit"><span>Cut off an AI</span><Arrow delta={trend(sessions.map((s) => s.cutOffAi))} goodWhenUp={false} /></div>
          <div className="habit"><span>Words spoken</span><Arrow delta={trend(sessions.map((s) => s.studentWords))} goodWhenUp unit="" /></div>
          {sessions.length < 4 && <p className="muted tiny">Trends appear after 4 sessions.</p>}
        </div>
      </div>
    </section>
  )
}
