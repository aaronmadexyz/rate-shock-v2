'use client'

// Renders a single animated percentage with sign prefix.
// Used in the data strip for Auto avg and Home avg values.
//
// Accessibility strategy: the strip container holds role=status + aria-live
// and announces the full accessible label when data loads. Child spans are
// hidden from AT during animation (intermediate values are meaningless) and
// become visible once the final value settles.

import { useEffect, useState } from 'react'
import { useAnimatedCounter } from '@/lib/useAnimatedCounter'
import styles from '@/styles/Nav.module.css'

interface AnimatedStatProps {
  value:   number | null   // signed pct
  loading: boolean
}

export function AnimatedStat({ value, loading }: AnimatedStatProps) {
  // 600ms duration — intentional exception to Emil Rule 6 (under 300ms).
  // Rule 6 governs UI state transitions (hover, open, close). Counting
  // animations that communicate magnitude — Robinhood portfolio, Bloomberg
  // price updates — conventionally use 400–800ms to let the eye track the
  // change. 600ms is appropriate here.
  const displayed = useAnimatedCounter(value, { duration: 600, decimals: 1 })

  // Track whether the counter is mid-animation.
  // During animation, the span is aria-hidden so AT reads the container's
  // aria-label (the authoritative announcement) instead of intermediate values.
  const [animating, setAnimating] = useState(false)

  useEffect(() => {
    if (value === null) return
    const prefersReduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    if (!prefersReduced) {
      setAnimating(true)
      const t = setTimeout(() => setAnimating(false), 600)
      return () => clearTimeout(t)
    }
  }, [value])

  if (loading || displayed === null) {
    // role=presentation: purely decorative shimmer — loading state is
    // communicated by the container's aria-label ("Loading renewal statistics")
    return (
      <span
        className={styles.statSkeleton}
        aria-hidden="true"
        role="presentation"
      />
    )
  }

  const numericValue = parseFloat(displayed)
  const isPositive = numericValue >= 0
  const sign = isPositive ? '+' : '−' // U+2212 typographic minus for negatives
  // Sign character — not colour — is the sole differentiator (WCAG 1.4.1).
  // All strip values use n-0 white; no tier-colour coding applied here.

  return (
    <span
      aria-hidden={animating}
      className={styles.statValue}
    >
      {sign}{Math.abs(numericValue).toFixed(1)}%
    </span>
  )
}
