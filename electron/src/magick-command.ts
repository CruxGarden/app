import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { mediaPath, nativeArguments } from './media-paths';
import { runNativeProcess } from './native-process';

const coders: Record<string, string> = {
  png: 'PNG',
  jpg: 'JPEG',
  jpeg: 'JPEG',
  gif: 'GIF',
  webp: 'WEBP',
  tif: 'TIFF',
  tiff: 'TIFF',
  bmp: 'BMP',
  ico: 'ICO',
  avif: 'AVIF',
  heic: 'HEIC',
  ppm: 'PPM',
  pgm: 'PGM',
  pbm: 'PBM',
  pnm: 'PNM',
};
const probeFormat =
  '{"format":"%m","width":%w,"height":%h,"depth":%z,"colorspace":"%[colorspace]","bytes":%B}';
const geometry = /^\d{1,4}x\d{0,4}[>^!]?$/;
const options: Record<string, (value: string) => boolean> = {
  '-resize': (v) => geometry.test(v),
  '-extent': (v) => /^\d{1,4}x\d{1,4}$/.test(v),
  '-quality': (v) => /^\d{1,3}$/.test(v) && Number(v) <= 100,
  '-background': (v) => /^(?:white|black|transparent|none|#[a-f0-9]{6}(?:[a-f0-9]{2})?)$/i.test(v),
  '-alpha': (v) => ['remove', 'off', 'on'].includes(v),
  '-colorspace': (v) => ['Gray', 'sRGB', 'RGB'].includes(v),
  '-gravity': (v) => ['center', 'north', 'south', 'east', 'west'].includes(v),
  '-define': (v) => v === 'icon:auto-resize=16,32,48,64',
  '-rotate': (v) => /^-?\d{1,3}$/.test(v) && Math.abs(Number(v)) <= 360,
};

export function planMagickRun(folder: string, input: unknown) {
  const raw = [...nativeArguments(input)];
  const identify = raw[0] === 'identify';
  if (identify || raw[0] === 'convert') raw.shift();
  const args: string[] = [];
  const files: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const arg = raw[i]!;
    if (!arg.startsWith('-')) {
      files.push(arg);
      continue;
    }
    if (identify && arg === '-verbose') {
      args.push(arg);
      continue;
    }
    const value = raw[++i];
    const allowed = identify
      ? arg === '-format' && value === probeFormat
      : !!value && options[arg]?.(value);
    if (!allowed) throw new Error(`Unsupported ImageMagick option or value: ${arg}`);
    args.push(arg, value!);
  }
  if (files.length !== (identify ? 1 : 2))
    throw new Error('Choose one raster input and one output, or identify one raster image.');
  const file = (value: string, mode: 'input' | 'output') => {
    if (/[%*?]/.test(value))
      throw new Error('Choose one raster filename without expansion syntax.');
    const absolute = mediaPath(folder, value, mode);
    const extension = path.extname(absolute).slice(1).toLowerCase();
    const coder = coders[extension];
    if (!coder)
      throw new Error(
        'Choose a supported raster format (PNG, JPEG, GIF, WebP, TIFF, BMP, ICO, AVIF, HEIC or PNM).',
      );
    return { relative: value, absolute, extension, coder };
  };
  return {
    identify,
    args,
    input: file(files[0]!, 'input'),
    output: identify ? null : file(files[1]!, 'output'),
  };
}

/** Raster decoders only. Never load user/project configuration or delegates. */
export async function runMagick(
  binary: string,
  folder: string,
  input: unknown,
  timeoutMs?: number,
) {
  const plan = planMagickRun(folder, input);
  const scratch = await fs.mkdtemp(path.join(tmpdir(), 'crux-raster-'));
  try {
    const local = path.join(scratch, `input.${plan.input.extension}`);
    const info = await fs.stat(plan.input.absolute);
    if (info.size > 256 * 1024 * 1024) throw new Error('Choose an image smaller than 256 MiB.');
    await fs.copyFile(plan.input.absolute, local);
    const config = path.join(scratch, '.config', 'ImageMagick');
    await fs.mkdir(config, { recursive: true });
    await fs.writeFile(
      path.join(config, 'policy.xml'),
      `<policymap>
      <policy domain="delegate" rights="none" pattern="*"/>
      <policy domain="filter" rights="none" pattern="*"/>
      <policy domain="path" rights="none" pattern="@*"/>
      <policy domain="coder" rights="none" pattern="*"/>
      <policy domain="coder" rights="read|write" pattern="{PNG,JPEG,GIF,WEBP,TIFF,BMP,ICO,AVIF,HEIC,PPM,PGM,PBM,PNM}"/>
      <policy domain="resource" name="memory" value="256MiB"/>
      <policy domain="resource" name="map" value="512MiB"/>
      <policy domain="resource" name="disk" value="1GiB"/>
      <policy domain="resource" name="width" value="16KP"/>
      <policy domain="resource" name="height" value="16KP"/>
      <policy domain="resource" name="list-length" value="256"/>
      <policy domain="resource" name="time" value="600"/>
    </policymap>`,
    );
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('MAGICK_')),
    );
    Object.assign(env, {
      HOME: scratch,
      USERPROFILE: scratch,
      APPDATA: scratch,
      XDG_CONFIG_HOME: path.join(scratch, '.config'),
      XDG_CACHE_HOME: scratch,
      MAGICK_CONFIGURE_PATH: config,
      MAGICK_TEMPORARY_PATH: scratch,
    });
    // Forced coders defeat content sniffing (e.g. SVG bytes named image.png).
    // Conversions use the first raster frame; favicon's multiple sizes are
    // generated by the one supported define, never by caller-controlled paths.
    // probeMedia expects one JSON object, including for animated GIFs. Verbose
    // inspection can still describe every frame; conversions use the first.
    const firstFrame = !plan.identify || plan.args.includes('-format');
    const source = `${plan.input.coder}:${local}${firstFrame ? '[0]' : ''}`;
    const output = plan.output ? path.join(scratch, `result.${plan.output.extension}`) : null;
    const args = plan.identify
      ? ['identify', ...plan.args, source]
      : [source, ...plan.args, `${plan.output!.coder}:${output}`];
    const result = await runNativeProcess(binary, args, { cwd: scratch, env, timeoutMs });
    if (result.code === 0 && output && plan.output) {
      const target = mediaPath(folder, plan.output.relative, 'output');
      await fs.mkdir(path.dirname(target), { recursive: true });
      const temporary = path.join(path.dirname(target), `.crux-write-${randomUUID()}`);
      try {
        await fs.copyFile(output, temporary, constants.COPYFILE_EXCL);
        mediaPath(folder, plan.output.relative, 'output');
        await fs.rename(temporary, target);
      } finally {
        await fs.rm(temporary, { force: true });
      }
    }
    return result;
  } finally {
    await fs.rm(scratch, { recursive: true, force: true });
  }
}
