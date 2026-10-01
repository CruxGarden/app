import { downloadBlob } from '@/lib/download';

/** Resolves ordinary Mood tokens, including user-supplied CSS variables and alpha. */
function cardStyle() {
  const probe = document.createElement('span');
  probe.style.display = 'none';
  document.body.append(probe);
  try {
    const color = (token: string) => {
      probe.style.color = `var(--${token})`;
      return getComputedStyle(probe).color;
    };
    probe.style.fontFamily = 'var(--font-display)';
    const font = getComputedStyle(probe).fontFamily;
    return {
      bg: color('bg'),
      panel: color('panel'),
      text: color('text'),
      accent: color('accent'),
      font,
    };
  } finally {
    probe.remove();
  }
}

/** Local-only export: no thumbnails, private files or conversation leave this device. */
export async function downloadShareCard(title: string, author: string, url: string) {
  await document.fonts.ready;
  const style = cardStyle();
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image export is unavailable. You can still copy the public link.');
  ctx.fillStyle = style.bg;
  ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = style.panel;
  ctx.fillRect(32, 32, 1136, 566);
  ctx.strokeStyle = style.accent;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(88, 90, 24, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(76, 90);
  ctx.lineTo(100, 90);
  ctx.moveTo(88, 78);
  ctx.lineTo(88, 102);
  ctx.stroke();
  ctx.fillStyle = style.text;
  ctx.font = `28px ${style.font}`;
  ctx.fillText('Crux Garden · grow anything', 130, 100);
  ctx.font = `60px ${style.font}`;
  // Wrap long words too, so a long project name cannot run off the card.
  const lines: string[] = [];
  let line = '';
  for (const char of [...title]) {
    if (ctx.measureText(line + char).width > 1030 || char === '\n') {
      lines.push(line);
      line = '';
    }
    if (char !== '\n') line += char;
  }
  if (line) lines.push(line);
  lines
    .slice(0, 3)
    .forEach((text, i) =>
      ctx.fillText(text + (i === 2 && lines.length > 3 ? '…' : ''), 68, 225 + i * 76, 1060),
    );
  ctx.font = `24px ${style.font}`;
  ctx.fillText(`Made by @${author}`, 68, 487, 1050);
  ctx.fillStyle = style.accent;
  ctx.font = '22px monospace';
  ctx.fillText(url, 68, 552, 1050);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not create the share card.'))),
      'image/png',
    ),
  );
  downloadBlob(blob, 'crux-garden-share.png');
}
