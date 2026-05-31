import { useEffect, useRef, useState } from 'react'

interface Options {
  duration?: number                  // ms, default 600
  decimals?: number                  // decimal places, default 1
  easing?: (t: number) => number
}

// Ease-out cubic — design system Rule 4
// Approximates cubic-bezier(.16,1,.3,1) as a JS easing function.
// Used for counters that count up to their value, giving immediate
// feedback with a natural deceleration.
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

export function useAnimatedCounter(
  target: number | null,
  options: Options = {},
): string | null {
  const {
    duration = 600,
    decimals = 1,
    easing = easeOutCubic,
  } = options

  const [displayed, setDisplayed] = useState<number | null>(null)
  const rafRef   = useRef<number | undefined>(undefined)
  const startRef = useRef<number | undefined>(undefined)
  const fromRef  = useRef<number>(0)

  useEffect(() => {
    // No target — clear display
    if (target === null) {
      setDisplayed(null)
      return
    }

    // Respect reduced motion — snap to value immediately.
    // Design system: reduced motion disables all non-essential animation.
    // "Number count-up → show final value immediately, skip animation"
    const prefersReduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches

    if (prefersReduced) {
      setDisplayed(target)
      return
    }

    const from = fromRef.current
    fromRef.current = target
    startRef.current = undefined

    // Cancel any in-progress animation
    if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current)

    const animate = (timestamp: number) => {
      if (startRef.current === undefined) startRef.current = timestamp

      const elapsed  = timestamp - startRef.current
      const progress = Math.min(elapsed / duration, 1)
      const eased    = easing(progress)
      const current  = from + (target - from) * eased

      setDisplayed(current)

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      } else {
        setDisplayed(target)
        fromRef.current = target
      }
    }

    rafRef.current = requestAnimationFrame(animate)

    return () => {
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current)
    }
  }, [target, duration, easing])

  // Format the displayed value
  return displayed === null ? null : displayed.toFixed(decimals)
}
