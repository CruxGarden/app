import { expect, test } from '@playwright/test';
import { runNativeProcess } from '../src/native-process';

test('media progress keeps duration when a process writes more than the diagnostic tail at once', async () => {
  const progress: number[] = [];
  const output = 'Duration: 00:00:02.00\n' + 'diagnostic '.repeat(400) + '\ntime=00:00:01.00\n';
  const result = await runNativeProcess(
    process.execPath,
    ['-e', `process.stderr.write(${JSON.stringify(output)})`],
    { cwd: process.cwd(), onProgress: (value) => progress.push(value) },
  );
  expect(result.code).toBe(0);
  expect(result.stderrTail.length).toBeLessThanOrEqual(2000);
  expect(progress).toContain(0.5);
});
