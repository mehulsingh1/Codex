import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { unlockAudio } from './audio/context'
import Landing from './landing/Landing'
import Leaderboard from './leaderboard/Leaderboard'
import Report from './report/Report'
import { SAMPLE_CONFIG, SAMPLE_TRANSCRIPT } from './report/sample'
import type { RoomConfig, TranscriptLine } from './types'
import Room from './ui/Room'
import Setup from './ui/Setup'

const params = new URLSearchParams(location.search)
const sim = params.get('sim') === '1' // scripted simulator instead of the live backend
const demoReport = params.get('demo') === 'report' // jump straight to a sample report

// Tiny hash router: "/" is the landing page, "/#/practice" is the topic page. The browser back button works.
const onPracticeRoute = () => location.hash.startsWith('#/practice')
const onBoardRoute = () => location.hash.startsWith('#/leaderboard')

const TITLES = {
  home: 'GD Arena: Practise Group Discussions with AI Participants',
  board: 'Leaderboard | GD Arena',
  practice: 'Choose a topic | GD Arena',
  room: 'Live group discussion | GD Arena',
  report: 'Your discussion report | GD Arena',
}

export default function App() {
  const [board, setBoard] = useState(onBoardRoute())
  const [practice, setPractice] = useState(onPracticeRoute() || demoReport || sim)
  const [config, setConfig] = useState<RoomConfig | null>(demoReport ? SAMPLE_CONFIG : null)
  const [result, setResult] = useState<TranscriptLine[] | null>(demoReport ? SAMPLE_TRANSCRIPT : null)

  useEffect(() => {
    const onHash = () => { setBoard(onBoardRoute()); setPractice(onPracticeRoute()); if (!onPracticeRoute()) { setConfig(null); setResult(null) } }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const goPractice = () => { location.hash = '#/practice'; setPractice(true) }
  const goBoard = () => { location.hash = '#/leaderboard'; setBoard(true); setPractice(false) }
  const goHome = () => { setBoard(false); history.pushState(null, '', location.pathname + location.search.replace(/[?&](sim|demo)=[^&]*/g, '')); setPractice(false); setConfig(null); setResult(null) }

  const screen = board ? 'board' : !practice ? 'home' : result ? 'report' : config ? 'room' : 'practice'
  useEffect(() => { document.title = TITLES[screen] }, [screen])

  return (
    <motion.div key={screen} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.45 }}>
      {screen === 'home' && <Landing onStart={goPractice} onBoard={goBoard} />}
      {screen === 'board' && <Leaderboard onHome={goHome} onStart={goPractice} />}
      {screen === 'practice' && <Setup onHome={goHome} onStart={(c) => { unlockAudio(); setConfig(c) }} />}
      {screen === 'room' && config && <Room config={config} sim={sim} onEnd={(t) => setResult(t)} />}
      {screen === 'report' && result && config && (
        <Report config={config} transcript={result} onBack={() => { setResult(null); setConfig(null) }} />
      )}
    </motion.div>
  )
}
