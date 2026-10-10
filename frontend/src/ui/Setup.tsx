import { AnimatePresence, motion } from 'framer-motion'
import { useRef, useState } from 'react'
import BgVideo from '../landing/BgVideo'
import Icon from '../landing/icons'
import { Logo } from '../landing/Landing'
import { TOPICS } from '../personas'
import Progress from '../progress/Progress'
import { loadSessions } from '../progress/store'
import type { RoomConfig } from '../types'

const spring = { type: 'spring', stiffness: 120, damping: 18 } as const
const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)]

// Three suggestions, one from each of three categories, different every visit.
const SUGGEST_FROM = ['Current affairs', 'Abstract', 'Case-based']
const suggestions = () => SUGGEST_FROM.map((c) => pick(TOPICS.filter((t) => t.category === c)))

function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; label: string
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.v} role="radio" aria-checked={value === o.v} className={value === o.v ? 'on' : ''} onClick={() => onChange(o.v)}>
          {value === o.v && <motion.span layoutId={`seg-${label}`} className="seg-bg" transition={spring} />}
          <span className="seg-label">{o.label}</span>
        </button>
      ))}
    </div>
  )
}

export default function Setup({ onStart, onHome }: { onStart: (c: RoomConfig) => void; onHome: () => void }) {
  const [ideas] = useState(suggestions)
  const [topic, setTopic] = useState(ideas[0].text)
  const [panel, setPanel] = useState(4)
  const [format, setFormat] = useState<RoomConfig['format']>('standard')
  const [lang, setLang] = useState<RoomConfig['lang']>('en')
  const [shuffling, setShuffling] = useState(false)
  const [pulse, setPulse] = useState(0)
  const timer = useRef(0)
  const history = loadSessions().length

  const ready = topic.trim().length > 2

  // The magic wand: flick through a few random topics, then settle on one.
  const surprise = () => {
    if (shuffling) return
    setShuffling(true)
    let n = 0
    clearInterval(timer.current)
    timer.current = window.setInterval(() => {
      n++
      setTopic(pick(TOPICS).text)
      if (n >= 9) {
        clearInterval(timer.current)
        setShuffling(false)
        setPulse((p) => p + 1) // nudge the start button
      }
    }, 80)
  }

  return (
    <div className="start-page">
      <BgVideo name="table" eager />
      <div className="start-veil" />

      <header className="start-top">
        <Logo onClick={onHome} />
        <button className="btn btn-glass btn-sm" onClick={onHome}><Icon name="back" size={16} /> Home</button>
      </header>

      <main className="start-main">
        <motion.div className="glass start-card" initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
          <h1>What will you discuss?</h1>
          <p className="start-sub">Pick a topic, type your own, or let the wand choose. Then join the table.</p>

          <div className="ideas" role="radiogroup" aria-label="Suggested topics">
            {ideas.map((t) => {
              const on = topic === t.text
              return (
                <button key={t.text} role="radio" aria-checked={on} className={`idea${on ? ' on' : ''}`} onClick={() => setTopic(t.text)}>
                  <span className="idea-cat">{t.category}</span>
                  <span className="idea-text">{t.text}</span>
                  <AnimatePresence>
                    {on && <motion.span className="idea-check" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={spring}><Icon name="check" size={14} stroke={2.4} /></motion.span>}
                  </AnimatePresence>
                </button>
              )
            })}
          </div>

          <div className={`topic-field${shuffling ? ' shuffling' : ''}`}>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Type your own topic…"
              aria-label="Your discussion topic"
              maxLength={140}
            />
            <button className="wand" onClick={surprise} disabled={shuffling} aria-label="Surprise me with a random topic" title="Surprise me with a random topic">
              <Icon name="wand" size={20} />
              <span>Surprise me</span>
            </button>
          </div>

          <div className="opts">
            <div className="opt">
              <span className="opt-label">Panel</span>
              <div className="stepper compact">
                <button onClick={() => setPanel((p) => Math.max(3, p - 1))} disabled={panel <= 3} aria-label="Fewer AI participants">–</button>
                <motion.span key={panel} initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={spring} className="stepper-n">{panel}</motion.span>
                <button onClick={() => setPanel((p) => Math.min(5, p + 1))} disabled={panel >= 5} aria-label="More AI participants">+</button>
              </div>
            </div>
            <div className="opt">
              <span className="opt-label">Format</span>
              <Segmented label="Format" value={format} onChange={setFormat} options={[{ v: 'standard', label: 'Standard' }, { v: 'fishbowl', label: 'Fishbowl' }]} />
            </div>
            <div className="opt">
              <span className="opt-label">Language</span>
              <Segmented label="Language" value={lang} onChange={setLang} options={[{ v: 'en', label: 'English' }, { v: 'hi', label: 'Hinglish' }]} />
            </div>
          </div>

          <motion.button
            key={pulse}
            className="btn btn-dark start-btn"
            disabled={!ready || shuffling}
            onClick={() => onStart({ topic: topic.trim(), panel, format, lang })}
            animate={pulse ? { scale: [1, 1.04, 1] } : undefined}
            transition={{ duration: 0.5 }}
          >
            Enter the room <Icon name="arrow" size={18} />
          </motion.button>

          <div className="start-foot">
            <span className="notice inline"><span className="ai-badge">AI</span> All other participants are AI</span>
          </div>

          {history > 0 && (
            <details className="progress-fold">
              <summary>Your progress <span className="muted">· {history} session{history > 1 ? 's' : ''} on this device</span></summary>
              <Progress />
            </details>
          )}
        </motion.div>
      </main>
    </div>
  )
}
