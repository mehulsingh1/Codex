import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { levelBus } from '../audio/levelBus'
import { polar, TABLE_TOP } from '../layout'
import type { Seat } from '../layout'
import { getPersona } from '../personas'

interface Props {
  seats: Seat[]
  speaker: string | null
  interrupts: number
}

const FOCUS_R = 1.45 // glow ring sits on the table in front of the speaker
const APEX_R = 2.6
const APEX_Y = 4.4
const WARM = new THREE.Color('#FFE3B8')

const coneMaterial = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color('#ffe3b8') }, uAmount: { value: 0 } },
    vertexShader: `
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uAmount;
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.4);
        float along = 0.15 + 0.85 * vUv.y;           // brighter near the source
        gl_FragColor = vec4(uColor, uAmount * 0.12 * edge * along);
      }`,
  })

function glowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,255,255,0.95)')
  grad.addColorStop(0.45, 'rgba(255,255,255,0.35)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(c)
}

/** One light for the whole room. It glides between speakers instead of snapping. */
export default function SpeakerLight({ seats, speaker, interrupts }: Props) {
  const spot = useRef<THREE.SpotLight>(null)
  const cone = useRef<THREE.Mesh>(null)
  const ring = useRef<THREE.Mesh>(null)
  const focus = useRef(new THREE.Vector3(0, TABLE_TOP, FOCUS_R))
  const apex = useRef(new THREE.Vector3(0, APEX_Y, APEX_R))
  const amount = useRef(0)
  const flicker = useRef(-1)
  const tint = useRef(WARM.clone())
  const coneMat = useMemo(coneMaterial, [])
  const glowMap = useMemo(glowTexture, [])

  useEffect(() => {
    if (interrupts > 0) flicker.current = 0
  }, [interrupts])

  const seat = seats.find((s) => s.id === speaker)

  useFrame((_, dt) => {
    const k = 6 // damp rate: roughly 500 ms to settle
    if (seat) {
      const [fx, fz] = polar(seat.angle, FOCUS_R)
      const [ax, az] = polar(seat.angle, APEX_R)
      focus.current.x = THREE.MathUtils.damp(focus.current.x, fx, k, dt)
      focus.current.z = THREE.MathUtils.damp(focus.current.z, fz, k, dt)
      apex.current.x = THREE.MathUtils.damp(apex.current.x, ax, k, dt)
      apex.current.z = THREE.MathUtils.damp(apex.current.z, az, k, dt)
      tint.current.lerp(WARM.clone().lerp(new THREE.Color(getPersona(seat.id).color), 0.55), 1 - Math.exp(-dt * 6))
    }
    amount.current = THREE.MathUtils.damp(amount.current, seat ? 1 : 0, 4, dt)

    let flick = 1
    if (flicker.current >= 0) {
      flicker.current += dt
      flick = Math.sin(flicker.current * 55) > 0 ? 0.15 : 1
      if (flicker.current > 0.28) flicker.current = -1
    }
    const level = seat ? (seat.id === 'student' ? levelBus.mic : levelBus.speaker) : 0
    const a = amount.current * flick

    const f = focus.current
    const ap = apex.current
    if (spot.current) {
      spot.current.position.copy(ap)
      spot.current.target.position.copy(f)
      spot.current.target.updateMatrixWorld()
      spot.current.intensity = 60 * a * (0.8 + level * 0.4)
      spot.current.color.copy(tint.current)
    }
    if (cone.current) {
      const dir = new THREE.Vector3().subVectors(ap, f)
      const len = dir.length()
      cone.current.position.copy(f).addScaledVector(dir, 0.5)
      cone.current.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
      cone.current.scale.set(1, len, 1)
      coneMat.uniforms.uAmount.value = a * (0.8 + level * 0.5)
      coneMat.uniforms.uColor.value.copy(tint.current)
    }
    if (ring.current) {
      ring.current.position.set(f.x, TABLE_TOP + 0.012, f.z)
      ring.current.scale.setScalar(1.8 + level * 0.8)
      const m = ring.current.material as THREE.MeshBasicMaterial
      m.opacity = a * (0.75 + level * 0.25)
      m.color.copy(tint.current)
    }
  })

  return (
    <>
      <spotLight ref={spot} angle={0.36} penumbra={1} distance={14} decay={1.6} />
      <mesh ref={cone} material={coneMat}>
        <cylinderGeometry args={[0.06, 1.15, 1, 48, 1, true]} />
      </mesh>
      <mesh ref={ring} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[1.6, 1.6]} />
        <meshBasicMaterial map={glowMap} transparent depthWrite={false} />
      </mesh>
    </>
  )
}
