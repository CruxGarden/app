// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { CodexConnection } from '../../electron/src/codex-connection';

describe('Codex stdio protocol', () => {
  it('matches out-of-order replies and handles a server request without blocking notifications', async () => {
    const program = `
      const r = require('node:readline').createInterface({ input: process.stdin });
      const send = m => process.stdout.write(JSON.stringify(m)+'\\n');
      let first;
      r.on('line', line => { const m=JSON.parse(line);
        if(m.method==='first') first=m.id;
        if(m.method==='second') { send({id:m.id,result:'second'}); send({id:first,result:'first'}); send({id:'s',method:'approval',params:{}}); }
        if(m.id==='s' && m.result) send({method:'answered',params:m.result});
      });`;
    const client = new CodexConnection(process.execPath, tmpdir(), process.env, ['-e', program]);
    client.onRequest = async () => ({ decision: 'decline' });
    let answer!: (value: unknown) => void;
    const answered = new Promise((resolve) => {
      answer = resolve;
    });
    client.onNotification = (method, params) => {
      if (method === 'answered') answer(params);
    };
    try {
      const a = client.request('first', {}, 3000),
        b = client.request('second', {}, 3000);
      await expect(b).resolves.toBe('second');
      await expect(a).resolves.toBe('first');
      await expect(answered).resolves.toEqual({ decision: 'decline' });
    } finally {
      await client.close();
    }
  });
  it('rejects pending requests on a native process exit', async () => {
    const client = new CodexConnection(process.execPath, tmpdir(), process.env, [
      '-e',
      'setTimeout(() => process.exit(1), 25)',
    ]);
    try {
      await expect(client.request('initialize', {}, 3000)).rejects.toThrow('disconnected');
    } finally {
      await client.close();
    }
  });
  it('rejects malformed protocol output instead of leaving an invisible busy turn', async () => {
    const client = new CodexConnection(process.execPath, tmpdir(), process.env, [
      '-e',
      'setTimeout(() => process.stdout.write("not-json\\n"), 25); setInterval(() => {}, 1000)',
    ]);
    try {
      await expect(client.request('initialize', {}, 3000)).rejects.toThrow('invalid protocol');
    } finally {
      await client.close();
    }
  });
});
