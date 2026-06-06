export type CombatSystemPattern = 'fibonacciSphere' | 'torusKnot' | 'galaxy' | 'helix' | 'rose3D' | 'ring';
export const COMBAT_SYSTEM_PATTERN_LABELS: Record<CombatSystemPattern, string> = {
  fibonacciSphere: 'Fibonacci Sphere',
  torusKnot: 'Torus Knot',
  galaxy: 'Galaxy',
  helix: 'Helix',
  rose3D: 'Rose 3D',
  ring: 'Ring',
} as const;
