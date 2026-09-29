import { test, expect } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { createCrux, enterGarden, storedCrux } from './multi-crux-helpers';

// All outside files are disposable canaries beside an isolated test Garden.
// No real profile files, network endpoints or capture devices are involved.
test('FFmpeg refuses files hidden in filter arguments and symlinked inputs', async () => {
  const { app, page, dir } = await launchApp();
  try {
    await enterGarden(page);
    const cruxId = await createCrux(page, 'Media boundary');
    const folder = (await storedCrux(page, cruxId)).projectFolder as string;
    const outside = join(dir, 'outside.ppm');
    const picture = 'P3\n2 2\n255\n255 0 0  255 0 0  255 0 0  255 0 0\n';
    writeFileSync(outside, picture);
    writeFileSync(join(folder, 'inside.ppm'), picture);
    symlinkSync(outside, join(folder, 'linked.ppm'));
    mkdirSync(join(folder, 'frames'));
    symlinkSync(outside, join(folder, 'frames/f0001.ppm'));
    writeFileSync(join(folder, 'disguised.mp4'), "ffconcat version 1.0\nfile 'linked.ppm'\n");
    mkdirSync(join(folder, 'output-frames'));
    symlinkSync(outside, join(folder, 'output-frames/f0001.png'));
    const attempts = [
      ['-y', '-f', 'lavfi', '-i', `movie=${outside}`, '-frames:v', '1', 'filter.png'],
      ['-y', '-i', 'linked.ppm', '-frames:v', '1', 'linked.png'],
      ['-y', '-i', 'disguised.mp4', '-frames:v', '1', 'disguised.png'],
      ['-y', '-pattern_type', 'glob', '-i', 'frames/*.ppm', 'glob.mp4'],
      ['-y', '-i', 'inside.ppm', '-vf', `scale=/w=${outside}:h=2`, 'option.png'],
      ['-y', '-i', 'inside.ppm', 'output-frames/f%04d.png'],
      ['-y', '-framerate', '1', '-i', 'frames/f%04d.ppm', '-frames:v', '1', 'sequence.png'],
    ];
    for (const args of attempts) {
      const result = await page.evaluate(
        async ({ cruxId, args }) => {
          try {
            return await window.electronAPI!.native.run({ cruxId, tool: 'ffmpeg', args });
          } catch (error) {
            return { refused: (error as Error).message };
          }
        },
        { cruxId, args },
      );
      expect.soft(result, args.join(' ')).not.toMatchObject({ code: 0 });
      expect.soft(existsSync(join(folder, args.at(-1)!))).toBe(false);
    }
    const converted = await page.evaluate(
      ({ cruxId }) =>
        window.electronAPI!.native.run({
          cruxId,
          tool: 'ffmpeg',
          args: ['-y', '-i', 'inside.ppm', '-frames:v', '1', 'inside.png'],
        }),
      { cruxId },
    );
    expect(converted.code).toBe(0);
    expect(existsSync(join(folder, 'inside.png'))).toBe(true);
    expect(readFileSync(outside, 'utf8')).toBe(picture);
    const probe = await page.evaluate(async (cruxId) => {
      const args = ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams'];
      return {
        local: await window.electronAPI!.native.run({
          cruxId,
          tool: 'ffprobe',
          args: [...args, 'inside.png'],
        }),
        disguised: await window.electronAPI!.native.run({
          cruxId,
          tool: 'ffprobe',
          args: [...args, 'disguised.mp4'],
        }),
      };
    }, cruxId);
    expect(probe.local.code).toBe(0);
    expect(JSON.parse(probe.local.stdout).streams[0].width).toBe(2);
    expect(probe.disguised.code).not.toBe(0);
  } finally {
    await app.close();
  }
});

test('ImageMagick refuses an outside indirect file list and still converts a local image', async () => {
  const { app, page, dir } = await launchApp();
  try {
    const tools = await page.evaluate(() => window.electronAPI!.native.tools());
    test.skip(
      !tools.some((tool) => tool.tool === 'magick' && tool.path),
      'ImageMagick is unavailable',
    );
    await enterGarden(page);
    const cruxId = await createCrux(page, 'Picture boundary');
    const folder = (await storedCrux(page, cruxId)).projectFolder as string;
    const outside = join(dir, 'outside.ppm');
    const picture = 'P3\n2 2\n255\n0 255 0  0 255 0  0 255 0  0 255 0\n';
    writeFileSync(outside, picture);
    writeFileSync(join(folder, 'inside.ppm'), picture);
    const list = join(dir, 'outside-list.txt');
    writeFileSync(list, outside + '\n');
    const result = await page.evaluate(
      async ({ cruxId, list }) => {
        try {
          return await window.electronAPI!.native.run({
            cruxId,
            tool: 'magick',
            args: [`@${list}`, 'outside.png'],
          });
        } catch (error) {
          return { refused: (error as Error).message };
        }
      },
      { cruxId, list },
    );
    expect.soft(result).not.toMatchObject({ code: 0 });
    expect.soft(existsSync(join(folder, 'outside.png'))).toBe(false);
    writeFileSync(
      join(folder, 'disguised.png'),
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>',
    );
    const disguised = await page.evaluate(
      (cruxId) =>
        window.electronAPI!.native.run({
          cruxId,
          tool: 'magick',
          args: ['disguised.png', 'decoded.png'],
        }),
      cruxId,
    );
    expect(disguised.code).not.toBe(0);
    expect(existsSync(join(folder, 'decoded.png'))).toBe(false);
    // A Project Folder cannot change the host's configuration search path.
    writeFileSync(
      join(folder, 'policy.xml'),
      '<policymap><policy domain="coder" rights="none" pattern="*"/></policymap>',
    );

    const converted = await page.evaluate(
      ({ cruxId }) =>
        window.electronAPI!.native.run({
          cruxId,
          tool: 'magick',
          args: ['inside.ppm', '-resize', '4x4', 'inside.png'],
        }),
      { cruxId },
    );
    expect(converted.code).toBe(0);
    expect(existsSync(join(folder, 'inside.png'))).toBe(true);
  } finally {
    await app.close();
  }
});

test('admitted native recipes produce real video, frames, audio, GIFs and raster outputs', async () => {
  test.setTimeout(120_000);
  const { app, page } = await launchApp();
  try {
    await enterGarden(page);
    const cruxId = await createCrux(page, 'Media recipes');
    const folder = (await storedCrux(page, cruxId)).projectFolder as string;
    mkdirSync(join(folder, '.crux/render/clip'), { recursive: true });
    const picture = 'P3\n2 2\n255\n255 0 0  0 255 0  0 0 255  255 255 255\n';
    for (let i = 0; i < 30; i++)
      writeFileSync(
        join(folder, '.crux/render/clip', `f${String(i).padStart(4, '0')}.ppm`),
        picture,
      );
    // A tiny PCM fixture keeps this independent of unrestricted CLI generators.
    const wav = Buffer.alloc(44 + 8000 * 2);
    wav.write('RIFF');
    wav.writeUInt32LE(wav.length - 8, 4);
    wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(8000, 24);
    wav.writeUInt32LE(16000, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write('data', 36);
    wav.writeUInt32LE(wav.length - 44, 40);
    for (let i = 0; i < 8000; i++)
      wav.writeInt16LE(Math.round(Math.sin((i * Math.PI * 2 * 440) / 8000) * 4000), 44 + i * 2);
    writeFileSync(join(folder, 'tone.wav'), wav);
    const runs = [
      ['-y', '-i', 'tone.wav', '-ac', '1', '-c:a', 'aac', 'mono.m4a'],
      ['-y', '-i', '.crux/render/clip/f0000.ppm', '-quality', '82', 'fallback.webp'],
      [
        '-y',
        '-i',
        '.crux/render/clip/f0000.ppm',
        '-vf',
        'scale=512:512:force_original_aspect_ratio=increase,crop=512:512',
        '-q:v',
        '3',
        'fallback-thumb.jpg',
      ],
      [
        '-y',
        '-i',
        '.crux/render/clip/f0000.ppm',
        '-vf',
        'format=gray',
        '-q:v',
        '3',
        'fallback-gray.jpg',
      ],
      [
        '-y',
        '-framerate',
        '30',
        '-i',
        '.crux/render/clip/f%04d.ppm',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-crf',
        '20',
        '-movflags',
        '+faststart',
        'exports/clip.mp4',
      ],
      [
        '-y',
        '-framerate',
        '30',
        '-pattern_type',
        'glob',
        '-i',
        '.crux/render/clip/*.ppm',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        'exports/glob.mp4',
      ],
      [
        '-y',
        '-i',
        'exports/clip.mp4',
        '-vf',
        'fps=12,scale=640:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse',
        'clip.gif',
      ],
      ['-y', '-i', 'exports/clip.mp4', '-vf', 'fps=1', 'frames/f%04d.png'],
      [
        '-y',
        '-i',
        'exports/clip.mp4',
        '-vf',
        "select='not(mod(n\\,60))',scale=480:-1,tile=3x3",
        '-frames:v',
        '1',
        'sheet.png',
      ],
      [
        '-y',
        '-i',
        'tone.wav',
        '-af',
        'loudnorm=I=-16:TP=-1.5:LRA=11',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        'tone.m4a',
      ],
      [
        '-y',
        '-i',
        'exports/clip.mp4',
        '-i',
        'tone.wav',
        '-map',
        '0:v:0',
        '-map',
        '1:a:0',
        '-c:v',
        'copy',
        '-c:a',
        'aac',
        '-shortest',
        'muxed.mp4',
      ],
    ];
    for (const args of runs) {
      const result = await page.evaluate(
        ({ cruxId, args }) => window.electronAPI!.native.run({ cruxId, tool: 'ffmpeg', args }),
        { cruxId, args },
      );
      expect(result.code, result.stderrTail).toBe(0);
      expect(
        readFileSync(join(folder, args.at(-1)!.replace('%04d', '0001'))).length,
      ).toBeGreaterThan(0);
    }
    const smallGif = await page.evaluate(
      (cruxId) =>
        window.electronAPI!.native.run({
          cruxId,
          tool: 'ffmpeg',
          args: [
            '-y',
            '-i',
            'exports/clip.mp4',
            '-vf',
            'fps=12,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse',
            'small.gif',
          ],
        }),
      cruxId,
    );
    expect(smallGif.code, smallGif.stderrTail).toBe(0);
    const tools = await page.evaluate(() => window.electronAPI!.native.tools());
    if (tools.some((tool) => tool.tool === 'magick' && tool.path)) {
      const probe = await page.evaluate(
        (cruxId) =>
          window.electronAPI!.native.run({
            cruxId,
            tool: 'magick',
            args: [
              'identify',
              '-format',
              '{"format":"%m","width":%w,"height":%h,"depth":%z,"colorspace":"%[colorspace]","bytes":%B}',
              'clip.gif',
            ],
          }),
        cruxId,
      );
      expect(probe.code, probe.stderrTail).toBe(0);
      expect(JSON.parse(probe.stdout)).toMatchObject({ format: 'GIF', width: 640, height: 640 });
      for (const args of [
        ['frames/f0001.png', '-colorspace', 'Gray', '-quality', '88', 'gray.jpg'],
        ['frames/f0001.png', '-resize', '32x>', '-quality', '82', 'small.webp'],
        [
          'frames/f0001.png',
          '-background',
          'white',
          '-alpha',
          'remove',
          '-alpha',
          'off',
          '-quality',
          '85',
          'opaque.jpg',
        ],
        [
          'frames/f0001.png',
          '-resize',
          '32x32^',
          '-gravity',
          'center',
          '-extent',
          '32x32',
          'thumb.png',
        ],
        ['frames/f0001.png', '-define', 'icon:auto-resize=16,32,48,64', 'favicon.ico'],
      ]) {
        const result = await page.evaluate(
          ({ cruxId, args }) => window.electronAPI!.native.run({ cruxId, tool: 'magick', args }),
          { cruxId, args },
        );
        expect(result.code, result.stderrTail).toBe(0);
        expect(readFileSync(join(folder, args.at(-1)!)).length).toBeGreaterThan(0);
      }
    }
  } finally {
    await app.close();
  }
});

test('standalone Typst confines include paths and does not accept a caller-selected root', async () => {
  const { app, page, dir } = await launchApp();
  try {
    const tools = await page.evaluate(() => window.electronAPI!.native.tools());
    test.skip(!tools.some((tool) => tool.tool === 'typst' && tool.path), 'Typst is unavailable');
    await enterGarden(page);
    const cruxId = await createCrux(page, 'Typeset boundary');
    const folder = (await storedCrux(page, cruxId)).projectFolder as string;
    const outside = join(dir, 'outside.txt');
    writeFileSync(outside, 'A disposable outside canary.');
    symlinkSync(outside, join(folder, 'linked.txt'));
    writeFileSync(join(folder, 'absolute.typ'), `#read(${JSON.stringify(outside)})`);
    writeFileSync(join(folder, 'linked.typ'), '#read("linked.txt")');
    writeFileSync(join(folder, 'text.txt'), 'A local document.');
    writeFileSync(join(folder, 'inside.typ'), '#read("text.txt")');
    writeFileSync(join(folder, 'preserved.pdf'), 'Previous PDF bytes.');
    for (const args of [
      ['compile', '--root=/', 'absolute.typ', 'absolute.pdf'],
      ['compile', 'linked.typ', 'linked.pdf'],
      ['compile', '--open=outside', 'inside.typ', 'opened.pdf'],
      ['compile', '--deps=outside', 'inside.typ', 'deps.pdf'],
    ]) {
      const result = await page.evaluate(
        async ({ cruxId, args }) => {
          try {
            return await window.electronAPI!.native.run({ cruxId, tool: 'typst', args });
          } catch (error) {
            return { refused: (error as Error).message };
          }
        },
        { cruxId, args },
      );
      expect.soft(result).not.toMatchObject({ code: 0 });
      expect.soft(existsSync(join(folder, args.at(-1)!))).toBe(false);
    }
    const converted = await page.evaluate(
      ({ cruxId }) =>
        window.electronAPI!.native.run({
          cruxId,
          tool: 'typst',
          args: ['compile', 'inside.typ', 'inside.pdf'],
        }),
      { cruxId },
    );
    expect(converted.code).toBe(0);
    expect(readFileSync(join(folder, 'inside.pdf')).subarray(0, 5).toString()).toBe('%PDF-');
    const failed = await page.evaluate(
      (cruxId) =>
        window.electronAPI!.native.run({
          cruxId,
          tool: 'typst',
          args: ['compile', 'linked.typ', 'preserved.pdf'],
        }),
      cruxId,
    );
    expect(failed.code).not.toBe(0);
    expect(readFileSync(join(folder, 'preserved.pdf'), 'utf8')).toBe('Previous PDF bytes.');
  } finally {
    await app.close();
  }
});
