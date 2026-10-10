import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { levelBus } from '../audio/levelBus'
import { polar, SEAT_RADIUS } from '../layout'
import type { Seat as SeatT } from '../layout'
import { getPersona } from '../personas'

interface Props {
  seat: SeatT
  active: boolean
  thinking: boolean
}

export default function Seat({ seat, active, thinking }: Props) {
  const persona = getPersona(seat.id)
  const isYou = seat.id === 'student'
  const [x, z] = polar(seat.angle, SEAT_RADIUS)
  const base = useMemo(() => new THREE.Color(persona.color), [persona.color])
  const head = useRef<THREE.Mesh>(null)
  const core = useRef<THREE.Mesh>(null)
  const bodyMat = useRef<THREE.MeshStandardMaterial>(null)
  const headMat = useRef<THREE.MeshPhysicalMaterial>(null)
  const bright = useRef(0.68)

  useFrame((s, dt) => {
    const t = s.clock.elapsedTime
    const lvl = active ? (isYou ? levelBus.mic : levelBus.speaker) : 0
    bright.current = THREE.MathUtils.damp(bright.current, active ? 1 : 0.68, 5, dt)
    const breathe = thinking ? 0.5 + 0.5 * Math.sin(t * 1.6) : 0

    if (bodyMat.current) {
      bodyMat.current.color.copy(base).multiplyScalar(bright.current)
      bodyMat.current.emissive.copy(base)
      bodyMat.current.emissiveIntensity = (active ? 0.12 + lvl * 0.5 : 0) + breathe * 0.18
    }
    if (headMat.current) {
      headMat.current.emissive.copy(base)
      headMat.current.emissiveIntensity = (active ? 0.1 + lvl * 0.7 : 0.02) + breathe * 0.3
    }
    head.current?.scale.setScalar(1 + lvl * 0.1 + breathe * 0.05)
    core.current?.scale.setScalar(0.5 + lvl * 0.25 + breathe * 0.1)
  })

  return (
    <group position={[x, 0, z]}>
      <group rotation-y={seat.angle + Math.PI}>
        {/* stool */}
        <mesh position={[0, 0.2, 0]}>
          <cylinderGeometry args={[0.42, 0.5, 0.4, 40]} />
          <meshStandardMaterial color="#D8C8AE" roughness={0.85} />
        </mesh>
        {/* bust */}
        <mesh position={[0, 0.88, 0]}>
          <capsuleGeometry args={[0.36, 0.42, 10, 32]} />
          <meshStandardMaterial ref={bodyMat} color={persona.color} roughness={0.55} />
        </mesh>
        {/* glass head orb with a soft tinted core so the glass has something to refract */}
        <mesh ref={head} position={[0, 1.55, 0]}>
          <sphereGeometry args={[0.3, 48, 48]} />
          <meshPhysicalMaterial
            ref={headMat}
            color={persona.color}
            transmission={0.92}
            thickness={0.6}
            ior={1.3}
            roughness={0.08}
            clearcoat={1}
            attenuationColor={persona.color}
            attenuationDistance={1.2}
          />
        </mesh>
        <mesh ref={core} position={[0, 1.55, 0]}>
          <sphereGeometry args={[0.3, 24, 24]} />
          <meshBasicMaterial color={persona.color} transparent opacity={0.35} />
        </mesh>
      </group>

    </group>
  )
}
