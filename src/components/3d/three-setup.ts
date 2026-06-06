/**
 * R3F Tree-Shaking Setup (R3F v8+ requirement)
 *
 * R3F no longer auto-imports the THREE namespace. We call extend() with only
 * the specific Three.js classes used across all scenes. This enables tree-shaking
 * so unused Three.js classes are removed from the bundle.
 *
 * Import this file once at the top of canvas-wrapper.tsx.
 */
import { extend } from '@react-three/fiber';
import {
  Mesh,
  BoxGeometry,
  SphereGeometry,
  PlaneGeometry,
  IcosahedronGeometry,
  MeshStandardMaterial,
  MeshBasicMaterial,
  InstancedMesh,
  AmbientLight,
  DirectionalLight,
  PointLight,
  Group,
  BufferGeometry,
  BufferAttribute,
  Color,
  Fog,
} from 'three';

extend({
  Mesh,
  BoxGeometry,
  SphereGeometry,
  PlaneGeometry,
  IcosahedronGeometry,
  MeshStandardMaterial,
  MeshBasicMaterial,
  InstancedMesh,
  AmbientLight,
  DirectionalLight,
  PointLight,
  Group,
  BufferGeometry,
  BufferAttribute,
  Color,
  Fog,
});

// TypeScript: Register extended elements for JSX type checking (TDD §3).
// R3F v9 auto-generates ThreeElements types from the extend() call above.
// This augmentation explicitly signals that these classes are available as
// lowercase JSX elements inside <Canvas>.
declare module '@react-three/fiber' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface ThreeElements {}
}
