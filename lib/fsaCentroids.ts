// FSA → [lat, lng] approximate centroids for Ontario postal codes.
// Used to position map markers and fly-to on search.

export const FSA_CENTROIDS: Record<string, [number, number]> = {
  // Toronto — M
  M2N: [43.769, -79.413],
  M3K: [43.745, -79.475],
  M4K: [43.678, -79.352],
  M5T: [43.653, -79.402],
  M5V: [43.644, -79.396],
  M6H: [43.660, -79.437],
  M9B: [43.647, -79.554],

  // Peel / Halton — L
  L3Y: [44.055, -79.461],
  L4J: [43.800, -79.450],
  L5N: [43.587, -79.747],
  L6T: [43.693, -79.730],
  L6V: [43.683, -79.759],
  L7R: [43.319, -79.793],
  L8N: [43.232, -79.836],

  // Ottawa — K
  K1S: [45.413, -75.685],
  K1Y: [45.394, -75.742],
  K2J: [45.272, -75.845],

  // Southwestern Ontario — N
  N6A: [42.984, -81.245],

  // Northern Ontario — P
  P3A: [46.493, -80.993],
}

export function getCentroid(fsa: string): [number, number] | null {
  return FSA_CENTROIDS[fsa.toUpperCase()] ?? null
}
