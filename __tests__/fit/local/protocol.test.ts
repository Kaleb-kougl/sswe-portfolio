import { describe, it, expect } from 'vitest';

import type { Requirement } from '@/lib/fit/contract';
import {
  INITIAL_SESSION,
  reduceSession,
  startRequest,
  toLoadProgress,
  type FromWorker,
  type SessionState,
} from '@/lib/fit/local/protocol';

const row = (text: string): Requirement => ({
  text,
  priority: 'must',
  skills: [],
  otherSkills: [],
  minYears: null,
  verdict: 'not_assessed',
  evidenceIds: [],
  note: '',
});

function fold(state: SessionState, msgs: FromWorker[]): SessionState {
  return msgs.reduce(reduceSession, state);
}

describe('reduceSession', () => {
  it('walks bench → load → run → done', () => {
    let s = startRequest(INITIAL_SESSION, { type: 'bench', id: 1 });
    expect(s.phase).toBe('benching');
    s = reduceSession(s, {
      type: 'bench_result',
      id: 1,
      result: { gflops: 500, gbps: 100, elapsedMs: 200, estimatedFirstRowMs: 3000 },
    });
    expect(s.phase).toBe('benched');
    expect(s.bench?.estimatedFirstRowMs).toBe(3000);

    s = startRequest(s, { type: 'load', id: 2 });
    s = fold(s, [
      { type: 'progress', id: 2, progress: { phase: 'download', fraction: 0.5, loadedBytes: 5, totalBytes: 10, text: '' } },
      { type: 'loaded', id: 2, fromCache: false, elapsedMs: 10 },
    ]);
    expect(s.phase).toBe('ready');
    expect(s.loaded).toBe(true);
    expect(s.progress?.loadedBytes).toBe(5);

    s = startRequest(s, { type: 'run', id: 3, jd: 'x' });
    s = fold(s, [
      { type: 'row', id: 3, index: 0, row: row('a') },
      { type: 'row', id: 3, index: 1, row: row('b') },
    ]);
    expect(s.phase).toBe('running');
    expect(s.rows.map((r) => r.text)).toEqual(['a', 'b']);
    s = reduceSession(s, {
      type: 'done',
      id: 3,
      report: { role: 'r', mode: 'model', requirements: [row('a'), row('b')], coverage: { covered: 0, mustHaves: 0 } },
      stats: { firstRowMs: 1, totalMs: 2, tokensPerSecond: null, promptTokens: null, completionTokens: null },
    });
    expect(s.phase).toBe('done');
    expect(s.report?.role).toBe('r');
    expect(s.activeId).toBeNull();
  });

  it('ignores messages from a stale request id', () => {
    let s = startRequest({ ...INITIAL_SESSION, loaded: true }, { type: 'run', id: 5, jd: 'x' });
    s = reduceSession(s, { type: 'row', id: 4, index: 0, row: row('stale') });
    expect(s.rows).toEqual([]);
    s = reduceSession(s, { type: 'error', id: 4, code: 'internal', message: 'old' });
    expect(s.phase).toBe('running');
  });

  it('ignores out-of-order or repeated row indices', () => {
    let s = startRequest(INITIAL_SESSION, { type: 'run', id: 1, jd: 'x' });
    s = fold(s, [
      { type: 'row', id: 1, index: 1, row: row('skipped ahead') },
      { type: 'row', id: 1, index: 0, row: row('a') },
      { type: 'row', id: 1, index: 0, row: row('a again') },
    ]);
    expect(s.rows.map((r) => r.text)).toEqual(['a']);
  });

  it('a new run clears the previous rows and report', () => {
    let s = startRequest({ ...INITIAL_SESSION, loaded: true }, { type: 'run', id: 1, jd: 'x' });
    s = reduceSession(s, { type: 'row', id: 1, index: 0, row: row('a') });
    s = startRequest(s, { type: 'run', id: 2, jd: 'y' });
    expect(s.rows).toEqual([]);
    expect(s.report).toBeNull();
  });

  it('too_slow and cancel end the request; a cancelled run keeps the model loaded', () => {
    const loaded = { ...INITIAL_SESSION, loaded: true };
    const slow = reduceSession(startRequest(loaded, { type: 'run', id: 1, jd: 'x' }), { type: 'too_slow', id: 1, elapsedMs: 15000 });
    expect(slow.phase).toBe('too_slow');
    expect(slow.activeId).toBeNull();

    const cancelledRun = reduceSession(startRequest(loaded, { type: 'run', id: 2, jd: 'x' }), { type: 'cancelled', id: 2 });
    expect(cancelledRun.phase).toBe('ready');

    const cancelledLoad = reduceSession(startRequest(INITIAL_SESSION, { type: 'load', id: 3 }), { type: 'cancelled', id: 3 });
    expect(cancelledLoad.phase).toBe('cancelled');
  });

  it('device loss forgets the loaded model; other errors keep it', () => {
    const loaded = startRequest({ ...INITIAL_SESSION, loaded: true }, { type: 'run', id: 1, jd: 'x' });
    expect(reduceSession(loaded, { type: 'error', id: 1, code: 'device_lost', message: '' }).loaded).toBe(false);
    const kept = reduceSession(loaded, { type: 'error', id: 1, code: 'invalid_output', message: 'bad' });
    expect(kept.loaded).toBe(true);
    expect(kept.error).toEqual({ code: 'invalid_output', message: 'bad' });
  });
});

describe('toLoadProgress', () => {
  const total = 695_242_752;

  it('reads the download phase and turns the fraction into bytes', () => {
    const p = toLoadProgress(
      { progress: 0.25, text: 'Fetching param cache[5/22]: 166MB fetched. 25% completed, 3 secs elapsed.' },
      total,
    );
    expect(p).toMatchObject({ phase: 'download', fraction: 0.25, loadedBytes: Math.round(total / 4), totalBytes: total });
  });

  it('recognises a cache hit and shader compilation', () => {
    expect(toLoadProgress({ progress: 0.5, text: 'Loading model from cache[11/22]: 331MB loaded.' }, total).phase).toBe('cache');
    const compile = toLoadProgress({ progress: 0.1, text: 'Loading GPU shader modules[3/30]: 10% completed' }, total);
    expect(compile.phase).toBe('compile');
    expect(compile.loadedBytes).toBe(total);
  });

  it('clamps nonsense fractions and treats unknown text as init', () => {
    expect(toLoadProgress({ progress: NaN, text: '' }, total)).toMatchObject({ phase: 'init', fraction: 0, loadedBytes: 0 });
    expect(toLoadProgress({ progress: 3, text: 'Fetching param cache' }, total).fraction).toBe(1);
  });
});
