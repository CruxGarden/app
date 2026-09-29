import { desktopCapturer, dialog, Menu, type BrowserWindow, type Streams } from 'electron';

/** A source is never selected automatically; dismissing either choice grants nothing. */
export async function chooseDisplaySource(
  window: BrowserWindow,
  requester: string,
  audioRequested: boolean,
): Promise<Streams | undefined> {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 0, height: 0 },
  });
  if (!sources.length || window.isDestroyed()) return undefined;
  const source = await new Promise<(typeof sources)[number] | undefined>((resolve) => {
    let selected: (typeof sources)[number] | undefined;
    const menu = Menu.buildFromTemplate([
      { label: `${requester}: choose what to share`, enabled: false },
      { type: 'separator' },
      ...sources.map((item) => ({
        label: item.name,
        click: () => {
          selected = item;
        },
      })),
      { type: 'separator' },
      { label: 'Cancel', click: () => resolve(undefined) },
    ]);
    menu.popup({ window, callback: () => resolve(selected) });
  });
  if (!source || window.isDestroyed()) return undefined;
  if (!audioRequested) return { video: source };
  const result = await dialog.showMessageBox(window, {
    type: 'question',
    message: `Share system audio with ${requester}?`,
    detail: 'System audio can include sound from other applications.',
    buttons: ['Cancel', 'Share video only', 'Share video and audio'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  if (result.response === 1) return { video: source };
  if (result.response === 2) return { video: source, audio: 'loopback' };
  return undefined;
}
