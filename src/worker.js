/**
 * jekyll-js/worker — Core engine wrapped for Web Worker.
 *
 * Same as core, but with a message-based API for use in Web Workers.
 *
 * @example
 * // main.js
 * const worker = new Worker('jekyll-worker.js');
 * worker.postMessage({ type: 'build', vfs });
 * worker.onmessage = (e) => console.log(e.data.results);
 *
 * // jekyll-worker.js
 * import { createWorkerHandler } from 'jekyll-js/worker';
 * createWorkerHandler();
 */

export { JekyllEngine } from './engine.js';
export * from './plugins.js';

/**
 * Create a Web Worker message handler for Jekyll builds.
 * Call this in the worker script.
 */
export function createWorkerHandler() {
  self.onmessage = async (e) => {
    const { type, vfs, config, id } = e.data;

    try {
      if (type === 'build') {
        const { JekyllEngine } = await import('./engine.js');
        const engine = new JekyllEngine({ vfs, ...config });
        const results = await engine.build();
        self.postMessage({ id, type: 'build:done', results });
      } else {
        throw new Error(`Unknown message type: ${type}`);
      }
    } catch (err) {
      self.postMessage({ id, type: 'error', error: err.message });
    }
  };
}
