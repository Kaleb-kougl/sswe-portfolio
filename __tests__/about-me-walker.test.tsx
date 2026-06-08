import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { AboutMeWalker } from '@/components/3d/scenes/about-me-walker';

// Mock dependencies
vi.mock('@react-three/drei', () => ({
  useGLTF: Object.assign(vi.fn(() => ({
    scene: { type: 'Group', scale: { setScalar: vi.fn() } },
    animations: [{ name: 'Walking' }, { name: 'Waving' }]
  })), { preload: vi.fn() })
}));

vi.mock('three/examples/jsm/utils/SkeletonUtils.js', () => ({
  clone: vi.fn((scene) => ({ type: 'Group', scale: { setScalar: vi.fn() } }))
}));

// Mock AnimationMixer
vi.mock('three', async () => {
  const actual = await vi.importActual<any>('three');
  const AnimationMixerMock = function() {
    this.clipAction = vi.fn().mockReturnValue({
      reset: vi.fn().mockReturnThis(),
      fadeIn: vi.fn().mockReturnThis(),
      play: vi.fn().mockReturnThis(),
      fadeOut: vi.fn().mockReturnThis(),
    });
    this.update = vi.fn();
  };
  return {
    ...actual,
    AnimationMixer: AnimationMixerMock
  };
});

describe('AboutMeWalker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adjusts target rotation for Walking animation', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <AboutMeWalker sphereRadius={1.2} animationName="Walking" />
    );
    
    // Get the top-level group
    const group = renderer.scene.children[0];
    
    // Initial rotation is [0, -Math.PI / 2, 0]
    expect(group.instance.rotation.y).toBe(-Math.PI / 2);
    
    // Advance frames. targetY for Walking is -Math.PI / 2.
    // It should lerp towards -Math.PI / 2 (which it is already at).
    await renderer.advanceFrames(5, 0.1);
    
    expect(group.instance.rotation.y).toBe(-Math.PI / 2);
  });

  it('adjusts target rotation for Waving animation', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <AboutMeWalker sphereRadius={1.2} animationName="Waving" />
    );
    
    const group = renderer.scene.children[0];
    
    // Initial rotation is [0, -Math.PI / 2, 0]
    expect(group.instance.rotation.y).toBe(-Math.PI / 2);
    
    // Advance frames. targetY for Waving is 0.
    // It should lerp towards 0. 
    await renderer.advanceFrames(1, 0.1); // 1 frame, delta = 0.1 -> lerp factor 5 * 0.1 = 0.5
    
    // -Math.PI / 2 = -1.57079. Lerp halfway to 0 is ~ -0.785
    expect(group.instance.rotation.y).toBeGreaterThan(-Math.PI / 2);
    expect(group.instance.rotation.y).toBeLessThan(0);
    
    // Advance more frames to get closer to 0
    await renderer.advanceFrames(10, 0.1);
    
    expect(group.instance.rotation.y).toBeCloseTo(0, 2);
  });
});
