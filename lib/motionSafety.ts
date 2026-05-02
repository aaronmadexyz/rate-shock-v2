import { useReducedMotion as useFramerReducedMotion } from 'framer-motion';
import { springs, type SpringName } from './springs';

export function useReducedMotion() {
  const prefersReduced = useFramerReducedMotion();

  return {
    prefersReduced: !!prefersReduced,

    // Use on any Framer Motion `transition` prop
    transition: prefersReduced ? { duration: 0 } : undefined,

    // Use when you need an explicit immediate flag (e.g. useAnimate)
    immediate: !!prefersReduced,

    // CSS value for envelope bob — set on the element's style
    bobPlayState: prefersReduced ? 'paused' : 'running',
  };
}

// Returns the named spring config, or { duration: 0 } when reduced motion is on.
// Pass the result directly to a Framer Motion `transition` prop.
export function safeSpring(
  springName: SpringName,
  prefersReduced: boolean,
): typeof springs[SpringName] | { duration: 0 } {
  if (prefersReduced) return { duration: 0 };
  return springs[springName];
}
