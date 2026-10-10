import { useEffect, useRef, useState } from 'react'

interface Props {
  name: string // file in /media without extension (e.g. "hero" -> hero.mp4 + hero.jpg poster)
  className?: string
  label?: string // accessible description; videos are decorative otherwise
  eager?: boolean // load straight away (hero) instead of when scrolled into view
}

/**
 * Muted looping background video. It only plays while visible and while the tab is shown, never
 * autoplays for people who prefer reduced motion (they see the poster), and below-the-fold videos
 * do not download until they are near the viewport.
 */
export default function BgVideo({ name, className = '', label, eager = false }: Props) {
  const ref = useRef<HTMLVideoElement>(null)
  const [load, setLoad] = useState(eager)
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    const v = ref.current
    if (!v || reduced) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setLoad(true)
          v.play().catch(() => { /* autoplay blocked: the poster stays */ })
        } else {
          v.pause()
        }
      },
      { rootMargin: '200px' },
    )
    io.observe(v)
    const onVis = () => { if (document.hidden) v.pause() }
    document.addEventListener('visibilitychange', onVis)
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', onVis) }
  }, [reduced])

  return (
    <video
      ref={ref}
      className={`bgvideo ${className}`}
      poster={`/media/${name}.jpg`}
      muted
      loop
      playsInline
      preload={eager ? 'auto' : 'none'}
      autoPlay={!reduced && eager}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      tabIndex={-1}
    >
      {load && !reduced && <source src={`/media/${name}.mp4`} type="video/mp4" />}
    </video>
  )
}
