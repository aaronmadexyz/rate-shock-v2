// Safe localStorage wrappers — localStorage can throw in private browsing mode
// on certain browsers (iOS Safari with "Prevent Cross-Site Tracking" enabled).

export function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Fail silently — localStorage unavailable (private browsing, storage quota, etc.)
  }
}
