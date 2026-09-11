// @flow
import { displayBlackLoadingScreenOrThrow } from '../../../Utils/BrowserExternalWindowUtils';
// Keep the native game's preview inside Workshop. GDevelop still generates and
// runs the complete game; this supplies a browsing context instead of a popup.
export const immediatelyOpenNewPreviewWindow = (project: gdProject): WindowProxy => {
  document.getElementById('garden-game-preview')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'garden-game-preview';
  overlay.style.cssText = 'position:fixed;inset:30px 20px 45px;z-index:9998;background:#16171b;display:flex;flex-direction:column;border:1px solid #888';
  const close = document.createElement('button');
  close.textContent = 'Close game preview';
  close.onclick = () => overlay.remove();
  const frame = document.createElement('iframe');
  frame.title = 'Game preview';
  frame.style.cssText = 'flex:1;width:100%;border:0;background:black';
  frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-pointer-lock');
  overlay.append(close, frame);
  document.body.append(overlay);
  const previewWindow = frame.contentWindow;
  if (!previewWindow) throw new Error('Unable to create game preview.');
  displayBlackLoadingScreenOrThrow(previewWindow);
  return previewWindow;
};
