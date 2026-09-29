// Scripted SDK messages for isolated desktop journeys. This file is never packaged.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

exports.scriptedQuery = async function* (opts, signal, askPermission) {
  const sessionId = opts.sessionId || randomUUID();
  const resumed = !!opts.sessionId;
  const say = (text) => ({
    type: 'stream_event',
    parent_tool_use_id: null,
    session_id: sessionId,
    event: { type: 'content_block_delta', delta: { type: 'text_delta', text } },
  });
  yield {
    type: 'system',
    subtype: 'init',
    session_id: sessionId,
    model: 'claude-mock',
    claude_code_version: 'mock',
    cwd: opts.cwd,
    tools: ['Read', 'Write', 'Bash'],
  };
  yield { type: 'stream_event', parent_tool_use_id: null, event: { type: 'message_start' } };
  yield say(resumed ? 'Resuming our session. ' : 'Starting fresh. ');
  yield say('Planting a note in the folder.');
  const file = path.join(opts.cwd, 'agent-note.md');
  const content = `# Agent note\n\n${opts.prompt}\n`;
  yield {
    type: 'assistant',
    parent_tool_use_id: null,
    message: {
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: 'tool-write-1',
          name: 'Write',
          input: { file_path: file, content },
        },
      ],
    },
  };
  fs.writeFileSync(file, content);
  yield {
    type: 'user',
    parent_tool_use_id: null,
    message: {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'tool-write-1',
          content: `File created successfully at: ${file}`,
        },
      ],
    },
  };
  if (/\brun\b/i.test(opts.prompt)) {
    const input = { command: 'echo hello from claude code' };
    yield {
      type: 'assistant',
      parent_tool_use_id: null,
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'tool-bash-1', name: 'Bash', input }],
      },
    };
    const allow = await askPermission('Bash', input);
    if (signal.aborted) return;
    yield {
      type: 'user',
      parent_tool_use_id: null,
      message: {
        role: 'user',
        content: [
          allow
            ? {
                type: 'tool_result',
                tool_use_id: 'tool-bash-1',
                content: 'hello from claude code',
              }
            : {
                type: 'tool_result',
                tool_use_id: 'tool-bash-1',
                is_error: true,
                content: 'The person declined this in Crux Garden.',
              },
        ],
      },
    };
    yield { type: 'stream_event', parent_tool_use_id: null, event: { type: 'message_start' } };
    yield say(allow ? ' The command ran.' : ' Skipped the command, as you asked.');
  }
  yield { type: 'stream_event', parent_tool_use_id: null, event: { type: 'message_start' } };
  yield say(' Done — the note is in agent-note.md.');
  yield {
    type: 'result',
    subtype: 'success',
    is_error: false,
    duration_ms: 1234,
    num_turns: 2,
    total_cost_usd: 0.0042,
    usage: { input_tokens: 1200, output_tokens: 80, cache_read_input_tokens: 900 },
    session_id: sessionId,
    result: 'Done',
  };
};
