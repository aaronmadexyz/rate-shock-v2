'use client'

import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import type { NeighbourhoodStats, RecentReport } from '@/lib/types'
import { useReducedMotion } from '@/lib/motionSafety'
import styles from '@/styles/NeighbourhoodPanel.module.css'

// ─── Rate tier helpers ────────────────────────────────────────────────────────

function tierColor(pct: number | null): string {
  if (pct === null) return 'var(--n-500)' /* #706F67 — 5.05:1 on white ✓ AA */
  if (pct < 0) return 'var(--pos-600)'
  if (pct <= 7) return 'var(--n-600)'
  if (pct <= 16) return 'var(--cau-600)'
  return 'var(--neg-500)'
}

// Typographic minus U+2212 (−) in visible text
function fmtRate(pct: number | null): string {
  if (pct === null) return '—' // em dash for "no data"
  if (pct < 0) return `−${Math.abs(pct)}%`
  return `+${pct}%`
}

function rateAriaLabel(pct: number | null): string {
  if (pct === null) return 'no data'
  if (pct < 0) return `${Math.abs(pct)} percent decrease`
  return `${pct} percent increase`
}

// ─── Sentiment face (mirrors MapView.tsx) ─────────────────────────────────────

function SentimentFace({ sentiment, size }: { sentiment: number | null; size: number }) {
  if (sentiment === 1)
    return (
      <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
        <circle cx="17" cy="17" r="15" fill="#3A9B55" />
        <circle cx="12" cy="14" r="2" fill="white" />
        <circle cx="22" cy="14" r="2" fill="white" />
        <path d="M10 21Q17 27 24 21" stroke="white" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      </svg>
    )
  if (sentiment === 2)
    return (
      <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
        <circle cx="17" cy="17" r="15" fill="#93D1A2" />
        <circle cx="12" cy="14" r="2" fill="#1F6132" />
        <circle cx="22" cy="14" r="2" fill="#1F6132" />
        <path d="M12 21Q17 24.5 22 21" stroke="#1F6132" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      </svg>
    )
  if (sentiment === 3)
    return (
      <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
        <circle cx="17" cy="17" r="15" fill="#D49316" />
        <circle cx="12" cy="14" r="2" fill="white" />
        <circle cx="22" cy="14" r="2" fill="white" />
        <path d="M12 22L22 22" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    )
  if (sentiment === 4)
    return (
      <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
        <circle cx="17" cy="17" r="15" fill="var(--neg-200)" />
        <circle cx="12" cy="14" r="2" fill="white" />
        <circle cx="22" cy="14" r="2" fill="white" />
        <path d="M12 24Q17 20 22 24" stroke="white" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      </svg>
    )
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <circle cx="17" cy="17" r="15" fill="#D4503A" />
      <circle cx="12" cy="13" r="2" fill="white" />
      <circle cx="22" cy="13" r="2" fill="white" />
      <path d="M10 24Q17 19 24 24" stroke="white" strokeWidth="2.2" strokeLinecap="round" fill="none" />
    </svg>
  )
}

// ─── Skeleton body ────────────────────────────────────────────────────────────

function SkeletonBody() {
  return (
    <div className={styles.skeletonContainer} aria-hidden="true">
      <div className={`${styles.skeleton} ${styles.skRow1}`} />
      <div className={`${styles.skeleton} ${styles.skRow2}`} />
      <div className={`${styles.skeleton} ${styles.skRow3}`} />
    </div>
  )
}

// ─── Sparse body (totalCount < 3) ─────────────────────────────────────────────

interface SparseBodyProps {
  stats:      NeighbourhoodStats | null
  fsa:        string
  onCtaClick: () => void
}

function SparseBody({ stats, fsa, onCtaClick }: SparseBodyProps) {
  if (!stats || !stats.recentReports.length) {
    return (
      <>
        <p className={styles.sparseLabel}>{fsa.toUpperCase()}</p>
        <p className={styles.pioneerText}>
          No reports yet. Be the first to share yours{' '}
          <button
            className={styles.inlineLink}
            onClick={onCtaClick}
            aria-label={`Share your renewal in ${fsa.toUpperCase()}`}
          >→</button>
        </p>
      </>
    )
  }

  const report = stats.recentReports[0]! // recentReports.length > 0 confirmed above

  return (
    <>
      <p className={styles.sparseLabel}>{fsa.toUpperCase()}</p>

      <div className={styles.sparseRow}>
        <SentimentFace sentiment={report.sentiment} size={32} />
        <div>
          <div
            className={styles.rateValue}
            style={{ fontSize: 20, color: tierColor(report.rate_change_pct) }}
            aria-label={rateAriaLabel(report.rate_change_pct)}
          >
            {fmtRate(report.rate_change_pct)}
          </div>
          <div className={styles.reportMeta}>
            {report.provider} · {report.insurance_type === 'auto' ? 'Auto' : 'Home'}
          </div>
        </div>
      </div>

      <p className={styles.pioneerText}>
        {stats.totalCount === 1 ? (
          <>
            1 report in this area so far.
            <br />
            Be the second to share yours{' '}
            <button
              className={styles.inlineLink}
              onClick={onCtaClick}
              aria-label={`Share your renewal in ${stats.neighbourhood}`}
            >→</button>
          </>
        ) : (
          <>
            {stats.totalCount} reports here.
            <br />
            Add yours to build the picture{' '}
            <button
              className={styles.inlineLink}
              onClick={onCtaClick}
              aria-label={`Share your renewal in ${stats.neighbourhood}`}
            >→</button>
          </>
        )}
      </p>
    </>
  )
}

// ─── Aggregate body (totalCount >= 3) ────────────────────────────────────────

interface AggregateBodyProps {
  stats: NeighbourhoodStats
}

function AggregateBody({ stats }: AggregateBodyProps) {
  return (
    <>
      {/* Section 1 — Type breakdown */}
      <p className={styles.sectionLabel}>BY TYPE</p>
      <div className={styles.typeGrid} role="group" aria-label="Breakdown by insurance type">
        {/* Auto */}
        <div className={styles.typeCard}>
          <div className={styles.typeIconRow}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M2 9h10M1 9l1.8-3.5h8.4L13 9M4 11a1 1 0 100-2 1 1 0 000 2zM10 11a1 1 0 100-2 1 1 0 000 2z"
                stroke="var(--n-400)"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className={styles.typeLabel}>Auto</span>
          </div>
          <div
            className={`${styles.typeAvg}${stats.autoAvgPct === null ? ` ${styles.typeAvgEmpty}` : ''}`}
            style={stats.autoAvgPct !== null ? { color: tierColor(stats.autoAvgPct) } : undefined}
            aria-label={rateAriaLabel(stats.autoAvgPct)}
          >
            {fmtRate(stats.autoAvgPct)}
          </div>
          <div className={styles.typeCount}>
            {stats.autoCount > 0
              ? `${stats.autoCount} report${stats.autoCount !== 1 ? 's' : ''}`
              : 'No data yet'}
          </div>
        </div>

        {/* Home */}
        <div className={styles.typeCard}>
          <div className={styles.typeIconRow}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M1.5 7L7 2l5.5 5M3 6.5V12h8V6.5"
                stroke="var(--n-400)"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className={styles.typeLabel}>Home</span>
          </div>
          <div
            className={`${styles.typeAvg}${stats.homeAvgPct === null ? ` ${styles.typeAvgEmpty}` : ''}`}
            style={stats.homeAvgPct !== null ? { color: tierColor(stats.homeAvgPct) } : undefined}
            aria-label={rateAriaLabel(stats.homeAvgPct)}
          >
            {fmtRate(stats.homeAvgPct)}
          </div>
          <div className={styles.typeCount}>
            {stats.homeCount > 0
              ? `${stats.homeCount} report${stats.homeCount !== 1 ? 's' : ''}`
              : 'No data yet'}
          </div>
        </div>
      </div>

      {/* Section 2 — Top providers */}
      {stats.providers.length > 0 && (
        <>
          <p className={`${styles.sectionLabel} ${styles.sectionLabelSpaced}`}>MOST REPORTED</p>
          <div className={styles.pillRow}>
            {stats.providers.map(p => (
              <span key={p} className={styles.pill}>{p}</span>
            ))}
          </div>
        </>
      )}

      {/* Section 3 — Recent reports */}
      <p className={`${styles.sectionLabel} ${styles.sectionLabelSpaced}`}>RECENT</p>
      <ul className={styles.recentList} role="list">
        {stats.recentReports.map((r: RecentReport, i: number) => (
          <li
            key={r.id}
            className={`${styles.recentRow}${i === stats.recentReports.length - 1 ? ` ${styles.recentRowLast}` : ''}`}
            role="listitem"
          >
            <SentimentFace sentiment={r.sentiment} size={24} />
            <span
              className={styles.recentRate}
              style={{ color: tierColor(r.rate_change_pct) }}
              aria-label={rateAriaLabel(r.rate_change_pct)}
            >
              {fmtRate(r.rate_change_pct)}
            </span>
            <span className={styles.recentMeta}>
              {r.provider} · {r.insurance_type === 'auto' ? 'Auto' : 'Home'}
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}

// ─── NeighbourhoodPanel ───────────────────────────────────────────────────────

interface NeighbourhoodPanelProps {
  stats:      NeighbourhoodStats | null
  loading:    boolean
  fsa:        string
  onClose:    () => void
  onCtaClick: () => void
}

export default function NeighbourhoodPanel({
  stats,
  loading,
  fsa,
  onClose,
  onCtaClick,
}: NeighbourhoodPanelProps) {
  const { prefersReduced } = useReducedMotion()
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const openerRef   = useRef<HTMLElement | null>(null)

  // Capture opener, focus close button on mount; restore focus on unmount
  useEffect(() => {
    openerRef.current = document.activeElement as HTMLElement
    closeBtnRef.current?.focus()
    return () => {
      openerRef.current?.focus()
    }
  }, [])

  // Escape key closes panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const isSparse = !stats || stats.totalCount < 3
  const title    = stats?.neighbourhood ?? fsa.toUpperCase()
  const ctaLabel = isSparse
    ? `Share your renewal in ${title}`
    : `See how your renewal compares in ${title}`

  return (
    <>
      {/* Backdrop */}
      <motion.div
        className={styles.backdrop}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: prefersReduced ? 0.15 : 0.3, ease: 'easeInOut' }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <motion.div
        className={styles.panel}
        style={{ transformOrigin: 'bottom center' }}
        initial={
          prefersReduced
            ? { opacity: 0 }
            : { y: 16, scale: 0.97, opacity: 0 }
        }
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={
          prefersReduced
            ? { opacity: 0, transition: { duration: 0.15 } }
            : {
                y: 8,
                opacity: 0,
                transition: {
                  duration: 0.18,
                  ease: [0.4, 0, 1, 1] as [number, number, number, number],
                },
              }
        }
        transition={
          prefersReduced
            ? { duration: 0.15 }
            : {
                duration: 0.34,
                ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
              }
        }
        role="dialog"
        aria-modal="true"
        aria-labelledby="np-title"
        aria-live="polite"
      >
        {/* Drag handle */}
        <div className={styles.dragHandle} aria-hidden="true" />

        {/* Header */}
        <div className={styles.header}>
          <h2 id="np-title" className={styles.headerTitle}>
            {title}
          </h2>
          <button
            ref={closeBtnRef}
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
              <path
                d="M1.5 1.5l7 7M8.5 1.5l-7 7"
                stroke="var(--n-400)"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className={styles.body}>
          {loading ? (
            <SkeletonBody />
          ) : stats && !isSparse ? (
            <AggregateBody stats={stats} />
          ) : (
            <SparseBody stats={stats} fsa={fsa} onCtaClick={onCtaClick} />
          )}
        </div>

        {/* CTA bar */}
        <div className={styles.ctaBar}>
          <button className={styles.ctaBtn} onClick={onCtaClick} aria-label={ctaLabel}>
            {isSparse ? 'Share your renewal →' : 'See how yours compares →'}
          </button>
        </div>
      </motion.div>
    </>
  )
}
