/**
 * The six patterns this demo can fire. Recovered verbatim from
 * `combat-system-types.ts` on the `ats-remix-ideas` branch.
 */
export type ProjectilePattern =
  | 'fibonacciSphere'
  | 'torusKnot'
  | 'galaxy'
  | 'helix'
  | 'rose3D'
  | 'ring';

export const PROJECTILE_PATTERN_LABELS: Record<ProjectilePattern, string> = {
  fibonacciSphere: 'Fibonacci Sphere',
  torusKnot: 'Torus Knot',
  galaxy: 'Galaxy',
  helix: 'Helix',
  rose3D: 'Rose 3D',
  ring: 'Ring',
} as const;

/** Stable render order for the pattern picker. */
export const PROJECTILE_PATTERNS = Object.keys(
  PROJECTILE_PATTERN_LABELS,
) as ProjectilePattern[];
