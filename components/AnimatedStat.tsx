'use client'

// Renders a single animated percentage with sign prefix.
// Used in the data strip for Auto avg and Home avg values.

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

  if (loading || displayed === null) {
    return <span className={styles.statSkeleton} aria-hidden="true" />
  }

  const numericValue = parseFloat(displayed)
  const isPositive = numericValue >= 0
  const sign = isPositive ? '+' : '−' // U+2212 typographic minus for negatives

  return (
    <span
      className={styles.statValue}
      aria-live="polite"
      aria-atomic="true"
    >
      {sign}{Math.abs(numericValue).toFixed(1)}%
    </span>
  )
}
