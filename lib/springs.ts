// Spring configs for Framer Motion — use these for all primary interactions.
// Never use duration-based transitions for interactive elements.
//
// Rules:
//   - Exits are faster than entries: exits use 'snappy' even when entry used 'gentle'
//   - Never animate from scale(0): start at scale(0.95) minimum
//   - Subsequent tooltips have no delay and no animation once one is open
//   - Stay under 300ms for interactive feedback
//   - Data animates once on mount only — never on re-render
//   - Envelopes have weight: use 'paper' spring for letter-drop, mass 1.4

export const springs = {
  snappy:     { stiffness: 500, damping: 30, mass: 0.7 },
  responsive: { stiffness: 400, damping: 28, mass: 0.8 },
  gentle:     { stiffness: 240, damping: 24, mass: 1.0 },
  cinematic:  { stiffness: 120, damping: 20, mass: 1.2 },
  paper:      { stiffness: 100, damping: 18, mass: 1.4 },
} as const;

export type SpringName = keyof typeof springs;

// CSS easing curves for non-spring contexts (CSS transitions, keyframe animations)
export const easings = {
  enter:  'cubic-bezier(0.16, 1, 0.3, 1)',   // fast-out overshoot — entries
  exit:   'cubic-bezier(0.4, 0, 1, 1)',       // accelerate to exit
  inOut:  'cubic-bezier(0.65, 0, 0.35, 1)',   // balanced in-out
  color:  'cubic-bezier(0.25, 0, 0.3, 1)',    // smooth colour transitions
} as const;
