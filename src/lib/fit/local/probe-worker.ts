/// <reference types="@webgpu/types" />
/**
 * GATE STEP 1 WORKER — a separate, tiny entry on purpose.
 *
 * The probe runs for every /fit visitor at idle, so it must not share an
 * entry with `worker.ts`: that would download and parse WebLLM (~6 MB) for
 * people who never press the button. This file imports only the gate rules
 * and the model's numbers. It answers one `probe` and is then terminated.
 *
 * It runs in a worker (not on the main thread) because the question is
 * "is WebGPU available IN A WORKER": inference never falls back to the main
 * thread, so a browser that only exposes `navigator.gpu` there fails step 1.
 */
import { probeGpu } from './gate';
import { LOCAL_MODEL } from './model';
import type { FromWorker, ToWorker } from './protocol';

const scope = self as unknown as {
  navigator: { gpu?: GPU };
  postMessage(msg: FromWorker): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<ToWorker>) => void): void;
};

scope.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg.type !== 'probe') return;
  void probeGpu(scope.navigator.gpu, LOCAL_MODEL).then(
    (result) => scope.postMessage({ type: 'probe_result', id: msg.id, result }),
    () => scope.postMessage({ type: 'probe_result', id: msg.id, result: { supported: false, reason: 'no-adapter' } }),
  );
});
