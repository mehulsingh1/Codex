import { AnimatePresence, motion } from 'framer-motion'
import { levelBus } from '../audio/levelBus'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import Fallback2D from '../scene/Fallback2D'
import { getPersona } from '../personas'
import type { RoomConfig, RoomControls, RoomState, TranscriptLine } from '../types'
import { useRoom } from '../useRoom'
import { useRoomSim } from '../useRoomSim'
import { loadPrefs, savePrefs } from '../progress/store'
import { detectMode } from './mode'
import type { RenderMode } from './mode'

const Scene3D = lazy(() => import('../scene/Scene3D'))

const spring = { type: 'spring', stiffness: 120, damping: 18 } as const
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

interface Props {
  config: RoomConfig
  onEnd: (transcript: TranscriptLine[]) => void
  sim?: boolean
}

const inertControls: RoomControls = {
  micOn: true, setMicOn: () => {}, micStatus: 'on', sendText: () => {}, setPatience: () => {},
  end: () => {}, connection: 'open', toast: null, observing: false,
}

/** ?sim=1 runs the scripted simulator instead of the live backend (useful for UI work). */
export default function Room({ config, onEnd, sim }: Props) {
  return sim ? <SimRoom config={config} onEnd={onEnd} /> : <LiveRoom config={config} onEnd={onEnd} />
}

function SimRoom({ config, onEnd }: Props) {
  const state = useRoomSim(config)
  return <RoomView config={config} state={state} ctl={inertControls} onEnd={onEnd} />
}

function LiveRoom({ config, onEnd }: Props) {
  const { state, ctl } = useRoom(config, 1000, onEnd)
  return <RoomView config={config} state={state} ctl={ctl} onEnd={onEnd} />
}

function RoomView({ config, state, ctl, onEnd }: { config: RoomConfig; state: RoomState; ctl: RoomControls; onEnd: Props['onEnd'] }) {
  const [mode, setMode] = useState<RenderMode>(detectMode)
  const prefs = useRef(loadPrefs()).current
  const [capSize, setCapSize] = useState(prefs.capSize) // 0 small, 1 medium, 2 large
  const [ccOn, setCcOn] = useState(prefs.captionsOn)
  const [showTranscript, setShowTranscript] = useState(() => window.innerWidth >= 1500) // on narrower screens the card would cover the table
  const [typing, setTyping] = useState(false)
  const [draft, setDraft] = useState('')
  const { micOn, setMicOn } = ctl
  const [patience, setPatience] = useState(prefs.patience)
  useEffect(() => savePrefs({ capSize, captionsOn: ccOn, patience }), [capSize, ccOn, patience])
  const logRef = useRef<HTMLDivElement>(null)
  const micRef = useRef<HTMLButtonElement>(null)

  // Live mic level on the mic button, so it is obvious whether the mic can hear you.
  useEffect(() => {
    let raf = 0
    const tick = () => {
      micRef.current?.style.setProperty('--mic', levelBus.mic.toFixed(2))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
  }, [state.transcript.length])

  const toast = ctl.toast
  const noMic = ctl.micStatus === 'denied' || ctl.micStatus === 'unavailable'
  const showTyping = (typing || noMic) && !ctl.observing
  const ended = useRef(false)
  const endSession = () => {
    ctl.end()
    // If the server never confirms (connection lost), leave anyway with what we have.
    setTimeout(() => { if (!ended.current) { ended.current = true; onEnd(state.transcript) } }, 4000)
  }
  const submit = () => {
    ctl.sendText(draft)
    setDraft('')
  }

  const cap = state.caption
  const capPersona = cap ? getPersona(cap.speaker) : null
  const listening = micOn && !noMic && state.speaker === 'student'

  return (
    <div className="room" data-text={capSize}>
      <Suspense fallback={<div className="scene-loading">Setting the table…</div>}>
        {mode === '3d' ? (
          <Scene3D config={config} state={state} />
        ) : (
          <Fallback2D config={config} state={state} />
        )}
      </Suspense>
      <div className="vignette" />
      <AnimatePresence>
        {ctl.connection === 'connecting' && (
          <motion.div className="glass observe" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="status">Joining the room…</motion.div>
        )}
      </AnimatePresence>

      <motion.div className="glass timer" initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={spring}>
        <span className="timer-label">Time left</span>
        <span className="timer-value">{mmss(state.remaining)}</span>
      </motion.div>

      <motion.div className="glass notice" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={spring}>
        <span className="ai-badge">AI</span> All other participants are AI
      </motion.div>

      <AnimatePresence>
        {ctl.observing && (
          <motion.div className="glass observe" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={spring} role="status">
            <b>Fishbowl:</b> you are watching. The moderator will invite you in shortly.
          </motion.div>
        )}
      </AnimatePresence>

      {ccOn && <motion.aside
        className="glass captions"
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={spring}
        aria-live="polite"
      >
        <div className="card-title">Live captions</div>
        <div className="topic">{config.topic}</div>
        {!cap && <p className="muted cap-wait" role="status">{state.thinking ? `${getPersona(state.thinking).name} is thinking…` : 'The moderator is getting ready…'}</p>}
        <AnimatePresence mode="wait">
          {cap && capPersona && (
            <motion.div
              key={cap.speaker}
              className={`cap cap-${capSize}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={spring}
            >
              <div className="cap-who" style={{ color: 'var(--text)' }}>
                <span className="pill-dot" style={{ background: capPersona.color }} />
                {capPersona.name}
              </div>
              <p>{cap.text}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.aside>}

      <motion.aside
        className="glass transcript"
        initial={{ opacity: 0, x: 30 }}
        animate={{ opacity: 1, x: 0, height: showTranscript ? 'auto' : 52 }}
        transition={spring}
      >
        <button className="card-head" onClick={() => setShowTranscript((v) => !v)} aria-expanded={showTranscript}>
          <span className="card-title">Transcript</span>
          <span aria-hidden>{showTranscript ? '–' : '+'}</span>
        </button>
        {showTranscript && (
          <div className="log" ref={logRef}>
            <AnimatePresence initial={false}>
              {state.transcript.map((l) => {
                const p = getPersona(l.speaker)
                return (
                  <motion.div key={l.id} className="line" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
                    <div className="line-meta">
                      <span className="pill-dot" style={{ background: p.color }} />
                      {p.name} <span className="muted">· {mmss(Math.floor(l.t))}</span>
                      {l.interrupted && <span className="tag">interrupted</span>}
                    </div>
                    <div>{l.text}</div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
            {state.transcript.length === 0 && <div className="muted">The discussion will appear here.</div>}
          </div>
        )}
      </motion.aside>

      <AnimatePresence>
        {toast && (
          <motion.div className="glass toast" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} transition={spring} role="status">
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showTyping && (
          <motion.form
            className="glass typebar"
            initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} transition={spring}
            onSubmit={(e) => { e.preventDefault(); submit() }}
          >
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Type what you would say, then press Enter" aria-label="Type your answer" autoFocus />
            <button type="submit" disabled={!draft.trim()}>Send</button>
          </motion.form>
        )}
      </AnimatePresence>

      <motion.div className="glass dock" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={spring}>
        <button
          ref={micRef}
          className={`mic${micOn && !noMic && !ctl.observing ? '' : ' off'}${listening ? ' listening' : ''}`}
          disabled={ctl.observing}
          onClick={() => (noMic ? setTyping(true) : setMicOn(!micOn))}
          aria-pressed={micOn}
          aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'}
        >
          <span className="ripple" /><span className="ripple r2" />
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="3" width="6" height="12" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
            {(!micOn || noMic) && <path d="M4 4l16 16" />}
          </svg>
        </button>
        <label className="patience">
          <span>Patience <b>{(patience / 1000).toFixed(1)}s</b></span>
          <input type="range" min={600} max={2000} step={100} value={patience} onChange={(e) => { setPatience(+e.target.value); ctl.setPatience(+e.target.value) }} />
        </label>
        <button className="dock-btn" onClick={() => setCcOn((v) => !v)} aria-pressed={ccOn} aria-label="Toggle live captions">CC</button>
        <button className="dock-btn" onClick={() => setCapSize((capSize + 1) % 3)} aria-label="Change text size">Aa</button>
        <button className="dock-btn" onClick={() => setMode(mode === '3d' ? '2d' : '3d')} aria-label="Toggle 2D or 3D view">{mode === '3d' ? '2D' : '3D'}</button>
        <button className="dock-btn" onClick={() => setTyping((v) => !v)} aria-pressed={showTyping} aria-label="Type instead of speaking">Type</button>
        <button className="end" onClick={endSession}>End session</button>
      </motion.div>
    </div>
  )
}
