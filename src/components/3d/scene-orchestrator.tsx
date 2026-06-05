'use client';

import { useEffect, useRef, useCallback, createContext, useContext, type ReactNode } from 'react';
import { type Group } from 'three';
import { useEngineStore } from '@/store/useEngineStore';

/**
 * File IDs that have dedicated 3D flex scenes.
 * All other file IDs show the default scene.
 */
const FLEX_SCENE_IDS = new Set(['ibm-modernization', 'indeed-onehost', 'hammerball']);

export type SceneKey = 'ibm-modernization' | 'indeed-onehost' | 'hammerball' | 'default';

function getSceneKey(fileId: string | null): SceneKey {
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
 * on every file click.
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
    } else {
      groupRefs.current.delete(key);
    }
  }, []);

  // Subscribe imperatively to activeFileId changes
  useEffect(() => {
    const unsubscribe = useEngineStore.subscribe(
      (state) => state.activeFileId,
      (newId) => {
        const activeKey = getSceneKey(newId);

        groupRefs.current.forEach((group, key) => {
          group.visible = key === activeKey;
        });

        // Mark asset loading complete after scene swap
        useEngineStore.getState().setAssetLoading(false);
      },
      { fireImmediately: true }
    );
    return unsubscribe;
  }, []);

  return (
    <SceneOrchestratorContext.Provider value={registerScene}>
      {children}
    </SceneOrchestratorContext.Provider>
  );
}

/**
 * Hook for flex scenes to register their group ref with the orchestrator.
 * Usage: const ref = useSceneGroup('ibm-modernization');
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
