// TODO: replace with live Supabase count query

const SEED_COUNTS: Record<string, number> = {
  M5V: 24,
  M5T: 18,
  M5A: 31,
  M6H: 14,
  M9B: 12,
  L6T: 19,
  L5N: 22,
  L4J: 16,
  L8N: 11,
  L5L: 27,
  K1S: 13,
  K2J: 15,
  M4K:  6,
  M2N:  4,
  M6P:  3,
  M4G:  7,
  M9W:  2,
  L6V:  5,
  L7R:  4,
  L4C:  8,
  L8S:  3,
  L3Y:  1,
  K1Y:  4,
  K2A:  7,
}

export function getFsaCount(fsa: string): number {
  return SEED_COUNTS[fsa.toUpperCase()] ?? 0
}
