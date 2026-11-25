import type { EngineApi, EngineMessage, EngineMethod, EngineRequest, LoadStage } from './api';

/** Error raised by the engine with a user-facing message and an optional technical hint. */
export class EngineError extends Error {
  readonly hint?: string;
  constructor(message: string, hint?: string) {
    super(message);
    this.name = 'EngineError';
    this.hint = hint;
  }
}

export class CancelledError extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'CancelledError';
  }
}

interface Pending {
  resolve(value: unknown): void;
  reject(error: Error): void;
  onProgress?: (stage: LoadStage) => void;
}

/**
 * Promise-based façade over the engine worker.
 * `reset()` terminates the worker, which is both "Cancel" and "wipe everything from memory".
 */
export class EngineClient {
  private worker = this.spawn();
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;

  private spawn(): Worker {
    const worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module', name: 'medview-engine' });
    worker.onmessage = (event: MessageEvent<EngineMessage>) => this.receive(event.data);
    worker.onerror = () => this.failAll(new EngineError('The file engine stopped unexpectedly', 'The file may be too large for this device.'));
    return worker;
  }

  private receive(message: EngineMessage): void {
    const request = this.pending.get(message.id);
    if (!request) return;
    if (message.type === 'progress') {
      request.onProgress?.(message.stage);
      return;
    }
    this.pending.delete(message.id);
    if (message.type === 'result') request.resolve(message.value);
    else request.reject(new EngineError(message.message, message.hint));
  }

  private failAll(error: Error): void {
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear();
  }

  call<M extends EngineMethod>(method: M, ...args: Parameters<EngineApi[M]>): Promise<ReturnType<EngineApi[M]>> {
    return this.send(method, args);
  }

  /** Loads a file; the byte buffer is transferred to the worker, not copied. */
  load(bytes: Uint8Array, onProgress: (stage: LoadStage) => void) {
    return this.send('load', [bytes], onProgress, [bytes.buffer as ArrayBuffer]);
  }

  private send<M extends EngineMethod>(method: M, args: unknown[], onProgress?: (stage: LoadStage) => void, transfer: Transferable[] = []) {
    const id = this.nextId++;
    const request: EngineRequest = { id, method, args };
    return new Promise<ReturnType<EngineApi[M]>>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, onProgress });
      this.worker.postMessage(request, transfer);
    });
  }

  reset(): void {
    this.worker.terminate();
    this.failAll(new CancelledError());
    this.worker = this.spawn();
  }
}

export const engine = new EngineClient();
