import { useReducedMotion as useFramerReducedMotion } from 'framer-motion';

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

