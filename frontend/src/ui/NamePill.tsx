import { getPersona } from '../personas'

/** Floating glass name tag with an AI badge (the student gets "You" and no badge). */
export default function NamePill({ id, active }: { id: string; active: boolean }) {
  const p = getPersona(id)
  return (
    <div className={`pill${active ? ' pill-on' : ''}`} style={{ ['--accent' as string]: p.color }}>
      <span className="pill-dot" />
      <span className="pill-name">{p.name}</span>
      {id === 'student' ? null : <span className="ai-badge">AI</span>}
    </div>
  )
}
