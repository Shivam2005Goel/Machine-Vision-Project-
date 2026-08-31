export function validateFaceletString(facelet: string): string | null {
  if (facelet.length !== 54) {
    return 'Incomplete scan. Scan all 6 faces.';
  }

  const counts = new Map<string, number>();
  for (const letter of facelet) {
    counts.set(letter, (counts.get(letter) ?? 0) + 1);
  }

  const FACELETTERS = ['U', 'R', 'F', 'D', 'L', 'B'] as const;
  for (const face of FACELETTERS) {
    if (counts.get(face) !== 9) {
      return 'Colour count mismatch. Re-scan in good light.';
    }
  }

  return null;
}
