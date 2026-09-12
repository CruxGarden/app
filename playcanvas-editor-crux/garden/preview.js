import { config } from '../src/editor/config';
export async function openLaunch({ session, capture }) {
    if (document.querySelector('#garden-launch')) return;
    await session.flush();
    const project = structuredClone(capture());
    const dialog = document.createElement('dialog');
    dialog.id = 'garden-launch';
    dialog.setAttribute('aria-label', 'Launch scene');
    dialog.style.cssText =
        'width:90vw;height:85vh;padding:8px;background:#202428;color:white;border:1px solid #697078;';
    dialog.innerHTML =
        '<button>Close preview</button><iframe title="Running scene" style="display:block;width:100%;height:calc(100% - 30px);border:0" sandbox="allow-scripts allow-same-origin allow-pointer-lock"></iframe>';
    const frame = dialog.querySelector('iframe');
    const onMessage = (event) => {
        if (
            event.source === frame.contentWindow &&
            event.origin === location.origin &&
            event.data?.type === 'garden:launch:ready'
        )
            frame.contentWindow.postMessage({ type: 'garden:launch:project', project }, location.origin);
    };
    window.addEventListener('message', onMessage);
    const close = () => {
        window.removeEventListener('message', onMessage);
        dialog.remove();
    };
    dialog.querySelector('button').onclick = close;
    dialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        close();
    });
    frame.src = new URL('launch.html', config.url.frontend).href;
    document.body.append(dialog);
    dialog.showModal();
}
