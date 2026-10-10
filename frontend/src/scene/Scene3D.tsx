import { ContactShadows, Environment, Lightformer } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { computeSeats, TABLE_RADIUS, TABLE_TOP } from '../layout'
import type { RoomConfig, RoomState } from '../types'
import NamePill from '../ui/NamePill'
import { polar, SEAT_RADIUS } from '../layout'
import Seat from './Seat'
import SpeakerLight from './SpeakerLight'

const BG = '#EFE7DA'
const CAM = new THREE.Vector3(0, 9.2, 12.3)
const LOOK = new THREE.Vector3(0, 0.45, 0.35)

/** Gentle idle drift plus mouse parallax. Nothing harsh. */
function CameraRig() {
  const look = useMemo(() => LOOK.clone(), [])
  useFrame(({ camera, pointer, clock }, dt) => {
    const t = clock.elapsedTime
    const tx = CAM.x + pointer.x * 0.7 + Math.sin(t * 0.18) * 0.25
    const ty = CAM.y + pointer.y * 0.25 + Math.sin(t * 0.13) * 0.12
    camera.position.x = THREE.MathUtils.damp(camera.position.x, tx, 2.5, dt)
    camera.position.y = THREE.MathUtils.damp(camera.position.y, ty, 2.5, dt)
    camera.position.z = CAM.z
    camera.lookAt(look)
  })
  return null
}

/** Moves DOM name pills to the screen position of each seat's head, once per frame. */
function PillTracker({ seats, els }: { seats: ReturnType<typeof computeSeats>; els: React.RefObject<Record<string, HTMLDivElement | null>> }) {
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera, size }) => {
    for (const s of seats) {
      const el = els.current[s.id]
      if (!el) continue
      const [x, z] = polar(s.angle, SEAT_RADIUS)
      v.set(x, 2.3, z).project(camera)
      el.style.transform = `translate(${(v.x * 0.5 + 0.5) * size.width}px, ${(-v.y * 0.5 + 0.5) * size.height}px) translate(-50%, -50%)`
    }
  })
  return null
}

function Table() {
  return (
    <group>
      <mesh position={[0, TABLE_TOP - 0.09, 0]}>
        <cylinderGeometry args={[TABLE_RADIUS, TABLE_RADIUS, 0.18, 96]} />
        <meshPhysicalMaterial color="#EADFCB" roughness={0.5} clearcoat={0.35} clearcoatRoughness={0.4} />
      </mesh>
      <mesh position={[0, TABLE_TOP / 2 - 0.09, 0]}>
        <cylinderGeometry args={[0.45, 0.8, TABLE_TOP - 0.18, 48]} />
        <meshStandardMaterial color="#E4D8C3" roughness={0.7} />
      </mesh>
    </group>
  )
}

interface Props {
  config: RoomConfig
  state: RoomState
}

export default function Scene3D({ config, state }: Props) {
  const seats = useMemo(() => computeSeats(config), [config])
  const els = useRef<Record<string, HTMLDivElement | null>>({})
  return (
    <>
    <Canvas
      dpr={[1, 2]}
      camera={{ position: CAM.toArray(), fov: 32, near: 0.5, far: 60 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <color attach="background" args={[BG]} />
      <fog attach="fog" args={[BG, 16, 34]} />

      {/* soft three-point studio lighting, no network assets needed */}
      <Environment resolution={256} frames={1} environmentIntensity={0.85}>
        <Lightformer form="rect" intensity={2.4} position={[0, 7, 0]} rotation-x={Math.PI / 2} scale={[12, 12, 1]} color="#fff3e2" />
        <Lightformer form="rect" intensity={1.3} position={[-7, 3, 5]} rotation-y={Math.PI / 2} scale={[8, 5, 1]} color="#ffe6cc" />
        <Lightformer form="rect" intensity={0.9} position={[7, 3, -4]} rotation-y={-Math.PI / 2} scale={[8, 5, 1]} color="#e3ebf7" />
      </Environment>
      <ambientLight intensity={0.4} color="#fff1dc" />
      <directionalLight position={[-4, 8, 6]} intensity={0.4} color="#fff0dc" />

      <mesh rotation-x={-Math.PI / 2}>
        <circleGeometry args={[40, 64]} />
        <meshStandardMaterial color="#E7DCC9" roughness={1} />
      </mesh>
      <ContactShadows position={[0, 0.005, 0]} opacity={0.4} scale={16} blur={2.8} far={3.5} resolution={512} color="#6b5a43" />

      <Table />
      {seats.map((s) => (
        <Seat key={s.id} seat={s} active={state.speaker === s.id} thinking={state.thinking === s.id} />
      ))}
      <SpeakerLight seats={seats} speaker={state.speaker} interrupts={state.interrupts} />
      <CameraRig />
      <PillTracker seats={seats} els={els} />
    </Canvas>
    <div className="pill-layer">
      {seats.map((s) => (
        <div key={s.id} className="pill-anchor" ref={(el) => { els.current[s.id] = el }}>
          <NamePill id={s.id} active={state.speaker === s.id} />
        </div>
      ))}
    </div>
    </>
  )
}
