import { Button, Container } from '@playcanvas/pcui';

import { TooltipHandle } from '@/common/tooltips';

// Keep the native viewport controls; Garden's local provider owns scene execution.
editor.once('load', () => {
    const root = editor.call('layout.root');
    const viewport = editor.call('layout.viewport');
    const panel = new Container({ class: ['control-strip', 'top-right'] });
    viewport.append(panel);
    editor.method('layout.toolbar.launch', () => panel);

    const buttonExpand = new Button({ class: ['control-strip-btn', 'expand'], icon: 'E127' });
    panel.append(buttonExpand);
    buttonExpand.on('click', () => editor.call('viewport:expand'));
    const tooltipExpand = TooltipHandle.attach({
        target: buttonExpand.dom,
        text: 'Hide Panels',
        align: 'top',
        root
    });
    editor.on('viewport:expand', (expanded: boolean) => {
        tooltipExpand.text = expanded ? 'Show Panels' : 'Hide Panels';
        buttonExpand.class.toggle('active', expanded);
        tooltipExpand.hidden = true;
    });

    const launch = new Container({ class: 'launch', enabled: false });
    panel.append(launch);
    editor.on('scene:load', () => {
        launch.enabled = true;
    });
    editor.on('scene:unload', () => {
        launch.enabled = false;
    });
    const buttonLaunch = new Button({ class: 'control-strip-btn', icon: 'E131', text: 'Launch' });
    buttonLaunch.dom.setAttribute('aria-label', 'Launch scene');
    launch.append(buttonLaunch);
    const launchScene = () => editor.call('garden:launch');
    buttonLaunch.on('click', launchScene);
    TooltipHandle.attach({ target: buttonLaunch.dom, text: 'Run the saved local scene', align: 'right', root });
    editor.method('launch', launchScene);
    editor.call('hotkey:register', 'launch', {
        key: 'Enter',
        ctrl: true,
        callback: () => {
            if (!editor.call('picker:isOpen') && !document.querySelector('dialog[open]')) launchScene();
        }
    });

    // Preserve the upstream compact toolbar behavior in a narrow Workshop pane.
    const topStrips = ':is(.control-strip.top-left, .control-strip.top-right)';
    const selector = [
        `${topStrips} > .pcui-button`,
        `${topStrips} > .render > .pcui-button`,
        `${topStrips} > .camera > .pcui-button`,
        `${topStrips} > .launch > .pcui-button`
    ].join(', ');
    const updateCompact = () => {
        const buttons = document.querySelectorAll(selector);
        for (const button of buttons) {
            const text = button.getAttribute('data-full-text');
            if (text !== null) {
                button.textContent = text;
                button.removeAttribute('data-full-text');
            }
        }
        const left = document.querySelector('.control-strip.top-left');
        if (left && left.getBoundingClientRect().right + 20 > panel.dom.getBoundingClientRect().left) {
            for (const button of buttons) {
                if (button.textContent) {
                    button.setAttribute('data-full-text', button.textContent);
                    button.textContent = '';
                }
            }
        }
    };
    editor.on('viewport:resize', updateCompact);
    editor.on('scene:name', updateCompact);
});
