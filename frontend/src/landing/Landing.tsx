import { motion } from 'framer-motion'
import { FAQ, FEATURES, NAV, PERSONAS, STEPS } from './content'
import BgVideo from './BgVideo'
import Icon from './icons'
import './landing.css'

const spring = { type: 'spring', stiffness: 120, damping: 18 } as const
const reveal = (delay = 0) => ({
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { ...spring, delay },
})

export function Logo({ onClick }: { onClick?: () => void }) {
  return (
    <button className="logo" onClick={onClick} aria-label="GD Arena home">
      <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
        <ellipse cx="16" cy="18" rx="11" ry="6.5" fill="#EADFCB" stroke="#2B2620" strokeWidth="1.6" />
        <circle cx="16" cy="6.5" r="3" fill="#C4553A" /><circle cx="5.5" cy="13" r="3" fill="#6A9A2F" /><circle cx="26.5" cy="13" r="3" fill="#3B66C0" />
        <circle cx="9" cy="26" r="3" fill="#D08A1F" /><circle cx="23" cy="26" r="3" fill="#0A8F9C" />
      </svg>
      <span>GD Arena</span>
    </button>
  )
}

export default function Landing({ onStart, onBoard }: { onStart: () => void; onBoard: () => void }) {
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="landing">
      <header className="nav glass">
        <Logo onClick={() => document.querySelector('.landing')?.scrollTo({ top: 0, behavior: 'smooth' })} />
        <nav aria-label="Main">
          {NAV.map((n) => (
            <a key={n.id} href={`#${n.id}`} onClick={(e) => { e.preventDefault(); go(n.id) }}>{n.label}</a>
          ))}
          <a href="#/leaderboard" onClick={(e) => { e.preventDefault(); onBoard() }}>Leaderboard</a>
        </nav>
        <button className="btn btn-dark btn-sm" onClick={onStart}>Start free</button>
      </header>

      <main>
        {/* ---------- hero ---------- */}
        <section className="hero" aria-labelledby="hero-h">
          <BgVideo name="hero" eager />
          <div className="hero-veil" />
          <div className="hero-inner">
            <motion.div className="glass hero-card" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
              <div className="eyebrow"><span className="ai-badge">AI</span> Placement GD practice</div>
              <h1 id="hero-h">Practise group discussions out loud.</h1>
              <p className="hero-sub">Join a live round with a moderator and AI participants, then get feedback that quotes your own words.</p>
              <div className="hero-cta">
                <button className="btn btn-dark" onClick={onStart}>Start practising <Icon name="arrow" size={18} /></button>
                <button className="btn btn-glass" onClick={() => go('how')}><Icon name="play" size={16} /> See how it works</button>
              </div>
              <ul className="hero-points" aria-label="Highlights">
                <li><Icon name="check" size={16} /> Free, no sign-up</li>
                <li><Icon name="check" size={16} /> English &amp; Hinglish</li>
                <li><Icon name="check" size={16} /> Speak or type</li>
              </ul>
            </motion.div>

            <motion.aside className="glass hero-demo" aria-label="Example of a live round" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring, delay: 0.25 }}>
              <div className="demo-top"><span className="live-dot" /> Live round <span className="muted">· 05:12 left</span></div>
              <div className="demo-line"><span className="dot" style={{ background: '#C4553A' }} /><b>Arjun</b> <span className="ai-badge">AI</span><p>Sorry, but the numbers speak for themselves.</p></div>
              <div className="demo-line you"><span className="dot" style={{ background: '#0A8F9C' }} /><b>You</b> <span className="tag">interrupted Arjun</span><p>Let me define productivity first, then we can compare.</p></div>
              <div className="demo-line"><span className="dot" style={{ background: '#6A9A2F' }} /><b>Meera</b> <span className="ai-badge">AI</span><p>Building on that, the evidence is more mixed.</p></div>
            </motion.aside>
          </div>
        </section>

        {/* ---------- how it works ---------- */}
        <section id="how" className="section" aria-labelledby="how-h">
          <motion.div className="section-head" {...reveal()}>
            <div className="eyebrow">How it works</div>
            <h2 id="how-h">From topic to feedback in about ten minutes</h2>
            <p>No setup, no sign-up. Open it, pick a topic and start talking.</p>
          </motion.div>
          <div className="how-grid">
            <ol className="steps">
              {STEPS.map((s, i) => (
                <motion.li key={s.title} className="glass step" {...reveal(i * 0.08)}>
                  <span className="step-n">{i + 1}</span>
                  <span className="icon-bubble"><Icon name={s.icon} /></span>
                  <div><h3>{s.title}</h3><p>{s.body}</p></div>
                </motion.li>
              ))}
            </ol>
            <motion.figure className="frame" {...reveal(0.1)}>
              <BgVideo name="table" label="A group of people discussing around a round table, seen from above" />
              <figcaption className="glass">The same table, in 3D. You sit at the bottom, the panel around you.</figcaption>
            </motion.figure>
          </div>
        </section>

        {/* ---------- features ---------- */}
        <section id="features" className="section" aria-labelledby="feat-h">
          <motion.div className="section-head" {...reveal()}>
            <div className="eyebrow">Features</div>
            <h2 id="feat-h">Built to feel like the real round</h2>
            <p>Natural turn-taking, distinct personalities and feedback you can verify.</p>
          </motion.div>
          <div className="feat-grid">
            {FEATURES.map((f, i) => (
              <motion.article key={f.title} className="glass feat" {...reveal((i % 3) * 0.07)}>
                <span className="icon-bubble"><Icon name={f.icon} /></span>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </motion.article>
            ))}
          </div>
        </section>

        {/* ---------- feedback band ---------- */}
        <section className="band" aria-labelledby="band-h">
          <BgVideo name="feedback" label="A participant making a point during a group discussion" />
          <div className="band-veil" />
          <div className="band-inner">
            <motion.div className="glass band-card" {...reveal()}>
              <div className="eyebrow">The report</div>
              <h2 id="band-h">Honest feedback, tied to your exact words</h2>
              <ul className="ticks">
                <li><Icon name="check" size={18} /> Speaking share for every participant</li>
                <li><Icon name="check" size={18} /> Six scored skills, from opening to closing</li>
                <li><Icon name="check" size={18} /> Three moments you could have jumped in, with what to say</li>
              </ul>
              <button className="btn btn-dark" onClick={onStart}>Try a round <Icon name="arrow" size={18} /></button>
            </motion.div>
            <motion.div className="glass band-mock" {...reveal(0.12)} aria-label="Example feedback card">
              <div className="mock-head"><b>Building on others</b><span className="mock-score">6<small>/10</small></span></div>
              <div className="mock-meter"><i style={{ width: '60%' }} /></div>
              <p>You explicitly built on Meera's point, which showed you were listening.</p>
              <span className="quote-chip static"><span className="quote-text">“Building on Meera, a four day week works best where output is measurable…”</span><span className="quote-time">0:45</span></span>
            </motion.div>
          </div>
        </section>

        {/* ---------- panel ---------- */}
        <section id="panel" className="section" aria-labelledby="panel-h">
          <motion.div className="section-head" {...reveal()}>
            <div className="eyebrow">The panel</div>
            <h2 id="panel-h">Meet the people you will be talking to</h2>
            <p>Every one of them is an AI, and each one pushes you in a different way.</p>
          </motion.div>
          <div className="persona-grid">
            {PERSONAS.map((p, i) => (
              <motion.article key={p.name} className="glass persona" {...reveal(i * 0.06)}>
                <span className="orb" style={{ ['--c' as string]: p.color }} />
                <h3>{p.name} <span className="ai-badge">AI</span></h3>
                <div className="persona-role">{p.role}</div>
                <p>{p.body}</p>
              </motion.article>
            ))}
            <motion.figure className="frame tall" {...reveal(0.3)}>
              <BgVideo name="vertical" label="Two people in conversation at a meeting table" />
              <figcaption className="glass">Ready in seconds</figcaption>
            </motion.figure>
          </div>
        </section>

        {/* ---------- FAQ ---------- */}
        <section id="faq" className="section narrow" aria-labelledby="faq-h">
          <motion.div className="section-head" {...reveal()}>
            <div className="eyebrow">FAQ</div>
            <h2 id="faq-h">Questions, answered</h2>
          </motion.div>
          <div className="faq">
            {FAQ.map((f, i) => (
              <motion.details key={f.q} className="glass faq-item" {...reveal(i * 0.03)}>
                <summary><span>{f.q}</span><Icon name="plus" size={20} /></summary>
                <p>{f.a}</p>
              </motion.details>
            ))}
          </div>
        </section>

        {/* ---------- final CTA ---------- */}
        <section className="cta" aria-labelledby="cta-h">
          <BgVideo name="team" label="A team discussing ideas at a whiteboard" />
          <div className="band-veil light" />
          <motion.div className="glass cta-card" {...reveal()}>
            <h2 id="cta-h">Your next group discussion starts now</h2>
            <p>Pick a topic, put on headphones and speak. It is free and takes no sign-up.</p>
            <button className="btn btn-dark" onClick={onStart}>Start practising <Icon name="arrow" size={18} /></button>
          </motion.div>
        </section>
      </main>

      <footer className="footer">
        <Logo onClick={() => document.querySelector('.landing')?.scrollTo({ top: 0, behavior: 'smooth' })} />
        <p><span className="ai-badge">AI</span> All other participants are AI.</p>
        <nav aria-label="Footer">
          {NAV.map((n) => (<a key={n.id} href={`#${n.id}`} onClick={(e) => { e.preventDefault(); go(n.id) }}>{n.label}</a>))}
        </nav>
      </footer>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
      }) }} />
    </div>
  )
}
