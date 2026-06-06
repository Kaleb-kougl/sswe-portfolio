import { Vector3, Quaternion } from 'three';
import type { CombatSystemPattern } from './combat-system-types';

const _pool: BulletSpawnData[] = [];
const _maxPoolSize = 20000;

const _v1 = new Vector3();
const _v2 = new Vector3();
const _v3 = new Vector3();
const _q1 = new Quaternion();

export interface BulletSpawnData {
  offset: Vector3;
  velocity: Vector3;
  acceleration: Vector3;
  delay: number;
  color: number | null;
  life: number;
}

const Patterns = {
  acquire: (): BulletSpawnData => {
    if (_pool.length > 0) {
      const p = _pool.pop()!;
      p.offset.set(0, 0, 0);
      p.velocity.set(0, 0, 0);
      p.acceleration.set(0, 0, 0);
      p.delay = 0;
      p.color = null;
      p.life = 5.0;
      return p;
    }
    return {
      offset: new Vector3(),
      velocity: new Vector3(),
      acceleration: new Vector3(),
      delay: 0,
      color: null,
      life: 5.0,
    };
  },
};

export const releaseSpawnData = (arr: BulletSpawnData[]) => {
  if (!arr) return;
  for (let i = 0; i < arr.length; i++) {
    if (_pool.length < _maxPoolSize) {
      _pool.push(arr[i]);
    }
  }
};

export const gen = {
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
  },

  torusKnot: (count: number, p_knot: number = 2, q_knot: number = 3, radius: number = 2): BulletSpawnData[] => {
    const spawns: BulletSpawnData[] = [];
    for (let i = 0; i < count; i++) {
      const t = (i / count) * Math.PI * 2;

      // Parametric Torus Knot
      const r = Math.cos(q_knot * t) + 2;
      const x = r * Math.cos(p_knot * t);
      const y = -Math.sin(q_knot * t);
      const z = r * Math.sin(p_knot * t);

      const pos = _v1.set(x, y, z).multiplyScalar(radius * 0.5);

      const spawned = Patterns.acquire();
      spawned.offset.copy(pos);
      spawned.velocity.copy(pos).normalize();
      spawns.push(spawned);
    }
    return spawns;
  },

  galaxy: (count: number, radius: number = 4, arms: number = 3, spin: number = 2): BulletSpawnData[] => {
    const spawns: BulletSpawnData[] = [];
    for (let i = 0; i < count; i++) {
      const armIndex = i % arms;
      const dist = Math.random();
      // Logarithmic distribution for density near center
      const d = dist * dist;

      const angle = d * spin + armIndex * ((Math.PI * 2) / arms);
      const r = d * radius;

      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      const y = (Math.random() - 0.5) * (radius * 0.2); // Flat disc with some thickness

      const p = Patterns.acquire();
      p.offset.set(x, y, z);
      p.velocity.set(Math.cos(angle + Math.PI / 2), 0, Math.sin(angle + Math.PI / 2));
      p.life = 8.0;
      spawns.push(p);
    }
    return spawns;
  },

  helix: (count: number, radius: number = 2, height: number = 4, turns: number = 2): BulletSpawnData[] => {
    const spawns: BulletSpawnData[] = [];
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1); // 0 to 1
      const angle = t * Math.PI * 2 * turns;

      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = (t - 0.5) * height;

      const p = Patterns.acquire();
      p.offset.set(x, y, z);
      p.velocity.set(Math.cos(angle), 0, Math.sin(angle));
      spawns.push(p);
    }
    return spawns;
  },

  rose3D: (count: number, k: number = 4, radius: number = 2): BulletSpawnData[] => {
    const spawns: BulletSpawnData[] = [];
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;

      // R modulated by cosine of angle * k
      const r = Math.abs(Math.cos(k * theta)) * radius;

      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.cos(phi);
      const z = r * Math.sin(phi) * Math.sin(theta);

      const pos = _v1.set(x, y, z);
      const p = Patterns.acquire();
      p.offset.copy(pos);
      p.velocity.copy(pos).normalize();
      spawns.push(p);
    }
    return spawns;
  },

  ring: (count: number, speed: number = 2, radius: number = 0): BulletSpawnData[] => {
    const spawns: BulletSpawnData[] = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const p = Patterns.acquire();
      p.offset.set(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
      p.velocity.set(Math.sin(angle), 0, Math.cos(angle)).multiplyScalar(speed);
      spawns.push(p);
    }
    return spawns;
  },
};

type Modifier = (spawns: BulletSpawnData[]) => BulletSpawnData[];

export const mod = {
  color:
    (col: number): Modifier =>
    (spawns: BulletSpawnData[]) => {
      spawns.forEach((s) => (s.color = col));
      return spawns;
    },

  accelerate:
    (forward: number, lateral: number = 0): Modifier =>
    (spawns: BulletSpawnData[]) => {
      spawns.forEach((s) => {
        const dir = _v1.copy(s.velocity).normalize();
        s.acceleration.addScaledVector(dir, forward);
        if (lateral !== 0) {
          // Compute a lateral direction (perpendicular to velocity and up)
          // Fallback to right if velocity is exactly up/down
          const up = Math.abs(dir.y) > 0.99 ? _v3.set(1, 0, 0) : _v3.set(0, 1, 0);
          const right = _v2.crossVectors(dir, up).normalize();
          s.acceleration.addScaledVector(right, lateral);
        }
      });
      return spawns;
    },

  sequence:
    (delayStep: number): Modifier =>
    (spawns: BulletSpawnData[]) => {
      spawns.forEach((s, i) => {
        s.delay += i * delayStep;
      });
      return spawns;
    },

  rotate:
    (axis: Vector3, angle: number): Modifier =>
    (spawns: BulletSpawnData[]) => {
      const q = _q1.setFromAxisAngle(axis.normalize(), angle);
      spawns.forEach((s) => {
        s.velocity.applyQuaternion(q);
        s.acceleration.applyQuaternion(q);
        s.offset.applyQuaternion(q);
      });
      return spawns;
    },
};

export const compose = (generatorResult: BulletSpawnData[], ...modifiers: Modifier[]): BulletSpawnData[] => {
  const data = generatorResult;
  modifiers.forEach((m) => {
    if (m) m(data);
  });
  return data;
};

export const PATTERN_REGISTRY = {
  fibonacciSphere: () => compose(gen.fibonacciSphere(200, 2), mod.color(0x39FF14)),
  torusKnot: () => compose(gen.torusKnot(300), mod.color(0xFF3333)),
  galaxy: () => compose(gen.galaxy(250), mod.color(0x6666FF)),
  helix: () => compose(gen.helix(200), mod.color(0xFF66FF)),
  rose3D: () => compose(gen.rose3D(200), mod.color(0xFFFF33)),
  ring: () => compose(gen.ring(100), mod.color(0x33FFFF)),
} as const satisfies Record<CombatSystemPattern, () => BulletSpawnData[]>;
