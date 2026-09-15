'use client';
'use no memo';

import { memo, useEffect, useMemo } from 'react';
import { Pass } from 'postprocessing';
import {
  Color,
  HalfFloatType,
  LinearFilter,
  NoBlending,
  SRGBColorSpace,
  ShaderMaterial,
  Uniform,
  UnsignedByteType,
  WebGLRenderTarget,
  type TextureDataType,
  type WebGLRenderer,
} from 'three';
import { PALETTE } from './colors';

/**
 * Tunables for the scene-to-scene morph. Kept as module constants (not props)
 * so <MorphTransition /> renders once and React never diffs Three.js objects.
 */
export const MORPH_SETTINGS = {
  /** Seconds for a full morph. */
  duration: 1.2,
  /** Noise frequency — higher gives smaller, busier blobs. */
  scale: 3.5,
  /** Width of the soft seam between scenes (0–0.5). */
  softness: 0.1,
  /** How far each frame drifts vertically during the morph (0 disables). */
  displacement: 0.1,
  /** 0 = pure noise reveal, 1 = straight vertical wipe. */
  sweep: 0.45,
  /** Colour and strength of the glow along the seam (0 disables). */
  edgeColor: PALETTE.lime,
  edgeStrength: 0.35,
} as const;

/** Order used to pick a morph direction: moving down this list sweeps upward. */
export const SCENE_ORDER = ['about-me', 'indeed-sr-swe', 'ibm-staff-swe', 'hammerball', 'combat_system', 'default'] as const;

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D tFrom;      // frozen snapshot of the outgoing scene
  uniform sampler2D tTo;        // live render of the incoming scene
  uniform vec2 uResolution;
  uniform float uActive;        // 0 = idle pass-through
  uniform float uProgress;      // eased 0 -> 1
  uniform float uScale;
  uniform float uSoftness;
  uniform float uDisplacement;
  uniform float uSweep;
  uniform float uDirection;     // +1 or -1
  uniform float uSeed;
  uniform vec3 uEdgeColor;
  uniform float uEdgeStrength;
  varying vec2 vUv;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbm(vec2 p) {
    float sum = 0.0;
    float amp = 0.5;
    mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
    for (int i = 0; i < 5; i++) {
      sum += amp * valueNoise(p);
      p = rot * p * 2.02 + 17.1;
      amp *= 0.5;
    }
    return sum / 0.96875;
  }

  void main() {
    if (uActive < 0.5) {
      gl_FragColor = texture2D(tFrom, vUv);
    } else {
      vec2 uv = vUv;
      float aspect = uResolution.x / max(uResolution.y, 1.0);

      // Domain-warped fbm -> organic, liquid boundary that drifts as it plays.
      vec2 p = vec2(uv.x * aspect, uv.y) * uScale + uSeed;
      vec2 q = vec2(fbm(p), fbm(p + vec2(5.2, 1.3)));
      float n = smoothstep(0.15, 0.85, fbm(p + 1.6 * q + vec2(0.0, uProgress * 0.8 * uDirection)));

      // Bias the reveal into a vertical sweep that follows the direction of travel.
      float sweep = uDirection > 0.0 ? uv.y : 1.0 - uv.y;
      float field = mix(n, sweep, uSweep);

      // Remap progress so the soft seam fully enters and leaves the frame.
      float t = uProgress * (1.0 + 2.0 * uSoftness) - uSoftness;
      float mask = smoothstep(field - uSoftness, field + uSoftness, t);

      // Both frames drift and zoom slightly, warped by the same noise.
      float warp = 0.6 + 0.8 * n;
      float zoom = uDisplacement * 0.5;
      vec2 fromUv = (uv - 0.5) * (1.0 - zoom * uProgress) + 0.5;
      fromUv.y -= uDirection * uDisplacement * uProgress * warp;
      vec2 toUv = (uv - 0.5) * (1.0 - zoom * (1.0 - uProgress)) + 0.5;
      toUv.y += uDirection * uDisplacement * (1.0 - uProgress) * warp;

      vec4 color = mix(texture2D(tFrom, fromUv), texture2D(tTo, toUv), mask);

      float rim = (1.0 - smoothstep(0.0, uSoftness, abs(t - field))) * uEdgeStrength;
      color.rgb = mix(color.rgb, uEdgeColor, rim);
      color.a = max(color.a, rim);

      gl_FragColor = color;
    }
    #include <colorspace_fragment>
  }
`;

const easeInOutQuint = (t: number) => (t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2);

function createSnapshotTarget() {
  const target = new WebGLRenderTarget(1, 1, {
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    depthBuffer: false,
    type: HalfFloatType,
  });
  target.texture.name = 'MorphTransition.Snapshot';
  return target;
}

/**
 * MorphTransitionPass — final post-processing pass that morphs between scenes.
 *
 * Idle, it is a plain copy to screen. When a transition is requested it:
 *   1. snapshots the frame that is on screen right now (old scene, or the
 *      in-progress morph if the user clicks again mid-transition),
 *   2. runs the caller's `swap` so the next frame renders the new scene,
 *   3. blends snapshot -> live render with a noise mask over `duration`.
 *
 * Because the incoming side is the live render, the new scene keeps animating
 * during the morph. Two snapshot targets alternate so we never sample the
 * target we are writing to. Zero allocations per frame.
 */
export class MorphTransitionPass extends Pass {
  private readonly material: ShaderMaterial;
  private readonly snapshots: [WebGLRenderTarget, WebGLRenderTarget];
  private snapshotIndex = 0;
  private running = false;
  private elapsed = 0;
  private pendingSwap: (() => void) | null = null;
  private pendingDirection = 1;

  constructor() {
    super('MorphTransitionPass');
    this.material = new ShaderMaterial({
      name: 'MorphTransitionMaterial',
      uniforms: {
        tFrom: new Uniform(null),
        tTo: new Uniform(null),
        uResolution: new Uniform({ x: 1, y: 1 }),
        uActive: new Uniform(0),
        uProgress: new Uniform(0),
        uScale: new Uniform(MORPH_SETTINGS.scale),
        uSoftness: new Uniform(MORPH_SETTINGS.softness),
        uDisplacement: new Uniform(MORPH_SETTINGS.displacement),
        uSweep: new Uniform(MORPH_SETTINGS.sweep),
        uDirection: new Uniform(1),
        uSeed: new Uniform(0),
        uEdgeColor: new Uniform(new Color(MORPH_SETTINGS.edgeColor)),
        uEdgeStrength: new Uniform(MORPH_SETTINGS.edgeStrength),
      },
      vertexShader,
      fragmentShader,
      blending: NoBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.fullscreenMaterial = this.material;
    this.snapshots = [createSnapshotTarget(), createSnapshotTarget()];
  }

  get hasPendingSwap() {
    return this.pendingSwap !== null;
  }

  /** Snapshot the current frame on the next render, then call `swap` and morph to the new scene. */
  requestTransition(swap: () => void, direction: 1 | -1) {
    this.pendingSwap = swap;
    this.pendingDirection = direction;
  }

  /** Drop a swap that hasn't been captured yet. */
  cancelPending() {
    this.pendingSwap = null;
  }

  /** Run `swap` immediately (no morph) if it is still waiting — safety net when frames aren't rendering. */
  flushPending(swap?: () => void) {
    if (this.pendingSwap && (!swap || swap === this.pendingSwap)) {
      const pending = this.pendingSwap;
      this.pendingSwap = null;
      pending();
    }
  }

  override render(
    renderer: WebGLRenderer,
    inputBuffer: WebGLRenderTarget,
    outputBuffer: WebGLRenderTarget,
    deltaTime = 0,
  ) {
    const u = this.material.uniforms;
    u.tTo.value = inputBuffer.texture;
    if (!this.running) u.tFrom.value = inputBuffer.texture;

    if (this.pendingSwap) {
      // Capture exactly what the viewer sees this frame.
      const target = this.snapshots[this.snapshotIndex];
      this.snapshotIndex = 1 - this.snapshotIndex;
      renderer.setRenderTarget(target);
      renderer.render(this.scene, this.camera);

      u.tFrom.value = target.texture;
      u.uActive.value = 1;
      u.uProgress.value = 0;
      u.uDirection.value = this.pendingDirection;
      u.uSeed.value = Math.random() * 100;
      this.elapsed = 0;
      this.running = true;

      const swap = this.pendingSwap;
      this.pendingSwap = null;
      swap();
    } else if (this.running) {
      // Clamp so a background-tab pause doesn't skip the whole morph.
      this.elapsed += Math.min(deltaTime, 1 / 20);
      const t = Math.min(1, this.elapsed / MORPH_SETTINGS.duration);
      u.uProgress.value = easeInOutQuint(t);
      if (t >= 1) {
        this.running = false;
        u.uActive.value = 0;
        u.tFrom.value = inputBuffer.texture;
      }
    }

    renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer);
    renderer.render(this.scene, this.camera);
  }

  override setSize(width: number, height: number) {
    this.snapshots[0].setSize(width, height);
    this.snapshots[1].setSize(width, height);
    this.material.uniforms.uResolution.value = { x: width, y: height };
  }

  override initialize(renderer: WebGLRenderer, alpha: boolean, frameBufferType: number) {
    for (const target of this.snapshots) {
      target.texture.type = frameBufferType as TextureDataType;
      if (frameBufferType === UnsignedByteType && renderer.outputColorSpace === SRGBColorSpace) {
        target.texture.colorSpace = SRGBColorSpace;
      }
    }
  }

  override dispose() {
    this.pendingSwap = null;
    this.snapshots[0].dispose();
    this.snapshots[1].dispose();
    super.dispose();
  }
}

/**
 * Imperative handle the SceneOrchestrator uses to route scene swaps through the
 * morph. `null` whenever the pass isn't mounted (tests, WebGL fallback), in
 * which case the orchestrator swaps instantly.
 */
export const sceneTransition: { current: MorphTransitionPass | null } = { current: null };

/**
 * <MorphTransition /> — mount as the LAST child of <EffectComposer>.
 * @react-three/postprocessing adds raw Pass instances in child order, so this
 * runs after Bloom and snapshots the fully post-processed frame.
 */
export const MorphTransition = memo(function MorphTransition() {
  const pass = useMemo(() => new MorphTransitionPass(), []);

  useEffect(() => {
    sceneTransition.current = pass;
    return () => {
      if (sceneTransition.current === pass) sceneTransition.current = null;
      pass.flushPending();
      pass.dispose();
    };
  }, [pass]);

  return <primitive object={pass} dispose={null} />;
});
