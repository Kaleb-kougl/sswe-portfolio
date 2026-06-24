'use client';
'use no memo';

import { useEffect } from 'react';
import { addEffect, addAfterEffect } from '@react-three/fiber';
import StatsImpl from 'stats.js';
import { PALETTE } from './colors';

interface DesignStatsProps {
  className?: string;
  parent?: React.RefObject<HTMLElement>;
  showPanel?: number;
}

/**
 * Drop-in replacement for drei's <Stats> using design token colors.
 * Replicates stats.js Panel logic with PALETTE colors instead of the
 * hardcoded cyan/green/pink defaults.
 */
export function DesignStats({ className, parent, showPanel = 0 }: DesignStatsProps) {
  useEffect(() => {
    const container = document.createElement('div');
    container.style.cssText = `position:absolute;top:0;left:0;cursor:pointer;opacity:0.9;z-index:10000;border:3px solid ${PALETTE.ink};box-shadow:5px 5px 0 ${PALETTE.ink}`;

    const fpsPanel = new StatsImpl.Panel('Framerate', PALETTE.paper, PALETTE.cobalt);
    const msPanel  = new StatsImpl.Panel('MS',        PALETTE.paper, PALETTE.cobalt);
    const memPanel = (typeof window !== 'undefined' && (performance as { memory?: unknown }).memory)
      ? new StatsImpl.Panel('MB',        PALETTE.paper, PALETTE.cobalt)
      : null;

    const panels = [fpsPanel, msPanel, ...(memPanel ? [memPanel] : [])];
    panels.forEach((p) => container.appendChild(p.dom));

    let current = showPanel % panels.length;
    panels.forEach((p, i) => { p.dom.style.display = i === current ? 'block' : 'none'; });

    container.addEventListener('click', (e) => {
      e.preventDefault();
      current = (current + 1) % panels.length;
      panels.forEach((p, i) => { p.dom.style.display = i === current ? 'block' : 'none'; });
    });

    if (className) className.split(' ').filter(Boolean).forEach((c) => container.classList.add(c));

    const node = parent?.current ?? document.body;
    node.appendChild(container);

    // Frame timing — mirrors stats.js begin/end logic
    let beginTime = performance.now();
    let prevTime  = beginTime;
    let frames    = 0;

    const begin = addEffect(() => { beginTime = performance.now(); });
    const end   = addAfterEffect(() => {
      frames++;
      const time = performance.now();
      msPanel.update(time - beginTime, 200);

      if (time > prevTime + 1000) {
        fpsPanel.update((frames * 1000) / (time - prevTime), 100);
        prevTime = time;
        frames   = 0;

        if (memPanel) {
          const mem = (performance as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
          if (mem) memPanel.update(mem.usedJSHeapSize / 1048576, mem.jsHeapSizeLimit / 1048576);
        }
      }
    });

    return () => {
      if (className) className.split(' ').filter(Boolean).forEach((c) => container.classList.remove(c));
      node.removeChild(container);
      begin();
      end();
    };
  }, [parent, className, showPanel]);

  return null;
}
