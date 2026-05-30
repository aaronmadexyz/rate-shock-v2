export type TimeOfDayState = 'morning' | 'commute-am' |
  'day' | 'commute-pm' | 'evening' | 'night'

export function getTimeOfDay(): TimeOfDayState {
  const hour = new Date().getHours()
  if (hour >= 6  && hour < 9)  return 'commute-am'
  if (hour >= 9  && hour < 17) return 'day'
  if (hour >= 17 && hour < 20) return 'commute-pm'
  if (hour >= 20 && hour < 23) return 'evening'
  return 'night'
}

// CSS variable shifts per time of day.
// --tod-bg variants are intentional warm offsets from n-50 (#F5F4F1).
// They are application-specific and not in the main token table.
// --tod-cta snapped to p-600 (#3A3F8F) — the standard CTA colour.
export const timeOfDayTokens: Record<TimeOfDayState, Record<string, string>> = {
  'morning': {
    '--tod-bg':  '#F2EFE8', // +3% warm offset from n-50 — intentional
    '--tod-cta': '#3A3F8F', // p-600
  },
  'commute-am': {
    '--tod-bg':  '#F2EFE8', // +3% warm offset from n-50 — intentional
    '--tod-cta': '#3A3F8F', // p-600
  },
  'day': {
    '--tod-bg':  '#F5F4F1', // n-50 standard
    '--tod-cta': '#3A3F8F', // p-600
  },
  'commute-pm': {
    '--tod-bg':  '#F0EDE6', // +4% warm offset from n-50 — intentional
    '--tod-cta': '#3A3F8F', // p-600
  },
  'evening': {
    '--tod-bg':  '#EDEAE3', // +6% warm offset from n-50 — intentional
    '--tod-cta': '#3A3F8F', // p-600
  },
  'night': {
    '--tod-bg':  '#EDEAE3', // +6% warm offset from n-50 — intentional
    '--tod-cta': '#3A3F8F', // p-600
  },
}
