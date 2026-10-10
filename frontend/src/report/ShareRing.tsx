import { motion } from 'framer-motion'
import { useState } from 'react'
import type { Share } from './api'

// Chart colours: deeper variants of the persona hues, validated for lightness band, chroma and
// colour-blind separation. Fixed per person (colour follows the entity, never the rank). The
// moderator is a deliberate neutral gray. The ring order below keeps red and green apart.
export const CHART_COLORS: Record<string, string> = {
  student: '#0A8F9C',
  dominator: '#C4553A',
  quiet: '#3B66C0',
  data: '#6A9A2F',
  diplomat: '#9150B8',
  drifter: '#D08A1F',
  moderator: '#8A8478',
}
const ORDER = ['student', 'dominator', 'quiet', 'data', 'diplomat', 'drifter', 'moderator']

const SIZE = 240
const R = 92
const STROKE = 26
const GAP_PX = 2 // surface gap between touching segments
const C = 2 * Math.PI * R

const pct = (x: number) => `${Math.round(x * 100)}%`
const mins = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`)

export default function ShareRing({ shares }: { shares: Share[] }) {
  const [hover, setHover] = useState<string | null>(null)
  const [table, setTable] = useState(false)
  const ordered = ORDER.map((id) => shares.find((s) => s.speaker === id)).filter((s): s is Share => !!s)
  const ranked = [...shares].sort((a, b) => b.share - a.share)
  const you = shares.find((s) => s.speaker === 'student')
  const focus = hover ? shares.find((s) => s.speaker === hover) : you

  let offset = 0
  const arcs = ordered.map((s) => {
    const len = Math.max(0, s.share * C - GAP_PX)
    const arc = { s, len, start: offset }
    offset += s.share * C
    return arc
  })

  return (
    <div className="share">
      <div className="share-head">
        <h3>Who spoke</h3>
        <button className="link-btn" onClick={() => setTable((v) => !v)} aria-pressed={table}>{table ? 'View chart' : 'View as table'}</button>
      </div>

      {table ? (
        <table className="share-table">
          <thead><tr><th>Speaker</th><th>Share</th><th>Time</th><th>Words</th></tr></thead>
          <tbody>
            {ranked.map((s) => (
              <tr key={s.speaker}><td>{s.name}</td><td>{pct(s.share)}</td><td>{mins(s.seconds)}</td><td>{s.words}</td></tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="share-body">
          <div className="ring" role="img" aria-label={`Speaking share: ${ranked.map((s) => `${s.name} ${pct(s.share)}`).join(', ')}`}>
            <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE}>
              <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="rgba(120,100,70,0.12)" strokeWidth={STROKE} />
              <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
                {arcs.map(({ s, len, start }, i) => (
                  <motion.circle
                    key={s.speaker}
                    cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none"
                    stroke={CHART_COLORS[s.speaker] ?? '#8A8478'}
                    strokeWidth={hover === s.speaker ? STROKE + 4 : STROKE}
                    strokeDashoffset={-start}
                    initial={{ strokeDasharray: `0 ${C}` }}
                    animate={{ strokeDasharray: `${len} ${C - len}` }}
                    transition={{ type: 'spring', stiffness: 60, damping: 18, delay: 0.15 + i * 0.08 }}
                    onMouseEnter={() => setHover(s.speaker)}
                    onMouseLeave={() => setHover(null)}
                    style={{ cursor: 'default' }}
                  />
                ))}
              </g>
            </svg>
            <div className="ring-center">
              <div className="ring-pct">{focus ? pct(focus.share) : '0%'}</div>
              <div className="ring-name">{focus?.name ?? 'You'}</div>
              {focus && <div className="ring-sub">{mins(focus.seconds)} · {focus.words} words</div>}
            </div>
          </div>

          <ul className="legend" onMouseLeave={() => setHover(null)}>
            {ranked.map((s) => (
              <li key={s.speaker} className={hover === s.speaker ? 'on' : ''} onMouseEnter={() => setHover(s.speaker)} tabIndex={0} onFocus={() => setHover(s.speaker)} onBlur={() => setHover(null)}>
                <span className="swatch" style={{ background: CHART_COLORS[s.speaker] ?? '#8A8478' }} />
                <span className="legend-name">{s.name}{s.speaker !== 'student' && <span className="ai-badge">AI</span>}</span>
                <span className="legend-val">{pct(s.share)}</span>
                <span className="legend-bar"><motion.i initial={{ width: 0 }} animate={{ width: `${s.share * 100}%` }} transition={{ type: 'spring', stiffness: 80, damping: 18, delay: 0.3 }} style={{ background: CHART_COLORS[s.speaker] ?? '#8A8478' }} /></span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
