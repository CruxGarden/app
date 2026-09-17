#!/usr/bin/env node
// Scripted protocol fixture. No model requests or external MCP connections.
if (process.argv.includes('--version')) {
  console.log('codex-cli fixture');
  process.exit(0);
}
const readline = require('node:readline');
let cwd,
  threadId,
  resumed = false,
  serial = 0;
const pending = new Map();
const send = (m) => process.stdout.write(JSON.stringify(m) + '\n');
const notify = (method, params) => send({ method, params });
const ask = (method, params) =>
  new Promise((resolve) => {
    const id = `server-${++serial}`;
    pending.set(id, resolve);
    send({ id, method, params });
  });
async function turn(turnId, text) {
  const scope = { threadId, turnId };
  notify('turn/started', { threadId, turn: { id: turnId, status: 'inProgress' } });
  notify('item/agentMessage/delta', {
    ...scope,
    itemId: `${turnId}-msg`,
    delta: resumed ? 'Resuming Codex. ' : 'Starting Codex. ',
  });
  const tool = async (name, args) => {
    const id = `tool-${++serial}`;
    const item = { type: 'dynamicToolCall', id, tool: name, arguments: args, status: 'inProgress' };
    notify('item/started', { ...scope, item });
    const result = await ask('item/tool/call', {
      ...scope,
      callId: id,
      namespace: null,
      tool: name,
      arguments: args,
    });
    notify('item/completed', { ...scope, item: { ...item, status: 'completed', ...result } });
    return result;
  };
  await tool('garden_search_tools', { query: 'write_file' });
  if (resumed) {
    await tool('garden_search_tools', { query: 'read_file' });
    await tool('garden_call_tool', { name: 'read_file', input: { path: 'codex-note.md' } });
  }
  await tool('garden_call_tool', {
    name: 'write_file',
    input: { path: 'codex-note.md', content: `# Codex fixture\n\n${text}\n` },
  });
  if (/run|stop/i.test(text)) {
    const id = `cmd-${++serial}`;
    const command = 'echo Codex approval fixture';
    notify('item/started', {
      ...scope,
      item: { type: 'commandExecution', id, command, cwd, status: 'inProgress' },
    });
    const decision = await ask('item/commandExecution/requestApproval', {
      ...scope,
      itemId: id,
      command,
      cwd,
      reason: 'Fixture requests explicit approval.',
    });
    notify('item/completed', {
      ...scope,
      item: {
        type: 'commandExecution',
        id,
        command,
        cwd,
        status: decision.decision === 'accept' ? 'completed' : 'declined',
        aggregatedOutput:
          decision.decision === 'accept' ? 'Approved Codex command' : 'Declined Codex command',
      },
    });
  }
  notify('item/agentMessage/delta', {
    ...scope,
    itemId: `${turnId}-msg`,
    delta: 'Saved codex-note.md using Garden tools.',
  });
  notify('thread/tokenUsage/updated', {
    ...scope,
    tokenUsage: {
      total: { inputTokens: 100, outputTokens: 25 },
      last: { inputTokens: 100, outputTokens: 25, cachedInputTokens: 0 },
    },
  });
  notify('turn/completed', { threadId, turn: { id: turnId, status: 'completed' } });
}
readline.createInterface({ input: process.stdin }).on('line', async (line) => {
  const m = JSON.parse(line);
  if (!m.method) {
    pending.get(m.id)?.(m.result ?? {});
    pending.delete(m.id);
    return;
  }
  let result = {};
  if (m.method === 'account/read')
    result = { account: { type: 'chatgpt' }, requiresOpenaiAuth: true };
  if (m.method === 'thread/start' || m.method === 'thread/resume') {
    cwd = m.params.cwd;
    resumed = m.method === 'thread/resume';
    threadId = m.params.threadId ?? 'codex-fixture-session';
    if (resumed && threadId !== 'codex-fixture-session') {
      send({ id: m.id, error: { message: 'Wrong provider session!' } });
      return;
    }
    result = { thread: { id: threadId }, model: 'fixture' };
  }
  if (m.method === 'turn/start') {
    const id = 'turn-fixture';
    result = { turn: { id } };
    setTimeout(() => turn(id, m.params.input[0].text), 10);
  }
  if (m.method === 'turn/interrupt')
    notify('turn/completed', { threadId, turn: { id: m.params.turnId, status: 'interrupted' } });
  if (m.id !== undefined) send({ id: m.id, result });
});
