import { motion } from 'framer-motion'
import Icon from '../landing/icons'
import { Logo } from '../landing/Landing'
import { buildBoard, REWARDS } from './data'
import './leaderboard.css'

const spring = { type: 'spring', stiffness: 120, damping: 18 } as const
const MEDAL = ['🥇', '🥈', '🥉']

export default function Leaderboard({ onHome, onStart }: { onHome: () => void; onStart: () => void }) {
  const { top, me } = buildBoard()
  const outside = me && me.rank > 10

  return (
    <div className="lb-page">
      <header className="start-top">
        <Logo onClick={onHome} />
        <button className="btn btn-glass btn-sm" onClick={onHome}><Icon name="back" size={16} /> Home</button>
      </header>

      <main className="lb-main">
        <motion.div className="glass lb-card" initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
          <div className="eyebrow">Leaderboard</div>
          <h1>Top 10 this month</h1>
          <p className="lb-sub">Every finished discussion earns up to 100 points, based on your report score. The top 3 win a coupon.</p>

          <div className="lb-rewards" aria-label="Prizes">
            {REWARDS.map((r, i) => (
              <div key={r.brand} className="lb-reward" style={{ '--c': r.color } as React.CSSProperties}>
                <span className="lb-medal" aria-hidden="true">{MEDAL[i]}</span>
                <b>{r.brand}</b>
                <span>{r.offer}</span>
                <small>{['1st', '2nd', '3rd'][i]} place</small>
              </div>
            ))}
          </div>

          <ol className="lb-list">
            {top.map((e) => (
              <li key={e.name} className={`lb-row ${e.you ? 'you' : ''} ${e.rank <= 3 ? 'podium' : ''}`}>
                <span className="lb-rank">{e.rank <= 3 ? MEDAL[e.rank - 1] : e.rank}</span>
                <span className="lb-name">{e.name}{e.you && <span className="tag">you</span>}<small>{e.city} · {e.sessions} session{e.sessions > 1 ? 's' : ''}</small></span>
                <span className="lb-pts">{e.points}<small> pts</small></span>
              </li>
            ))}
            {outside && me && (
              <li className="lb-row you">
                <span className="lb-rank">{me.rank}</span>
                <span className="lb-name">You<small>{me.sessions} session{me.sessions > 1 ? 's' : ''}</small></span>
                <span className="lb-pts">{me.points}<small> pts</small></span>
              </li>
            )}
          </ol>

          {!me && <p className="lb-note">You are not on the board yet. Finish a discussion to earn your first points.</p>}
          {me && me.rank <= 3 && <p className="lb-note good">You are in the top 3. You would win {REWARDS[me.rank - 1].brand}.</p>}
          <button className="btn btn-dark" onClick={onStart}>Practise to earn points <Icon name="arrow" size={18} /></button>
          <p className="lb-fine">The other nine names are sample players for this demo. Your points are saved on this device only.</p>
        </motion.div>
      </main>
    </div>
  )
}
