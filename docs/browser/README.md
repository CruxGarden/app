# WWW browser desktop checkpoint — 2026-09-22

WWW is an ordinary workspace panel with address, back/forward, reload/stop and system-browser controls. The shared `browser` tool exposes the same navigation operations plus address/title state. Last addresses are kept locally per Crux; panel geometry participates in saved layouts.

Remote pages run in a dedicated Chromium session and sandboxed WebContentsView without Node integration or the app preload. Camera/microphone and other permission requests are declined. Downloads offer the system-browser path. Popups navigate the same view. HTTP/HTTPS only; no embedded URL credentials or privileged schemes. Native views hide under modals and overlapping menus and close with their panel. Closing a panel or changing Crux does not preserve a remote form draft or page history; only its last address and separate session cookies/site storage persist. There is no Chrome profile/extension integration or agent page scripting/account automation.

## Evidence

App `npm run verify`: 1,389 tests/235 files, type/lint/tool gates and build pass. Electron `npm run verify` passes. The three supporting-panel, saved-layout and browser desktop journeys pass together (27.1 seconds; browser 10.5 seconds). Browser coverage includes a local site explicitly refusing iframe embedding; absence of app bridge/Node privileges; links/history/reload/popup handling; blocked privileged navigation; UI/outside-MCP parity; native-focused keyboard controls; resizing; menu/modal occlusion; native view disposal; separate addresses in two Cruxes; close/reopen and application restart. This is macOS runtime evidence, not a claim of tested Windows/Linux or arbitrary third-party site compatibility.

Expanded testing reproduced pane-toggle overlap blocking the workspace switcher at 1,100 pixels. The bar now wraps when needed, constrains the Garden label, and hides secondary Tending/Mood-player chips below the wide breakpoint. The actual workspace-switcher click passes at both 1,100 pixels and the minimum 800-pixel window width. The planned breadcrumbs/open-panels discovery design remains separate.

[Actual desktop-window capture](www-browser.png), visually inspected. Electron's app-webContents screenshot omits native child views, so evidence uses desktopCapturer for only the test window when screen capture was already permitted; it does not request permission or capture the whole desktop.

Fresh ad-hoc macOS arm64 packaged acceptance passes all four journeys together (45.1 s): real Synth audio/UI/MCP/Mood/restart (15.3 s), supporting panels (8.5 s), layouts (9.2 s), WWW (11.5 s). This package includes the improved score and all these panels; it is not a notarized release. Raw local logs: `/private/tmp/crux-hardening-20260922/browser-toolbar-verify.log`, `browser-electron-final.log`, and `browser-toolbar-desktop.log`.

Package logs: `browser-package.log` and `browser-packaged-desktop.log` under the same scratch directory.
