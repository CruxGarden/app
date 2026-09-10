// SPDX-License-Identifier: GPL-3.0-or-later
export class CardinalEngine {
  async initialize(canvas) {
    this.audio = new AudioContext();
    await this.audio.suspend();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Cardinal took too long to start.')),
        90000,
      );
      const fail = (message) => {
        clearTimeout(timeout);
        reject(new Error(String(message)));
      };
      const runtime = (window.Module = {
        canvas,
        gardenOwnsPlayback: true,
        WebAudioBridge: { audioContext: this.audio },
        locateFile: (path) => new URL('runtime/' + path, location.href).href,
        onAbort: fail,
        printErr: (message) => console.warn('[Cardinal]', message),
        postRun: () => {
          try {
            this.invoke = runtime.cwrap('garden_call', 'string', ['string']);
            this.runtime = runtime;
            this.call({ op: 'describe' });
            clearTimeout(timeout);
            window.dispatchEvent(new Event('resize'));
            resolve();
          } catch (error) {
            fail(error.message);
          }
        },
      });
      const script = document.createElement('script');
      script.src = 'runtime/CardinalMini.js';
      script.onerror = () => fail('The Cardinal runtime could not load.');
      document.head.append(script);
    });
  }
  call(request) {
    const result = JSON.parse(this.invoke(JSON.stringify(request)));
    if (!result.ok) throw new Error(result.error || 'Cardinal could not complete that operation.');
    return result;
  }
  patch() {
    return this.call({ op: 'describe' }).patch;
  }
  async load(patch) {
    const wasPlaying = this.audio.state === 'running';
    await this.audio.suspend();
    try {
      this.runtime.FS.mkdirTree('/userfiles');
      this.runtime.FS.writeFile('/userfiles/garden-load.vcv', JSON.stringify(patch));
      this.call({ op: 'load' });
    } finally {
      if (wasPlaying) await this.audio.resume();
    }
  }
  start() {
    return this.audio.resume();
  }
  stop() {
    return this.audio?.suspend();
  }
}
