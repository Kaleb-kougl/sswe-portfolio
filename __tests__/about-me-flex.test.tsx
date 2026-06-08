import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { AboutMeFlex } from '@/components/3d/scenes/about-me-flex';
import { useEngineStore } from '@/store/useEngineStore';
import { SPHERE_ROTATION_SPEED } from '@/components/3d/scenes/about-me-walker';
import { Group } from 'three';

// Mock the store
vi.mock('@/store/useEngineStore', () => ({
  useEngineStore: vi.fn(),
}));

// Mock the orchestrator's useSceneGroup
vi.mock('@/components/3d/scene-orchestrator', () => ({
  useSceneGroup: () => React.createRef<Group>(),
}));

// Mock AboutMeWalker to simplify testing its props
vi.mock('@/components/3d/scenes/about-me-walker', async () => {
  const actual = await vi.importActual<any>('@/components/3d/scenes/about-me-walker');
  return {
    ...actual,
    AboutMeWalker: (props: any) => (
      <group name="mock-walker" userData={{ animationName: props.animationName }} />
    ),
  };
});

describe('AboutMeFlex', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Waving animation and does not rotate sphere when isOverview is true', async () => {
    (useEngineStore as any).mockImplementation((selector: any) => {
      return selector({ activeFileId: 'overview' });
    });

    const renderer = await ReactThreeTestRenderer.create(<AboutMeFlex />);
    
    // Verify animationName passed to AboutMeWalker
    const walker = renderer.scene.findByProps({ name: 'mock-walker' });
    expect(walker).toBeDefined();
    expect(walker!.props.userData.animationName).toBe('Waving');

    // Verify sphere does not rotate
    const mesh = renderer.scene.findByType('Mesh');
    expect(mesh).toBeDefined();
    
    const initialRotationZ = mesh!.instance.rotation.z;
    
    // Advance frames to trigger useFrame
    await renderer.advanceFrames(2, 1);
    
    expect(mesh!.instance.rotation.z).toBe(initialRotationZ);
  });

  it('renders Walking animation and rotates sphere when isOverview is false', async () => {
    (useEngineStore as any).mockImplementation((selector: any) => {
      return selector({ activeFileId: 'profile' });
    });

    const renderer = await ReactThreeTestRenderer.create(<AboutMeFlex />);
    
    // Verify animationName passed to AboutMeWalker
    const walker = renderer.scene.findByProps({ name: 'mock-walker' });
    expect(walker).toBeDefined();
    expect(walker!.props.userData.animationName).toBe('Walking');

    // Verify sphere rotates
    const mesh = renderer.scene.findByType('Mesh');
    expect(mesh).toBeDefined();
    
    const initialRotationZ = mesh!.instance.rotation.z;
    
    // Advance 1 frame by 1 second (delta = 1)
    await renderer.advanceFrames(1, 1);
    
    expect(mesh!.instance.rotation.z).toBeCloseTo(initialRotationZ - SPHERE_ROTATION_SPEED * 1);
  });
});
