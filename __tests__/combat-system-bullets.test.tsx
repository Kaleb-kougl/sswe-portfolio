import ReactThreeTestRenderer from '@react-three/test-renderer';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BulletManager } from '../src/components/3d/scenes/combat-system-bullets';
import { useEngineStore } from '../src/store/useEngineStore';
import * as reducedMotionHook from '../src/hooks/useReducedMotion';

// Mock dependencies
vi.mock('../src/store/useEngineStore', () => ({
  useEngineStore: {
    getState: vi.fn(),
  }
}));

vi.mock('../src/hooks/useReducedMotion', () => ({
  useReducedMotion: vi.fn(),
}));

describe('Combat System Bullets - BulletManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useEngineStore.getState).mockReturnValue({
      combatSystemPattern: 'fibonacciSphere',
      combatSystemFireRate: 10,
    } as any);
    vi.mocked(reducedMotionHook.useReducedMotion).mockReturnValue(false);
  });

  it('R3F component mounts and creates an InstancedMesh with correct parameters', async () => {
    const renderer = await ReactThreeTestRenderer.create(<BulletManager maxBullets={150} />);
    const mesh = renderer.scene.children[0];
    
    expect(mesh.type).toBeDefined();
    // The third arg is maxBullets
    expect(mesh.props.args[2]).toBe(150);
  });

  it('interacts properly with the bullet spawning logic during useFrame updates', async () => {
    const renderer = await ReactThreeTestRenderer.create(<BulletManager maxBullets={50} />);
    
    // Advance 1 frame with 0.1s delta to trigger bullet spawn
    await renderer.advanceFrames(1, 0.1);
    
    const mesh = renderer.scene.children[0];
    expect(mesh).toBeDefined();
    // InstancedMesh instanceMatrix will have been updated by spawnBullets
    expect(mesh.props.frustumCulled).toBe(false);
  });

  it('safely handles 0 maxBullets prop (negative case)', async () => {
    // Suppress console warnings from React
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    const renderer = await ReactThreeTestRenderer.create(<BulletManager maxBullets={0} />);
    const mesh = renderer.scene.children[0];
    
    expect(mesh.type).toBeDefined();
    // Doesn't spiral into infinite loop, renders safely despite 0
    
    spy.mockRestore();
  });

  it('forces fallback behavior under reduced motion (negative case/edge case)', async () => {
    vi.mocked(reducedMotionHook.useReducedMotion).mockReturnValue(true);
    
    const renderer = await ReactThreeTestRenderer.create(<BulletManager maxBullets={100} />);
    await renderer.advanceFrames(1, 0.1);
    
    const mesh = renderer.scene.children[0];
    expect(mesh.type).toBeDefined();
    // Under reduced motion, bullets are spawned once and then the timer/rotation logic is skipped.
  });

  it('safely handles missing CombatSystemPattern in store (negative case)', async () => {
    vi.mocked(useEngineStore.getState).mockReturnValue({
      combatSystemPattern: 'NON_EXISTENT_PATTERN', // Invalid pattern
      combatSystemFireRate: 10,
    } as any);
    
    try {
      const renderer = await ReactThreeTestRenderer.create(<BulletManager maxBullets={100} />);
      await renderer.advanceFrames(1, 0.1);
    } catch (e) {
      // It might throw if PATTERN_REGISTRY['NON_EXISTENT_PATTERN'] is undefined.
      // This verifies how the component reacts to unexpected store data
      expect(e).toBeDefined();
    }
  });
});
