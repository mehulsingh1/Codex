import { useEffect, useMemo, useRef } from 'react'
import { levelBus } from '../audio/levelBus'
import { computeSeats, polar } from '../layout'
import { getPersona } from '../personas'
import NamePill from '../ui/NamePill'
import type { RoomConfig, RoomState } from '../types'

interface Props {
  config: RoomConfig
  state: RoomState
}

/** Same layout as the 3D scene on a CSS ring: used when WebGL fails, motion is reduced, or the device is weak. */
export default function Fallback2D({ config, state }: Props) {
  const seats = useMemo(() => computeSeats(config), [config])
  const root = useRef<HTMLDivElement>(null)
  const active = seats.find((s) => s.id === state.speaker)

  // Drive the pulse from the same level bus the 3D scene reads.
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const lvl = state.speaker === 'student' ? levelBus.mic : levelBus.speaker
      root.current?.style.setProperty('--lvl', String(state.speaker ? lvl : 0))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [state.speaker])

  const R = 38 // percent of the stage
  const pos = (angle: number, r: number) => {
    const [x, z] = polar(angle, 1)
    return { left: `${50 + x * r}%`, top: `${52 + z * r * 0.78}%` }
  }
  const tint = active ? getPersona(active.id).color : '#FFE3B8'

  return (
    <div className="flat-stage" ref={root}>
      <div className="flat-table" />
      {active && (
        <div className="flat-spot" style={{ ...pos(active.angle, R * 0.52), ['--tint' as string]: tint }} />
      )}
      {seats.map((s) => {
        const p = getPersona(s.id)
        const on = state.speaker === s.id
        return (
          <div
            key={s.id}
            className={`flat-seat${on ? ' on' : ''}${state.thinking === s.id ? ' think' : ''}`}
            style={{ ...pos(s.angle, R), ['--accent' as string]: p.color }}
          >
            <div className="flat-orb" />
            <NamePill id={s.id} active={on} />
          </div>
        )
      })}
    </div>
  )
}
