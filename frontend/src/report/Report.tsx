import { motion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getPersona } from '../personas'
import type { RoomConfig, TranscriptLine } from '../types'
import { fetchReport, mmss } from './api'
import type { ReportData } from './api'
import { saveSession, summarise } from '../progress/store'
import { pointsFor } from '../leaderboard/data'
import ShareRing, { CHART_COLORS } from './ShareRing'

const spring = { type: 'spring', stiffness: 120, damping: 18 } as const
const rise = (i: number) => ({ initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { ...spring, delay: 0.05 * i } })

interface Props {
  config: RoomConfig
  transcript: TranscriptLine[]
  onBack: () => void
}

interface Focus { id: number; quote: string }

/** Wraps the quoted words in <mark> inside a transcript line (the quote is verbatim, so a plain search works). */
function Highlighted({ text, quote }: { text: string; quote?: string }) {
  const i = quote ? text.indexOf(quote) : -1
  if (!quote || i < 0) return <>{text}</>
  return <>{text.slice(0, i)}<mark>{quote}</mark>{text.slice(i + quote.length)}</>
}

export default function Report({ config, transcript, onBack }: Props) {
  const [data, setData] = useState<ReportData | null>(null)
  const [failed, setFailed] = useState(false)
  const [focus, setFocus] = useState<Focus | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  const load = useCallback(() => {
    setData(null)
    setFailed(false)
    fetchReport(config.topic, transcript).then(setData).catch(() => setFailed(true))
  }, [config.topic, transcript])
  useEffect(load, [load])

  // Keep a small summary on this device for the progress panel. Keyed per session so reloads do not duplicate it.
  const sessionKey = useRef(`${Date.now()}`)
  useEffect(() => {
    if (!data) return
    const s = summarise(sessionKey.current, config.topic, config.lang, config.format, transcript, data)
    if (s) saveSession(s)
  }, [data, config, transcript])

  const jump = (id: number, quote: string) => {
    setFocus({ id, quote })
    document.getElementById(`line-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const Chip = ({ id, quote, t }: { id: number; quote: string; t: number }) => (
    <button className="quote-chip" onClick={() => jump(id, quote)} title="Show this in the transcript">
      <span className="quote-text">“{quote}”</span>
      <span className="quote-time">{mmss(t)}</span>
    </button>
  )

  return (
    <div className="report">
      <header className="report-top">
        <button className="dock-btn" onClick={onBack}>← New session</button>
        <div className="notice inline"><span className="ai-badge">AI</span> Feedback is AI-written. Quotes come straight from your transcript.</div>
      </header>

      <div className="report-grid">
        <main className="report-main">
          <motion.section className="glass r-card r-hero" {...rise(0)}>
            <div className="card-title">Your discussion report</div>
            <h1>{config.topic}</h1>
            {data?.overall != null && (
              <div className="hero-score"><span className="hero-num">{data.overall.toFixed(1)}</span><span className="hero-of">/ 10 overall</span><span className="muted"> · +{pointsFor(data.overall)} leaderboard points</span></div>
            )}
            {data && <p className="hero-summary">{data.summary}</p>}
            {!data && !failed && <p className="muted" role="status">Reading your discussion and checking every quote…</p>}
            {failed && (
              <p role="alert">We couldn&apos;t reach the report service. <button className="link-btn" onClick={load}>Try again</button></p>
            )}
            {data?.error && (
              <p role="alert">{data.error} <button className="link-btn" onClick={load}>Generate again</button></p>
            )}
          </motion.section>

          {data ? (
            <motion.section className="glass r-card" {...rise(1)}><ShareRing shares={data.shares} /></motion.section>
          ) : (
            <div className="glass r-card skeleton" aria-hidden />
          )}

          {data && data.categories.length > 0 && (
            <div className="cat-grid">
              {data.categories.map((c, i) => (
                <motion.section key={c.key} className="glass r-card cat" {...rise(2 + i)}>
                  <div className="cat-head">
                    <h3>{c.label}</h3>
                    {c.score != null ? <span className="cat-score">{c.score}<small>/10</small></span> : <span className="cat-score none">–</span>}
                  </div>
                  {c.score != null && (
                    <div className="meter" aria-hidden><motion.i initial={{ width: 0 }} animate={{ width: `${c.score * 10}%` }} transition={{ ...spring, delay: 0.3 + i * 0.05 }} /></div>
                  )}
                  <p className="cat-summary">{c.summary}</p>
                  {c.points.map((p, j) => (
                    <div key={j} className="point">
                      <p>{p.text}</p>
                      <Chip id={p.line_id} quote={p.quote} t={p.t} />
                    </div>
                  ))}
                </motion.section>
              ))}
            </div>
          )}

          {data && data.missed.length > 0 && (
            <motion.section className="glass r-card" {...rise(8)}>
              <h3>What you could have said</h3>
              <div className="missed-grid">
                {data.missed.map((m, i) => (
                  <div key={i} className="missed">
                    <div className="missed-n">{i + 1}</div>
                    {m.line_id != null && m.t != null && (
                      <div className="missed-when"><span className="muted">When {getPersona(m.speaker).name} said</span><Chip id={m.line_id} quote={m.quote} t={m.t} /></div>
                    )}
                    <p className="missed-say">“{m.suggestion}”</p>
                  </div>
                ))}
              </div>
            </motion.section>
          )}

          {!data && !failed && (
            <>
              <div className="glass r-card skeleton tall" aria-hidden />
              <div className="glass r-card skeleton" aria-hidden />
            </>
          )}
        </main>

        <aside className="glass r-transcript">
          <div className="card-title" style={{ padding: '18px 20px 8px' }}>Transcript</div>
          <div className="log" ref={logRef}>
            {transcript.map((l) => {
              const p = getPersona(l.speaker)
              return (
                <div key={l.id} id={`line-${l.id}`} className={`tline${focus?.id === l.id ? ' flash' : ''}`}>
                  <div className="line-meta">
                    <span className="swatch round" style={{ background: CHART_COLORS[l.speaker] ?? '#8A8478' }} />
                    {p.name} <span className="muted">· {mmss(l.t)}</span>
                    {l.interrupted && <span className="tag">interrupted</span>}
                  </div>
                  <div><Highlighted text={l.text} quote={focus?.id === l.id ? focus.quote : undefined} /></div>
                </div>
              )
            })}
          </div>
        </aside>
      </div>
    </div>
  )
}
