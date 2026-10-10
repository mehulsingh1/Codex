export type RenderMode = '3d' | '2d'

/** Pick 2D when WebGL is missing, motion is reduced, the device is weak, or ?mode=2d is set. */
export function detectMode(): RenderMode {
  try {
    const q = new URLSearchParams(location.search).get('mode')
    if (q === '2d' || q === '3d') return q
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return '2d'
    const nav = navigator as Navigator & { deviceMemory?: number }
    if ((nav.deviceMemory ?? 8) <= 2 || (nav.hardwareConcurrency ?? 8) <= 2) return '2d'
    const gl = document.createElement('canvas').getContext('webgl2') ?? document.createElement('canvas').getContext('webgl')
    if (!gl) return '2d'
  } catch {
    return '2d'
  }
  return '3d'
}
