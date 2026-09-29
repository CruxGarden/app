import { Worker } from 'node:worker_threads';
import { resolveObjectURL } from 'node:buffer';

/** Executes the production Blob program on a real separate thread, without browser mocks. */
export class SearchTestWorker {
  onmessage?: (event: { data: unknown }) => void;
  onerror?: () => void;
  private worker: Promise<Worker>;
  constructor(url: string) {
    this.worker = resolveObjectURL(url)!
      .text()
      .then((source) => {
        const worker = new Worker(
          `const {parentPort} = require('node:worker_threads');\nlet onmessage; const postMessage = data => parentPort.postMessage(data);\n${source}\nparentPort.on('message', data => onmessage({data}));`,
          { eval: true },
        );
        worker.on('message', (data) => this.onmessage?.({ data }));
        worker.on('error', () => this.onerror?.());
        return worker;
      });
  }
  postMessage(data: unknown) {
    void this.worker.then((worker) => worker.postMessage(data));
  }
  terminate() {
    void this.worker.then((worker) => worker.terminate());
  }
}
