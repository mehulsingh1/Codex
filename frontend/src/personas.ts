import type { Persona, RoomConfig } from './types'

export const MODERATOR: Persona = {
  id: 'moderator', name: 'Ms. Rao', role: 'Moderator', color: '#B9A57F',
  style: 'Calm, neutral, keeps time',
}

export const STUDENT: Persona = {
  id: 'student', name: 'You', role: 'Student', color: '#86A5A6', style: '',
}

// Order matters: a panel of N uses the first N.
export const AI_PERSONAS: Persona[] = [
  { id: 'dominator', name: 'Arjun', role: 'Dominator', color: '#C98B73', style: 'Loud, cuts in, pushes his view' },
  { id: 'data', name: 'Meera', role: 'Data-driven', color: '#9DB39A', style: 'Cites numbers and examples' },
  { id: 'quiet', name: 'Kavya', role: 'Quiet but sharp', color: '#8FA8C4', style: 'Speaks rarely, lands hard' },
  { id: 'drifter', name: 'Rohan', role: 'Off-topic drifter', color: '#E8B484', style: 'Wanders into tangents' },
  { id: 'diplomat', name: 'Sana', role: 'Diplomat', color: '#B7A6D0', style: 'Bridges views, seeks consensus' },
]

const ALL: Record<string, Persona> = Object.fromEntries(
  [MODERATOR, STUDENT, ...AI_PERSONAS].map((p) => [p.id, p]),
)

export const getPersona = (id: string): Persona => ALL[id] ?? MODERATOR

export const rosterIds = (config: RoomConfig): string[] => AI_PERSONAS.slice(0, config.panel).map((p) => p.id)

export interface Topic { text: string; category: string }

export const TOPICS: Topic[] = [
  { category: 'Abstract', text: 'Is silence more powerful than speech?' },
  { category: 'Abstract', text: 'Can a leader be too humble?' },
  { category: 'Abstract', text: 'Is zero greater than one?' },
  { category: 'Current affairs', text: 'AI will replace more jobs than it creates' },
  { category: 'Current affairs', text: 'Should India adopt a four-day work week?' },
  { category: 'Current affairs', text: 'Are electric vehicles truly green?' },
  { category: 'Current affairs', text: 'Is remote work here to stay?' },
  { category: 'Controversial', text: 'Reservation should be based on economic status' },
  { category: 'Controversial', text: 'Social media should be regulated by law' },
  { category: 'Controversial', text: 'Is cancel culture justified?' },
  { category: 'Case-based', text: 'A startup has 3 months of cash: grow, cut costs, or pivot?' },
  { category: 'Case-based', text: 'One budget: sports complex or research lab?' },
  { category: 'Case-based', text: 'A food brand faces a viral safety rumour. How should it respond?' },
]
