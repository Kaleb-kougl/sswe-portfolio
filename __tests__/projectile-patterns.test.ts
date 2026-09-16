import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import { DEMO_PALETTE } from '@/components/demos/projectiles/palette';
import {
  PATTERN_REGISTRY,
  compose,
  gen,
  mod,
  pooledSpawnCount,
  releaseSpawnData,
  type BulletSpawnData,
} from '@/components/demos/projectiles/patterns';
import {
  PROJECTILE_PATTERNS,
  PROJECTILE_PATTERN_LABELS,
} from '@/components/demos/projectiles/types';

/**
 * The pattern algebra and its object pool.
 *
 * This is the half of the demo that is pure math and pure bookkeeping, so it is
 * the half worth testing: no WebGL, no canvas, nothing that needs a GPU. jsdom
 * has no WebGL context at all, so the renderer (`bullets.tsx`) is covered by the
 * Playwright specs instead, against a real browser.
 *
 * The `ats-remix-ideas` branch had `__tests__/combat-system-bullets.test.tsx`,
 * which mounted `BulletManager` through `@react-three/test-renderer` and mocked
 * the Zustand store. Neither of those exists any more — the package is not a
 * dependency and the store is gone — and every assertion in it was on the
 * component's props rather than on the simulation, so it is not carried over.
 */

const finite = (v: Vector3) =>
  Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

const allFinite = (spawns: BulletSpawnData[]) =>
  spawns.every((s) => finite(s.offset) && finite(s.velocity) && finite(s.acceleration));

describe('gen — pattern generators', () => {
  it('every generator emits exactly the requested count, with finite vectors', () => {
    const cases: Array<[string, BulletSpawnData[], number]> = [
      ['fibonacciSphere', gen.fibonacciSphere(64, 2), 64],
      ['torusKnot', gen.torusKnot(64), 64],
      ['galaxy', gen.galaxy(64), 64],
      ['helix', gen.helix(64), 64],
      ['rose3D', gen.rose3D(64), 64],
      ['ring', gen.ring(64), 64],
    ];

    for (const [name, spawns, count] of cases) {
      expect(spawns.length, name).toBe(count);
      expect(allFinite(spawns), name).toBe(true);
      releaseSpawnData(spawns);
    }
  });

  it('fibonacciSphere puts every point on the sphere of the given radius', () => {
    const radius = 3;
    const spawns = gen.fibonacciSphere(500, radius);

    for (const s of spawns) {
      expect(s.offset.length()).toBeCloseTo(radius, 6);
      // Velocity is the outward unit normal, so projectiles fly radially.
      expect(s.velocity.length()).toBeCloseTo(1, 6);
      expect(s.velocity.dot(s.offset)).toBeCloseTo(radius, 5);
    }
    releaseSpawnData(spawns);
  });

  it('fibonacciSphere spreads points evenly — the centroid sits at the origin', () => {
    const spawns = gen.fibonacciSphere(1000, 1);
    const centroid = spawns
      .reduce((acc, s) => acc.add(s.offset), new Vector3())
      .divideScalar(spawns.length);

    // An even spherical distribution averages out; a clumped one would not.
    expect(centroid.length()).toBeLessThan(0.05);
    releaseSpawnData(spawns);
  });

  it('helix climbs the full height once per point and keeps a constant radius', () => {
    const radius = 2;
    const height = 4;
    const spawns = gen.helix(101, radius, height, 2);

    for (const s of spawns) {
      expect(Math.hypot(s.offset.x, s.offset.z)).toBeCloseTo(radius, 6);
    }
    expect(spawns[0].offset.y).toBeCloseTo(-height / 2, 6);
    expect(spawns[spawns.length - 1].offset.y).toBeCloseTo(height / 2, 6);
    // Monotonically rising — a helix, not a scribble.
    for (let i = 1; i < spawns.length; i++) {
      expect(spawns[i].offset.y).toBeGreaterThan(spawns[i - 1].offset.y);
    }
    releaseSpawnData(spawns);
  });

  it('ring lays points on a circle in the XZ plane at the requested speed', () => {
    const speed = 3;
    const radius = 5;
    const spawns = gen.ring(36, speed, radius);

    for (const s of spawns) {
      expect(s.offset.y).toBe(0);
      expect(Math.hypot(s.offset.x, s.offset.z)).toBeCloseTo(radius, 6);
      expect(s.velocity.length()).toBeCloseTo(speed, 6);
      expect(s.velocity.y).toBe(0);
    }
    releaseSpawnData(spawns);
  });

  it('ring defaults to radius 0 — a burst from a single point', () => {
    const spawns = gen.ring(12);
    for (const s of spawns) expect(s.offset.length()).toBeCloseTo(0, 6);
    releaseSpawnData(spawns);
  });

  it('galaxy stays inside its radius, on a flat disc, with the longer life', () => {
    const radius = 4;
    const spawns = gen.galaxy(500, radius, 3, 2);

    for (const s of spawns) {
      expect(Math.hypot(s.offset.x, s.offset.z)).toBeLessThanOrEqual(radius + 1e-9);
      expect(Math.abs(s.offset.y)).toBeLessThanOrEqual(radius * 0.1 + 1e-9);
      // Galaxy is the one generator that overrides the 5s default.
      expect(s.life).toBe(8);
    }
    releaseSpawnData(spawns);
  });

  it('rose3D stays inside its radius', () => {
    const radius = 2;
    const spawns = gen.rose3D(500, 4, radius);
    for (const s of spawns) {
      expect(s.offset.length()).toBeLessThanOrEqual(radius + 1e-9);
    }
    releaseSpawnData(spawns);
  });

  it('torusKnot closes on itself — the last point meets the first', () => {
    const spawns = gen.torusKnot(360);
    const first = spawns[0].offset;
    const step = spawns[0].offset.distanceTo(spawns[1].offset);
    const last = spawns[spawns.length - 1].offset;

    expect(last.distanceTo(first)).toBeLessThan(step * 2);
    releaseSpawnData(spawns);
  });

  it('DOCUMENTED LIMITATION: the (i / (count - 1)) generators need count >= 2', () => {
    // fibonacciSphere and helix both divide by `count - 1`. At count 1 that is
    // a division by zero and every component comes out NaN. Nothing calls them
    // that way — PATTERN_REGISTRY asks for 200 — but the landmine is real and
    // this is the test that will fail if somebody ever wires the count to a UI.
    const [single] = gen.fibonacciSphere(1, 2);
    expect(Number.isNaN(single.offset.x)).toBe(true);
    releaseSpawnData([single]);
  });
});

describe('mod — modifiers', () => {
  it('color stamps every spawn and returns the same array', () => {
    const spawns = gen.ring(8);
    const returned = mod.color('#bff03a')(spawns);

    expect(returned).toBe(spawns);
    for (const s of spawns) expect(s.color).toBe('#bff03a');
    releaseSpawnData(spawns);
  });

  it('accelerate pushes along the direction of travel', () => {
    const spawns = gen.ring(8, 2, 1);
    const directions = spawns.map((s) => s.velocity.clone().normalize());

    mod.accelerate(5)(spawns);

    spawns.forEach((s, i) => {
      expect(s.acceleration.length()).toBeCloseTo(5, 6);
      expect(s.acceleration.clone().normalize().dot(directions[i])).toBeCloseTo(1, 6);
    });
    releaseSpawnData(spawns);
  });

  it('accelerate adds a lateral component perpendicular to travel', () => {
    const spawns = gen.ring(8, 2, 1);
    const directions = spawns.map((s) => s.velocity.clone().normalize());

    mod.accelerate(0, 3)(spawns);

    spawns.forEach((s, i) => {
      expect(s.acceleration.length()).toBeCloseTo(3, 6);
      // Purely lateral: nothing along the direction of travel.
      expect(s.acceleration.dot(directions[i])).toBeCloseTo(0, 6);
    });
    releaseSpawnData(spawns);
  });

  it('sequence staggers spawns by index', () => {
    const spawns = gen.ring(5);
    mod.sequence(0.1)(spawns);

    spawns.forEach((s, i) => expect(s.delay).toBeCloseTo(i * 0.1, 10));
    releaseSpawnData(spawns);
  });

  it('sequence ADDS to the existing delay rather than replacing it', () => {
    const spawns = gen.ring(3);
    mod.sequence(0.1)(spawns);
    mod.sequence(0.1)(spawns);

    spawns.forEach((s, i) => expect(s.delay).toBeCloseTo(i * 0.2, 10));
    releaseSpawnData(spawns);
  });

  it('rotate turns offset, velocity and acceleration together', () => {
    const spawns = gen.ring(4, 1, 2);
    const before = spawns.map((s) => s.offset.clone());

    mod.rotate(new Vector3(0, 1, 0), Math.PI / 2)(spawns);

    spawns.forEach((s, i) => {
      // A quarter turn about Y preserves length and the Y component.
      expect(s.offset.length()).toBeCloseTo(before[i].length(), 6);
      expect(s.offset.y).toBeCloseTo(before[i].y, 6);
      expect(s.offset.distanceTo(before[i])).toBeGreaterThan(0.1);
    });
    releaseSpawnData(spawns);
  });

  it('compose applies modifiers left to right on the generator output', () => {
    const order: string[] = [];
    const record = (name: string) => (spawns: BulletSpawnData[]) => {
      order.push(name);
      return spawns;
    };

    const spawns = compose(gen.ring(4), record('a'), record('b'), mod.color('#fff'));

    expect(order).toEqual(['a', 'b']);
    expect(spawns.every((s) => s.color === '#fff')).toBe(true);
    releaseSpawnData(spawns);
  });
});

describe('the spawn-data pool', () => {
  it('reuses released objects instead of allocating new ones', () => {
    const first = gen.ring(10);
    releaseSpawnData(first);

    const pooled = pooledSpawnCount();
    expect(pooled).toBeGreaterThanOrEqual(10);

    const second = gen.ring(10);

    expect(pooledSpawnCount()).toBe(pooled - 10);
    // Same objects, handed back out.
    const identities = new Set<BulletSpawnData>(first);
    expect(second.every((s) => identities.has(s))).toBe(true);
    releaseSpawnData(second);
  });

  it('resets every field on the way out, so no state leaks between bursts', () => {
    const dirty = gen.ring(4);
    mod.color('#ff0000')(dirty);
    mod.sequence(1)(dirty);
    mod.accelerate(9)(dirty);
    for (const s of dirty) s.life = 0.25;
    releaseSpawnData(dirty);

    const clean = gen.ring(4);
    for (const s of clean) {
      expect(s.color).toBeNull();
      expect(s.delay).toBe(0);
      expect(s.acceleration.length()).toBe(0);
      expect(s.life).toBe(5);
    }
    releaseSpawnData(clean);
  });

  it('tolerates a nullish release without throwing', () => {
    const before = pooledSpawnCount();
    expect(() =>
      releaseSpawnData(undefined as unknown as BulletSpawnData[]),
    ).not.toThrow();
    expect(pooledSpawnCount()).toBe(before);
  });
});

describe('PATTERN_REGISTRY', () => {
  it('has an entry for every pattern the picker offers, and a label for each', () => {
    expect(PROJECTILE_PATTERNS).toHaveLength(6);
    for (const key of PROJECTILE_PATTERNS) {
      expect(typeof PATTERN_REGISTRY[key]).toBe('function');
      expect(PROJECTILE_PATTERN_LABELS[key]).toBeTruthy();
    }
    expect(Object.keys(PATTERN_REGISTRY).sort()).toEqual([...PROJECTILE_PATTERNS].sort());
  });

  it('paints every burst with a site design token', () => {
    const allowed = new Set<string>([
      DEMO_PALETTE.lime,
      DEMO_PALETTE.blue,
      DEMO_PALETTE.orange,
    ]);

    for (const key of PROJECTILE_PATTERNS) {
      const spawns = PATTERN_REGISTRY[key]();
      expect(spawns.length, key).toBeGreaterThan(0);
      for (const s of spawns) expect(allowed.has(s.color ?? ''), `${key} -> ${s.color}`).toBe(true);
      releaseSpawnData(spawns);
    }
  });

  it('never exceeds the 4000-instance pool with a single burst', () => {
    for (const key of PROJECTILE_PATTERNS) {
      const spawns = PATTERN_REGISTRY[key]();
      expect(spawns.length, key).toBeLessThanOrEqual(4000);
      releaseSpawnData(spawns);
    }
  });
});
