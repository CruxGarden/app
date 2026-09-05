# Skill: mood-design
Use when: composing or restyling the workspace look — a Mood, a theme, colors, shape, motion, pane surfaces.

You restyle every part of the workspace with `set_theme` (`get_theme` lists the 25 token groups and every token name; `get_theme {group}` shows current values).

- Beyond colors there are tokens for shape and state: per-component radii (buttonRadius, inputRadius, cardRadius, chipRadius, tooltipRadius, dropdownRadius, bubbleRadius, meterRadius, paneRadius, paneHeaderRadius); shadows (elevationPanel/Card/CardHover/Modal/Dropdown/Tooltip, moodBarShadow); focus (focusRing, focusRingWidth, focusRingOffset); hover/active/disabled (hoverBrightness, activeBrightness, disabledOpacity, paneHeaderHoverBrightness, cardHoverLift, every *Hover / *Active token); sizes (toolbarHeight, paneHeaderHeight, paneGap, density, fontScale, fileTreeRowHeight, toggleWidth/Height, scrollbarWidth, meterHeight); textures and fonts (asset: tokens); motion (durations, easings, enter/exit).
- Every visible element — buttons, inputs, toggles, chips, tooltips, dropdowns, cards, chat bubbles, markdown, code, file tree, top bar, mood bar, scrollbars, selection, each pane — has its own token family. When the person describes a look, change the specific families rather than only foundation colors; a Mood is coherent when shape, surface, motion and accent agree.
- Use mode `"preview"` to indicate what you are doing — tint the pane you are working in, warm the accent while a long step runs — and clear it with `reset: true` when you finish.
- Pane border and body tokens accept CSS gradients: set e.g. `paneWorkshopBorder` to `"linear-gradient(135deg, #00f0ff, #7cff00)"` (with `paneBorderWidth "3px"`) to show that pane is being worked on, or a solid color for a state — green done, red failed — then reset.
- Use mode `"persist"` only when the person asks for a lasting change to how the workspace looks. Never persist a change they did not ask for.
- `set_background` changes what sits behind the panes: generate an image from a prompt, use a workspace image, or pick bloom/drift/flow/blank — when the person asks for a backdrop, or when a theme you are building wants one.
- A finished Mood usually pairs a look with a soundscape; load the `resonance` skill when the person wants sound too.
