// Single source of truth for every interaction in the product.
// Components import from here rather than hardcoding animation values.

export const ANIMATION_SPEC = {
  // ─── ENVELOPE / MAP MARKERS ─────────────────────────────────────────────

  envelopeHover: {
    spring:          'responsive' as const,
    scale:           1.08,
    transformOrigin: 'bottom center',
  },

  envelopeHoverOut: {
    spring: 'snappy' as const,
  },

  envelopeBob: {
    type:        'css-keyframe' as const,
    y:           3,           // px
    period:      '3-5s',      // randomised per marker
    phaseRandom: true,
  },

  letterDrop: {
    spring: 'paper' as const,
    scale:  [0.95, 1]  as [number, number],
    y:      [-20, 0]   as [number, number],
    blur:   [4, 0]     as [number, number],   // filter: blur(4px) → blur(0)
  },

  // ─── TOOLTIPS ────────────────────────────────────────────────────────────

  tooltipFirst: {
    spring:  'responsive' as const,
    scale:   [0.95, 1] as [number, number],
    delay:   100,               // ms — small pause before first tooltip
    origin:  'trigger' as const,
  },

  tooltipSubsequent: {
    duration:  0,
    immediate: true,            // no animation once one tooltip is open
  },

  tooltipHide: {
    duration: 80,               // ms — faster than any spring; feels responsive
  },

  // ─── CARDS & PANELS ──────────────────────────────────────────────────────

  cardEnter: {
    spring: 'gentle' as const,
    y:      [16, 0]   as [number, number],
    scale:  [0.97, 1] as [number, number],
  },

  cardExit: {
    spring: 'snappy' as const,
    y:      [0, 8] as [number, number],
  },

  // ─── MODALS ──────────────────────────────────────────────────────────────

  modalEnter: {
    spring: 'gentle' as const,
    scale:  [0.96, 1] as [number, number],
  },

  modalExit: {
    spring:   'responsive' as const,
    scale:    [1, 0.97] as [number, number],
    duration: 150,    // ms cap — modal exits should feel quick
  },

  // ─── FILTER SHEET (mobile) ───────────────────────────────────────────────

  filterSheetEnter: {
    spring: 'gentle' as const,
    y:      ['100%', '0%'] as [string, string],
  },

  filterSheetExit: {
    spring: 'responsive' as const,
  },

  // ─── DATA VISUALISATION ──────────────────────────────────────────────────

  sentimentBarFill: {
    spring:  'gentle' as const,
    stagger: 60,        // ms between each bar
  },

  countUp: {
    spring:      'cinematic' as const,
    oneTimeOnly: true,    // animates once on mount — never re-triggers on re-render
  },

  // ─── INTERACTIVE CONTROLS ────────────────────────────────────────────────

  buttonPress: {
    type:  'css-active' as const,
    scale: 0.97,
  },

  providerFilter: {
    spring:          'responsive' as const,
    opacityInactive: 0.08,    // non-selected providers fade to near-invisible
  },

  // ─── MAP ─────────────────────────────────────────────────────────────────

  mapZoom: {
    type:          'leaflet-flyTo' as const,
    duration:      1.2,         // seconds
    easeLinearity: 0.1,
  },

  // ─── ACCESSIBILITY ───────────────────────────────────────────────────────

  // When prefers-reduced-motion is active:
  //   - All springs become { duration: 0 }
  //   - Envelope bob is paused via CSS animation-play-state: paused
  //   - countUp shows final value immediately
  //   - map zoom uses setView() instead of flyTo()
  reducedMotion: 'all springs become duration:0, map zoom becomes setView()' as const,
} as const;

export type AnimationSpecKey = keyof typeof ANIMATION_SPEC;
