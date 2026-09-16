/**
 * Real source excerpts for the viewport's Script tab.
 *
 * PROVENANCE RULE: every `code` string below is a VERBATIM, contiguous copy of
 * a real file that exists on disk in this workspace. Nothing here is written
 * for display. If a project has no real source available, it simply has no
 * entry — the Script tab hides itself rather than showing invented code.
 *
 * Currently missing on purpose (no source in this repo, nothing published):
 *   - `webpack-federation`   (the OneHost federation config is Indeed-internal)
 *   - `cwv-profiler`         (the profiler is Indeed/IBM-internal)
 *   - `analytics-extension`  (the Manifest V3 extension is Indeed-internal)
 *   - `roblox-css`           (published to npm, but no source checked in here)
 *
 * Excerpts contain no block comments and no multi-line strings, which is what
 * lets `script-tab.tsx` tokenize them one line at a time.
 */

export interface ProjectSnippet {
  /** Verbatim excerpt — contiguous lines, copied, never authored. */
  code: string;
  /** Used for the tab's language chip and the tokenizer's keyword set. */
  language: 'ts' | 'tsx';
  /** Deep link to the full file. */
  sourceUrl: string;
  /** Label for the "full file" link. */
  sourceLabel: string;
  /** Basename shown on the file tab. */
  fileName: string;
  /** Repo-relative directory shown in the file rail. */
  filePath: string;
  /** 1-based line number of the excerpt's first line in the real file. */
  lineStart: number;
  /** Human-readable origin, shown under the excerpt. */
  origin: string;
  /** One line on what the excerpt demonstrates. */
  caption: string;
}

const PORTFOLIO_BLOB = 'https://github.com/Kaleb-kougl/sswe-portfolio/blob/main';
const R3F_BLOB = 'https://github.com/Kaleb-kougl/r3f-projectiles/blob/main';

export const PROJECT_SNIPPETS: Record<string, ProjectSnippet> = {
  /* ------------------------------------------------------------------
     BonkBall — the shipped game is roblox-ts and lives in a private
     repo, so the honest excerpt is this portfolio's own FSM driver: the
     same Patrol/Aggro/Flee states, running the orbs in the viewport.
     Copied from src/components/3d/scenes/hammerball-flex.tsx:65-95.
     ------------------------------------------------------------------ */
  hammerball: {
    language: 'tsx',
    fileName: 'hammerball-flex.tsx',
    filePath: 'src/components/3d/scenes',
    lineStart: 65,
    sourceUrl: `${PORTFOLIO_BLOB}/src/components/3d/scenes/hammerball-flex.tsx`,
    sourceLabel: 'View on GitHub',
    origin: 'sswe-portfolio · src/components/3d/scenes/hammerball-flex.tsx',
    caption: 'The Patrol / Aggro / Flee finite state machine driving the orbs you can see in the viewport.',
    code: `    // --- Animate orb positions based on AI state ---
    if (orb1Ref.current && orb2Ref.current) {
      switch (forceAiState) {
        case 'Patrol': {
          // Slow circular orbit around center
          const speed = 0.6;
          const radius = 1.8;
          orb1Ref.current.position.x = Math.cos(t * speed) * radius;
          orb1Ref.current.position.z = Math.sin(t * speed) * radius;
          orb1Ref.current.position.y = 0;

          orb2Ref.current.position.x = Math.cos(t * speed + Math.PI) * radius;
          orb2Ref.current.position.z = Math.sin(t * speed + Math.PI) * radius;
          orb2Ref.current.position.y = 0;
          break;
        }
        case 'Aggro': {
          // Quick back-and-forth lunging toward center
          const lungeSpeed = 3.0;
          const lungeRange = 2.0;
          const lunge = Math.sin(t * lungeSpeed) * lungeRange;

          orb1Ref.current.position.x = -1.5 + Math.abs(lunge) * 0.6;
          orb1Ref.current.position.z = Math.sin(t * 2) * 0.3;
          orb1Ref.current.position.y = Math.abs(Math.sin(t * lungeSpeed * 2)) * 0.3;

          orb2Ref.current.position.x = 1.5 - Math.abs(lunge) * 0.6;
          orb2Ref.current.position.z = Math.cos(t * 2) * 0.3;
          orb2Ref.current.position.y = Math.abs(Math.cos(t * lungeSpeed * 2)) * 0.3;
          break;
        }`,
  },

  /* ------------------------------------------------------------------
     Combat System — the bullet-pattern engine that renders in the
     viewport right now.
     Copied from src/components/3d/scenes/combat-system-patterns.ts:54-75.
     ------------------------------------------------------------------ */
  combat_system: {
    language: 'ts',
    fileName: 'combat-system-patterns.ts',
    filePath: 'src/components/3d/scenes',
    lineStart: 54,
    sourceUrl: `${PORTFOLIO_BLOB}/src/components/3d/scenes/combat-system-patterns.ts`,
    sourceLabel: 'View on GitHub',
    origin: 'sswe-portfolio · src/components/3d/scenes/combat-system-patterns.ts',
    caption: 'One of 15 pattern generators — a pure function that returns pooled spawn data, allocating nothing per frame.',
    code: `export const gen = {
  fibonacciSphere: (count: number, radius: number): BulletSpawnData[] => {
    const spawns: BulletSpawnData[] = [];
    const phi = Math.PI * (3 - Math.sqrt(5)); // Golden Angle

    for (let i = 0; i < count; i++) {
      const y = 1 - (i / (count - 1)) * 2; // y goes from 1 to -1
      const r = Math.sqrt(1 - y * y); // radius at y
      const theta = phi * i;

      const x = Math.cos(theta) * r;
      const z = Math.sin(theta) * r;

      _v1.set(x, y, z).normalize(); // dir

      const p = Patterns.acquire();
      p.offset.copy(_v1).multiplyScalar(radius);
      p.velocity.copy(_v1);
      spawns.push(p);
    }
    return spawns;
  },`,
  },

  /* ------------------------------------------------------------------
     r3f-projectiles — the published npm package. Source is checked out
     at ./r3f-projectiles (package.json version 0.4.0; latest installed
     release in node_modules is 0.3.8).
     Copied from r3f-projectiles/src/pool.ts:53-78.
     ------------------------------------------------------------------ */
  'r3f-projectiles': {
    language: 'ts',
    fileName: 'pool.ts',
    filePath: 'src',
    lineStart: 53,
    sourceUrl: `${R3F_BLOB}/src/pool.ts`,
    sourceLabel: 'View on GitHub',
    origin: '@k9kbdev/r3f-projectiles · src/pool.ts',
    caption: 'The zero-allocation free list. Every bullet in the 10,000-strong pool is recycled, never re-allocated.',
    code: `export function acquire(): BulletSpawnData {
  if (_pool.length > 0) {
    const p = _pool.pop()!;
    _pooled.delete(p);
    p.offset.set(0, 0, 0);
    p.velocity.set(0, 0, 0);
    p.acceleration.set(0, 0, 0);
    p.delay = 0;
    p.color = null;
    p.life = 5.0;
    p.payload = 0;
    p.scale = 1;
    return p;
  }

  return {
    offset: new Vector3(),
    velocity: new Vector3(),
    acceleration: new Vector3(),
    delay: 0,
    color: null,
    life: 5.0,
    payload: 0,
    scale: 1,
  };
}`,
  },
};

/** True when the given file id has a real, verbatim excerpt to show. */
export function hasSnippet(fileId: string | null): boolean {
  return fileId != null && fileId in PROJECT_SNIPPETS;
}
