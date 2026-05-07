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
// Values are subtle — max 4% shift from the standard palette.
export const timeOfDayTokens: Record<TimeOfDayState, Record<string, string>> = {
  'morning': {
    '--tod-bg':  '#F2EFE8',
    '--tod-cta': '#3D4498',
  },
  'commute-am': {
    '--tod-bg':  '#F2EFE8',  // 3% warmer than n-50
    '--tod-cta': '#3D4498',  // 4% brighter than p-600
  },
  'day': {
    '--tod-bg':  '#F5F4F1',  // standard n-50
    '--tod-cta': '#3A3F8F',  // standard p-600
  },
  'commute-pm': {
    '--tod-bg':  '#F0EDE6',  // 4% warmer
    '--tod-cta': '#3D4498',  // 4% brighter
  },
  'evening': {
    '--tod-bg':  '#EDEAE3',  // 6% warmer, slightly darker
    '--tod-cta': '#3A3F8F',  // standard
  },
  'night': {
    '--tod-bg':  '#EDEAE3',
    '--tod-cta': '#3A3F8F',
  },
}
