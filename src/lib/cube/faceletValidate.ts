const FACELETS = ['U', 'R', 'F', 'D', 'L', 'B'] as const;

/** Fast reject before Cube.fromString — each face letter must appear 9 times. */
export function isFaceletColorBalanced(facelet: string): boolean {
  if (facelet.length !== 54) return false;

  const counts = new Map<string, number>();
  for (const ch of facelet) {
    counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }

  for (const face of FACELETS) {
    if ((counts.get(face) ?? 0) !== 9) return false;
  }

  return true;
}
