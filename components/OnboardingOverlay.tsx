'use client'

import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import styles from '@/styles/Onboarding.module.css'

interface Props {
  isVisible: boolean
  onDismiss: () => void
  onSubmit:  () => void
}

const SPRING_GENTLE = { type: 'spring' as const, stiffness: 240, damping: 24, mass: 1 }

export default function OnboardingOverlay({ isVisible, onDismiss, onSubmit }: Props) {
  const cardRef = useRef<HTMLDivElement>(null)

  // Focus trap
  useEffect(() => {
    if (!isVisible) return
    const prev = document.activeElement as HTMLElement | null
    cardRef.current?.focus()
    return () => { prev?.focus() }
  }, [isVisible])

  // Escape to dismiss
  useEffect(() => {
    if (!isVisible) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isVisible, onDismiss])

  // Focus trap: keep Tab inside card
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'Tab' || !cardRef.current) return
    const focusable = cardRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    const first = focusable[0]
    const last  = focusable[focusable.length - 1]
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus() }
    } else {
      if (document.activeElement === last)  { e.preventDefault(); first.focus() }
    }
  }

  return (
    <AnimatePresence>
      {isVisible && (
        <>
          {/* Backdrop */}
          <motion.div
            key="onboarding-backdrop"
            className={styles.backdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            onClick={onDismiss}
            aria-hidden="true"
          />

          {/* Card */}
          <motion.div
            key="onboarding-card"
            className={styles.card}
            role="dialog"
            aria-modal="true"
            aria-labelledby="onboarding-title"
            tabIndex={-1}
            ref={cardRef}
            initial={{ opacity: 0, scale: 0.96, y: '-48%', x: '-50%' }}
            animate={{ opacity: 1, scale: 1,    y: '-50%', x: '-50%' }}
            exit={{   opacity: 0, scale: 0.96, y: '-48%', x: '-50%' }}
            transition={SPRING_GENTLE}
            style={{ top: '50%', left: '50%', transform: 'none' }}
            onKeyDown={handleKeyDown}
          >
            {/* Section 1 — Header */}
            <div className={styles.header}>
              <p className={styles.eyebrow}>Rate Map · Ontario</p>
              <h2 id="onboarding-title" className={styles.headline}>
                Is your renewal fair?
              </h2>
              <p className={styles.subhead}>
                See what drivers near you are actually paying — then share your own renewal to add to the map.
              </p>
            </div>

            {/* Section 2 — Preview comparison */}
            <div className={styles.preview}>
              <div className={styles.previewCols}>
                <div className={styles.previewCol}>
                  <span className={styles.previewLabel}>You</span>
                  <span className={`${styles.previewValue} ${styles.neg}`}>+18%</span>
                  <div className={`${styles.previewBar} ${styles.neg}`} />
                </div>
                <div className={styles.previewCol}>
                  <span className={styles.previewLabel}>Neighbours</span>
                  <span className={`${styles.previewValue} ${styles.cau}`}>+12%</span>
                  <div className={`${styles.previewBar} ${styles.cau}`} />
                </div>
                <div className={styles.previewCol}>
                  <span className={styles.previewLabel}>Ontario avg</span>
                  <span className={`${styles.previewValue} ${styles.pos}`}>+9.4%</span>
                  <div className={`${styles.previewBar} ${styles.pos}`} />
                </div>
              </div>
              <p className={styles.insightLine}>
                <strong style={{ fontWeight: 600, color: '#1A1917' }}>Your renewal is on the higher end for your area.</strong>{' '}
                Posting it helps others know what to expect at renewal time.
              </p>
              <span className={styles.disclaimer}>Sample data — not your actual rates</span>
            </div>

            {/* Section 3 — CTA footer */}
            <div className={styles.footer}>
              <button className={styles.ctaButton} onClick={onSubmit}>
                Post my renewal →
              </button>
              <button className={styles.skipLink} onClick={onDismiss}>
                Just exploring for now
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
