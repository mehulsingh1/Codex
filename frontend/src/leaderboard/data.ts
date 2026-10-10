import { loadSessions } from '../progress/store'

export interface Reward { brand: string; offer: string; color: string }
export interface Entry { name: string; city: string; points: number; sessions: number; you?: boolean }

/** Prizes for the top three places. */
export const REWARDS: Reward[] = [
  { brand: 'Starbucks', offer: '₹500 gift card', color: '#00704A' },
  { brand: 'Domino’s', offer: '₹400 pizza voucher', color: '#0B64A0' },
  { brand: 'Amazon or Flipkart', offer: '₹300 shopping voucher', color: '#D08A1F' },
]

/** Sample players so the board is never empty. Points are illustrative, not real users. */
const SAMPLE: Entry[] = [
  { name: 'Aarav Sharma', city: 'Delhi', points: 912, sessions: 14 },
  { name: 'Ananya Iyer', city: 'Chennai', points: 874, sessions: 13 },
  { name: 'Rohan Mehta', city: 'Mumbai', points: 836, sessions: 12 },
  { name: 'Priya Nair', city: 'Kochi', points: 771, sessions: 11 },
  { name: 'Kabir Singh', city: 'Chandigarh', points: 709, sessions: 10 },
  { name: 'Diya Patel', city: 'Ahmedabad', points: 652, sessions: 9 },
  { name: 'Vihaan Reddy', city: 'Hyderabad', points: 598, sessions: 9 },
  { name: 'Ishita Banerjee', city: 'Kolkata', points: 531, sessions: 8 },
  { name: 'Arjun Verma', city: 'Lucknow', points: 467, sessions: 7 },
  { name: 'Saanvi Joshi', city: 'Pune', points: 402, sessions: 6 },
]

/** Points for one session: the overall score (0 to 10) times ten, so 0 to 100. */
export const pointsFor = (overall: number) => Math.round(overall * 10)

export function myTotals() {
  const s = loadSessions()
  return { points: s.reduce((a, x) => a + pointsFor(x.overall), 0), sessions: s.length }
}

/** Top 10 by points. If you rank below 10th you still get your own row at the bottom. */
export function buildBoard(): { top: (Entry & { rank: number })[]; me: (Entry & { rank: number }) | null } {
  const mine = myTotals()
  const all: Entry[] = [...SAMPLE]
  if (mine.sessions > 0) all.push({ name: 'You', city: 'This device', points: mine.points, sessions: mine.sessions, you: true })
  all.sort((a, b) => b.points - a.points)
  const ranked = all.map((e, i) => ({ ...e, rank: i + 1 }))
  return { top: ranked.slice(0, 10), me: ranked.find((e) => e.you) ?? null }
}
