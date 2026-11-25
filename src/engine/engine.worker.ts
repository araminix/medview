/// <reference lib="webworker" />
import { UnreadableFileError } from '@/parsers';
import type { EngineMessage, EngineRequest } from './api';
import { Engine } from './engine';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const post = (message: EngineMessage) => scope.postMessage(message);

let activeRequest = 0;
const engine = new Engine((stage) => post({ type: 'progress', id: activeRequest, stage }));

scope.onmessage = (event: MessageEvent<EngineRequest>) => {
  const { id, method, args } = event.data;
  activeRequest = id;
  try {
    const handler = engine[method] as (...parameters: unknown[]) => unknown;
    post({ type: 'result', id, value: handler.apply(engine, args) });
  } catch (error) {
    const known = error instanceof UnreadableFileError;
    post({
      type: 'error',
      id,
      message: known ? error.message : 'This file could not be read',
      hint: known ? error.hint : error instanceof Error ? error.message : undefined,
    });
  }
};
