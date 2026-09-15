'use client';
'use no memo';

import { useEffect, useRef, useCallback, createContext, useContext, type ReactNode } from 'react';
import { type Group } from 'three';
import { useEngineStore } from '@/store/useEngineStore';
import { sceneTransition, SCENE_ORDER } from './morph-transition';

/**
 * File IDs that have dedicated 3D flex scenes.
 * All other file IDs show the default scene.
 */
export const FLEX_SCENE_IDS = new Set(['ibm-staff-swe', 'indeed-sr-swe', 'hammerball', 'combat_system', 'overview', 'profile', 'contact-info']);
export const ABOUT_ME_IDS = new Set(['overview', 'profile', 'contact-info']);

export type SceneKey = 'ibm-staff-swe' | 'indeed-sr-swe' | 'hammerball' | 'combat_system' | 'about-me' | 'default';

export function getSceneKey(fileId: string | null): SceneKey {
  if (fileId && ABOUT_ME_IDS.has(fileId)) return 'about-me';
  if (fileId === 'r3f-projectiles') return 'combat_system';
  if (fileId === 'webpack-federation') return 'indeed-sr-swe';
  if (fileId && FLEX_SCENE_IDS.has(fileId)) return fileId as SceneKey;
  return 'default';
}

// --- Context for scene registration ---
type RegisterSceneFn = (key: SceneKey, group: Group | null) => void;
const SceneOrchestratorContext = createContext<RegisterSceneFn>(() => {});

/**
 * SceneOrchestrator — manages which flex scene is visible.
 *
 * All flex scenes are mounted once; this component toggles `visible` on their
 * <group> wrappers. This avoids GPU recompilation of geometries and materials
 * on every file click. When the MorphTransition pass is mounted, the toggle is
 * handed to it so it can snapshot the outgoing frame first and morph between
 * the two scenes.
 *
 * Subscribes to activeFileId imperatively via useEngineStore.subscribe() with
 * { fireImmediately: true } — never uses reactive hooks for this.
 *
 * Wraps children in a context provider so flex scenes can register their groups.
 */
export function SceneOrchestrator({ children }: { children: ReactNode }) {
  const groupRefs = useRef<Map<SceneKey, Group>>(new Map());

  const registerScene = useCallback((key: SceneKey, group: Group | null) => {
    if (group) {
      groupRefs.current.set(key, group);
      
      // Immediately set visibility to avoid all scenes showing at once
      // if they mount after the initial subscriber execution. Uses the scene
      // that is on screen, which lags activeFileId during a morph.
      const renderedId = useEngineStore.getState().renderedFileId;
      group.visible = key === getSceneKey(renderedId);
    } else {
      groupRefs.current.delete(key);
    }
  }, []);

  // Subscribe imperatively to activeFileId changes
  useEffect(() => {
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;

    const unsubscribe = useEngineStore.subscribe(
      (state) => state.activeFileId,
      (newId, prevId) => {
        const nextKey = getSceneKey(newId);
        const store = useEngineStore.getState();
        const renderedKey = getSceneKey(store.renderedFileId);

        const swap = () => {
          groupRefs.current.forEach((group, key) => {
            group.visible = key === nextKey;
          });
          useEngineStore.getState().setRenderedFileId(newId);
        };

        const pass = sceneTransition.current;
        const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const isInitial = newId === prevId;

        if (!pass || prefersReduced || isInitial || nextKey === renderedKey) {
          // No morph: first paint, reduced motion, no composer, or the same
          // scene (e.g. overview -> profile). Drop any swap still waiting.
          pass?.cancelPending();
          swap();
        } else {
          const direction = SCENE_ORDER.indexOf(nextKey) >= SCENE_ORDER.indexOf(renderedKey) ? 1 : -1;
          pass.requestTransition(swap, direction);
          // Safety net: if no frame renders soon (context lost, paused loop), swap anyway.
          clearTimeout(fallbackTimer);
          fallbackTimer = setTimeout(() => pass.flushPending(swap), 1500);
        }

        // Mark asset loading complete after scene swap
        store.setAssetLoading(false);
      },
      { fireImmediately: true }
    );
    return () => {
      clearTimeout(fallbackTimer);
      unsubscribe();
    };
  }, []);

  return (
    <SceneOrchestratorContext.Provider value={registerScene}>
      {children}
    </SceneOrchestratorContext.Provider>
  );
}

/**
 * Hook for flex scenes to register their group ref with the orchestrator.
 * Usage: const ref = useSceneGroup('ibm-staff-swe');
 */
export function useSceneGroup(key: SceneKey) {
  const register = useContext(SceneOrchestratorContext);

  const refCallback = useCallback(
    (group: Group | null) => {
      register(key, group);
    },
    [key, register]
  );

  return refCallback;
}
