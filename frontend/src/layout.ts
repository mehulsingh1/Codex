import type { RoomConfig } from './types'
import { rosterIds } from './personas'

export interface Seat {
  id: string
  angle: number // radians; 0 = bottom of the screen (closest to camera), increasing clockwise seen from above
}

/** Student always at angle 0. The moderator sits opposite; AIs fill the sides evenly. */
export function computeSeats(config: RoomConfig): Seat[] {
  const ai = rosterIds(config)
  const mid = Math.ceil(ai.length / 2)
  const others = [...ai.slice(0, mid), 'moderator', ...ai.slice(mid)]
  const total = others.length + 1
  return [
    { id: 'student', angle: 0 },
    ...others.map((id, i) => ({ id, angle: (2 * Math.PI * (i + 1)) / total })),
  ]
}

export const SEAT_RADIUS = 3.1
export const TABLE_RADIUS = 2.2
export const TABLE_TOP = 0.95

/** World position (x, z) for a seat angle at radius r. Student (angle 0) lands on +z, nearest the camera. */
export const polar = (angle: number, r: number): [number, number] => [Math.sin(angle) * r, Math.cos(angle) * r]
