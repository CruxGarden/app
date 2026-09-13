import type { CanvasNode, ComponentDefinition, ComponentKind } from "../types";

export const componentCategories = ["All", "Common", "Text", "Forms", "Containers", "Data", "Charts", "Navigation", "Markup", "Media", "iOS"] as const;

export type ComponentCategory = (typeof componentCategories)[number];

export type LinkableElement = {
  key: string;
  label: string;
};

export type TreePaneRow = {
  key: string;
  depth: number;
  icon: "folder-closed" | "folder-open" | "plus" | "minus" | "checked" | "empty" | "chevron-right" | "chevron-down" | "file" | "none";
  label: string;
};

function component(
  kind: ComponentKind,
  label: string,
  category: Exclude<ComponentCategory, "All"> | Exclude<ComponentCategory, "All">[],
  icon: string,
  width: number,
  height: number,
  defaults: Partial<CanvasNode> = {},
): ComponentDefinition {
  return { kind, label, category, icon, width, height, defaults };
}

export function componentCategoryNames(definition: ComponentDefinition) {
  if (!definition.category) return [];
  return Array.isArray(definition.category) ? definition.category : [definition.category];
}

export const controlCatalogue: ComponentDefinition[] = [
  component("rectangle", "Rectangle", ["Common", "Containers"], "rectangle", 180, 110, { fill: "#ffffff", stroke: "#1f2937" }),
  component("button", "Button", ["Common", "Forms"], "button", 112, 40, { text: "Button", fill: "#ffffff" }),
  component("circleButton", "Circle Button", ["Common", "Forms"], "CirclePlus", 72, 72, { text: "", fill: "#ffffff", fontSize: 30, showBorder: true }),
  component("pointyButton", "Pointy Button", "Forms", "ChevronLeft", 150, 44, { text: "Button", fill: "#ffffff", variant: "left", showBorder: false }),
  component("multilineButton", "Multiline Button", "Forms", "MousePointer2", 170, 54, { text: "Multiline Button\nSecond line of text", fill: "#ffffff" }),
  component("helpButton", "Help Button", "Forms", "CircleHelp", 60, 60, { text: "?", fill: "#ffffff", fontSize: 30 }),
  component("icon", "Icon", ["Common", "Media"], "icon", 64, 64, { icon: "Plus", stroke: "#111827", textColor: "#111827" }),
  component("iconText", "Icon and Text", ["Common", "Media"], "BadgeInfo", 110, 90, { icon: "Square", text: "Icon Name", stroke: "#111827", textColor: "#111827" }),
  component("stickyNote", "Comment", "Markup", "stickyNote", 180, 160, { text: "A comment", fill: "#fff2a8", fontSize: 16 }),
  component("stickyNote", "Sticky Note", "Markup", "stickyNote", 180, 160, { text: "A sticky note", fill: "#fff2a8", fontSize: 16 }),

  component("textLabel", "Label", ["Common", "Text"], "Type", 180, 34, { text: "Some text", fontSize: 14 }),
  component("textTitle", "Title", "Text", "Heading1", 240, 48, { text: "A Big Title", fontSize: 28 }),
  component("textSubtitle", "Text Subtitle", "Text", "Heading2", 220, 42, { text: "A Subtitle", fontSize: 22 }),
  component("textParagraph", "Paragraph", ["Common", "Text"], "Pilcrow", 275, 80, {
    text: "A **paragraph** of {color:red}text{color} with an [unassigned link].\nA *second* <u>row</u> of ~~text~~ with a [web link]\nAn icon :circle-plus-solid: inline with text.",
    fontSize: 14,
  }),
  component("link", "Link", ["Common", "Text"], "Link", 120, 34, { text: "a link", textColor: "#2563eb", fontSize: 14 }),
  component("squigglyParagraph", "Squiggly Paragraph", ["Common", "Text"], "AlignLeft", 250, 86, { text: "A paragraph of text.\nA second row of text." }),

  component("checkbox", "Checkbox", ["Common", "Forms"], "checkbox", 150, 32, { text: "Checkbox", checked: false }),
  component("checkboxList", "Checkbox Group", ["Common", "Forms"], "checkboxList", 230, 168, {
    options: [
      "[ ] not selected",
      "[x] selected",
      "[-] indeterminate",
      "-[ ] disabled-",
      "-[x] disabled selected-",
      "-[-] disabled indeterminate-",
      "A row without a checkbox",
    ],
    text: "Checkbox List",
  }),
  component("radioButton", "Radio Button", ["Common", "Forms"], "CircleDot", 160, 28, { text: "Radio Button", checked: false, fontSize: 14 }),
  component("radioButtonGroup", "Radio Button Group", ["Common", "Forms"], "ListChecks", 210, 126, { options: ["option 1", "option 2", "option 3"], text: "Radio Group" }),
  component("dropdown", "Dropdown", "Forms", "dropdown", 180, 40, { text: "Choose...", options: ["First", "Second", "Third"] }),
  component("comboBox", "ComboBox", ["Common", "Forms"], "ChevronDownSquare", 180, 40, { text: "ComboBox", options: ["First", "Second", "Third"], showScrollbar: true }),
  component("textbox", "Textbox", "Forms", "textbox", 190, 40, { text: "Text input" }),
  component("textInput", "Text Input", ["Common", "Forms"], "TextCursorInput", 190, 40, { text: "", placeholder: "Text input", showBorder: true, opacity: 100 }),
  component("textArea", "Text Area", ["Common", "Forms"], "Text", 230, 120, { text: "", showBorder: true, showScrollbar: true, opacity: 100 }),
  component("searchBox", "Search Box", "Forms", "Search", 190, 36, { text: "", placeholder: "search" }),
  component("searchBoxVoice", "Search Box + Mic", "Forms", "Mic", 210, 36, { text: "", placeholder: "search" }),
  component("colorPicker", "Color Picker", "Forms", "Palette", 76, 76, { fill: "#2563eb" }),
  component("numericStepper", "Numeric Stepper", "Forms", "PanelTopOpen", 96, 58, { value: 3 }),
  component("onOffSwitch", "Switch", "Forms", "ToggleRight", 108, 56, { checked: true, fill: "#6cc24a" }),
  component("progressBar", "Progress Bar", "Forms", "BatteryMedium", 170, 28, { value: 45 }),
  component("progressBarIndeterminate", "Progress (Ind.)", "Forms", "MoreHorizontal", 170, 28, { variant: "indeterminate" }),

  component("tabs", "Tabs", "Navigation", "tabs", 260, 100, {
    options: ["One", "Two", "Three", "Four"],
    activeIndex: -1,
    showBorder: true,
    showScrollbar: false,
    tabPlacement: "top",
    tabAlignment: "left",
  }),
  component("tabBar", "Tab Bar", "Navigation", "PanelTop", 240, 48, {
    options: ["One", "Two", "Three", "Four"],
    activeIndex: 0,
    showBorder: true,
    showScrollbar: false,
    tabPlacement: "top",
    tabAlignment: "center",
  }),
  component("buttonBar", "Button Bar", "Navigation", "buttonBar", 240, 40, { options: ["One", "Two", "Three"], activeIndex: 0 }),
  component("vTabs", "Vertical Tabs", "Navigation", "PanelLeft", 150, 160, { options: ["First Tab", "Second Tab", "Third Tab", "Fourth Tab"], activeIndex: 1 }),
  component("linkBar", "Link Bar", "Navigation", "Link", 250, 38, { options: ["Home", "Products", "Company", "Blog"] }),
  component("breadcrumbs", "Breadcrumbs", "Navigation", "ChevronRight", 240, 34, { options: ["Home", "Products", "Xyz", "Features"] }),
  component("menuBar", "Menu Bar", ["Common", "Navigation"], "Menu", 250, 34, { options: ["File", "Edit", "View", "Help"] }),
  component("menu", "Menu", "Navigation", "PanelTopClose", 150, 167, { options: ["Open,CTRL+O", "Open Recent >", "---", "o Option One", "Option Two", "=", "x Toggle Item", "-Disabled Item-", "Exit,CTRL+Q"] }),
  component("appBar", "App Bar", "Navigation", "PanelTop", 320, 44, {
    text: "Heading",
    options: ["Menu", "ChevronDown", "MoreVertical"],
    fill: "#d9d9d9",
    textColor: "#111827",
    fontSize: 16,
  }),
  component("playback", "Playback", "Navigation", "CirclePlay", 120, 40, { options: ["rew", "play", "ff"] }),
  component("toolbar", "Toolbar", "Navigation", "Rows3", 230, 32, { options: ["B", "I", "U", "link", "align"] }),

  component("accordion", "Accordion", "Containers", "PanelTop", 150, 186, {
    options: ["Item One", "Item Two", "- Sub-Item 2.1", "- Sub-Item 2.2", "Item Three", "Item Four"],
    activeIndex: 0,
    showScrollbar: false,
  }),
  component("alertBox", "Alert Box", "Containers", "MessageSquareWarning", 240, 140, {
    text: "Alert\nAlert text goes here",
    options: ["No", "Yes"],
    showBorder: true,
    textAlign: "center",
  }),
  component("alertBoxAndroid", "Alert Box (Android)", "Containers", "MessageSquareWarning", 260, 145, {
    text: "Alert\nAlert text goes here",
    options: ["No", "Yes"],
    showBorder: true,
    textAlign: "left",
  }),
  component("browser", "Browser Window", ["Common", "Containers"], "PanelTop", 220, 160, { text: "A Web Page\nhttps://", fill: "#ffffff", showBorder: true, showScrollbar: true }),
  component("window", "Window", ["Common", "Containers"], "PanelTop", 220, 160, { text: "Window Name", showScrollbar: true }),
  component("modalScreen", "Modal Screen", "Containers", "PanelTop", 220, 140, { fill: "#777777" }),
  component("fieldSet", "Field Set", "Containers", "SquareDashed", 220, 170, { text: "Group Name", fill: "#ffffff" }),
  component("popover", "Popover", "Containers", "MessageSquare", 160, 105, { text: "", fill: "#ffffff" }),
  component("tooltip", "Tooltip", "Containers", "MessageCircle", 165, 74, { text: "a tooltip", fill: "#ffffff" }),
  component("callout", "Callout", "Containers", "CircleAlert", 86, 86, { text: "1", fill: "#fff300", fontSize: 28 }),

  component("list", "List", "Data", "List", 140, 130, { options: ["Item One", "Item Two", "Item Three"], showBorder: true, fill: "#ffffff", opacity: 100 }),
  component("listIcon", "List with Icons", "Data", "ListChecks", 170, 130, { options: ["Item One", "Item Two", "Item Three"] }),
  component("treePane", "Tree Pane", "Data", "FolderTree", 300, 285, {
    options: [
      "f Use f for closed folders",
      "F Use F for open folders",
      "[+] You may also use this",
      "[-] and this",
      "[x] or this",
      "[ ] and this",
      "> or even this",
      "v and this",
      "- Use - for a file icon",
      "_ or _ to leave a space for your own icon",
      "F use spaces or dots for hierarchy",
      " v just like",
      "..- this",
    ],
  }),
  component("dataGrid", "Data Grid", "Data", "Table", 340, 340, {
    text: [
      "Name\\r(job title) ^, Age ^v, Nickname, Employee v",
      "Giacomo Guilizzoni\\rFounder & CEO, 40, Peldi, (o)",
      "Marco Botton\\rTuttofare, 38, , [x]",
      "Mariah Maclachlan\\rBetter Half, 41, Patata, [-]",
      "Valerie Liberty\\rHead Chef, :), Val, [x]",
      "[Data Grid Docs     ](https://balsamiq.com/wireframes/desktop/docs/datagrids/), , , [ ]",
      "{65L, 0R, 35, 0C}",
    ].join("\n"),
    showBorder: true,
    showScrollbar: true,
  }),
  component("calendar", "Calendar", "Data", "CalendarDays", 130, 130, { text: "MAY 2026" }),
  component("dateChooser", "Date Chooser", "Data", "CalendarPlus", 128, 42, { text: " / / " }),
  component("datePicker", "Date Picker", "Data", "Calendar", 135, 170, { text: "May 2026" }),
  component("timePicker", "Time Picker", "Data", "Clock3", 88, 120, { text: "4:14" }),
  component("siteMap", "Site Map", "Data", "Network", 210, 130, { options: ["Home", "About", "Products", "Contact"] }),
  component("streetMap", "Map", "Data", "Map", 160, 120, { fill: "#eef2e8" }),
  component("tagCloud", "Tag Cloud", "Data", "Tags", 250, 105, { text: "wireframe mockup UI design notes", fontSize: 14 }),

  component("chartBar", "Chart: Bar", "Charts", "BarChartHorizontal", 150, 105),
  component("chartColumn", "Chart: Column", "Charts", "BarChart3", 150, 105),
  component("chartLine", "Chart: Line", "Charts", "LineChart", 160, 105),
  component("chartPie", "Chart: Pie", "Charts", "PieChart", 110, 110),
  component("hScrollBar", "H.Scroll Bar", "Charts", "PanelBottom", 180, 28, { orientation: "horizontal" }),
  component("vScrollBar", "V.Scroll Bar", ["Common", "Charts"], "PanelRight", 28, 180, { orientation: "vertical" }),
  component("hSlider", "Slider", "Charts", "SlidersHorizontal", 170, 36, { orientation: "horizontal", value: 55 }),
  component("vSlider", "V.Slider", "Charts", "SlidersVertical", 36, 170, { orientation: "vertical", value: 55 }),
  component("volumeSlider", "Volume Slider", "Charts", "Volume2", 180, 46, { value: 55 }),

  component("arrow", "Arrow", "Markup", "MoveUpRight", 140, 80, {
    text: "",
    stroke: "#000000",
    textColor: "#111827",
    arrowLine: "curved",
    arrowHeadStart: false,
    arrowHeadEnd: true,
    arrowStrokeStyle: "solid",
    arrowLabelPosition: 50,
    arrowStart: { x: 0.12, y: 0.2 },
    arrowEnd: { x: 0.88, y: 0.8 },
  }),
  component("hRule", "Horizontal Rule", "Markup", "Minus", 150, 24, { orientation: "horizontal" }),
  component("vRule", "V.Rule", "Markup", "Minus", 24, 150, { orientation: "vertical" }),
  component("hSplitter", "H.Splitter", "Markup", "GripHorizontal", 180, 28),
  component("vSplitter", "V.Splitter", "Markup", "GripVertical", 28, 180),
  component("redX", "Red X", "Markup", "X", 140, 70, { stroke: "#8b111c" }),
  component("scratchOut", "Scratch-Out", "Markup", "Paintbrush", 140, 70),
  component("squigglyLine", "Squiggly Line", ["Common", "Markup"], "Waves", 160, 35),
  component("hCurlyBrace", "H. Curly Brace", "Markup", "Braces", 180, 46, { text: "A paragraph of text.\nA second row of text." }),
  component("vCurlyBrace", "V. Curly Brace", "Markup", "Braces", 56, 160, { text: "A paragraph of text.\nA second row of text." }),
  component("shape", "Shape", ["Common", "Markup"], "Circle", 95, 95, { fill: "#ffffff" }),

  component("image", "Image", ["Common", "Media"], "Image", 140, 120, { text: "", fill: "#ffffff", showBorder: false }),
  component("webcam", "Webcam", "Media", "Webcam", 130, 130),
  component("videoPlayer", "Video Player", "Media", "Clapperboard", 220, 145),
  component("coverFlow", "Cover Flow", "Media", "GalleryHorizontal", 200, 120),
  component("smartphone", "Smartphone", "Media", "Smartphone", 82, 160),
  component("iphone", "iPhone", "Media", "Smartphone", 82, 160),
  component("ipad", "iPad", "Media", "Tablet", 115, 170),

  component("iosKeyboard", "iOS Keyboard", "iOS", "Keyboard", 235, 110),
  component("iosMenu", "iOS Menu", "iOS", "List", 120, 170, { options: ["Label", "Label", "Label", "Label"] }),
  component("iosPicker", "iOS Picker", "iOS", "PanelBottom", 150, 130, { options: ["08", "09", "10", "AM", "PM"] }),
];

const commonComponentOrder: ComponentKind[] = [
  "browser",
  "button",
  "checkbox",
  "checkboxList",
  "circleButton",
  "comboBox",
  "icon",
  "iconText",
  "image",
  "link",
  "menuBar",
  "radioButton",
  "radioButtonGroup",
  "rectangle",
  "shape",
  "squigglyParagraph",
  "squigglyLine",
  "textArea",
  "textInput",
  "textLabel",
  "textParagraph",
  "vScrollBar",
  "window",
];

export const commonComponentRank = new Map<ComponentKind, number>(
  commonComponentOrder.map((kind, index) => [kind, index]),
);

export function createCanvasNode(kind: ComponentKind, x: number, y: number, id: string): CanvasNode {
  const definition = controlCatalogue.find((item) => item.kind === kind);
  if (!definition) throw new Error(`Unknown canvas node kind: ${kind}`);
  return {
    id,
    kind,
    name: definition.label,
    x,
    y,
    width: definition.width,
    height: definition.height,
    stroke: "#111827",
    fill: "#ffffff",
    textColor: "#111827",
    fontSize: 14,
    ...definition.defaults,
  };
}

export function editableTextField(node: CanvasNode): "text" | "options" | "value" | null {
  const optionKinds: ComponentKind[] = [
    "accordion",
    "buttonBar",
    "checkboxList",
    "comboBox",
    "breadcrumbs",
    "dropdown",
    "linkBar",
    "list",
    "menu",
    "menuBar",
    "radioButtonGroup",
    "tabBar",
    "treePane",
    "vTabs",
  ];
  const textKinds: ComponentKind[] = [
    "alertBox",
    "appBar",
    "arrow",
    "browser",
    "button",
    "callout",
    "checkbox",
    "circleButton",
    "dataGrid",
    "dateChooser",
    "fieldSet",
    "hCurlyBrace",
    "icon",
    "iconText",
    "image",
    "link",
    "multilineButton",
    "pointyButton",
    "popover",
    "radioButton",
    "searchBox",
    "stickyNote",
    "textArea",
    "textInput",
    "textLabel",
    "textParagraph",
    "textTitle",
    "tooltip",
    "vCurlyBrace",
    "window",
  ];
  if (optionKinds.includes(node.kind)) return "options";
  if (node.kind === "numericStepper") return "value";
  if (textKinds.includes(node.kind)) return "text";
  return null;
}

export function isMultilineTextNode(node: CanvasNode, field: "text" | "options" | "value", draft: string) {
  if (field === "value") return false;
  if (field === "options" && usesCommaSeparatedOptions(node)) return false;
  if (field === "options") return true;
  if (["dataGrid", "stickyNote", "textArea", "textParagraph", "squigglyParagraph"].includes(node.kind)) return true;
  return draft.includes("\n");
}

export function usesCommaSeparatedOptions(node: CanvasNode) {
  return ["alertBox", "alertBoxAndroid", "breadcrumbs", "buttonBar", "linkBar", "menuBar", "tabs", "tabBar"].includes(node.kind);
}

export function optionsEditDraft(node: CanvasNode) {
  const options = node.options ?? [];
  return usesCommaSeparatedOptions(node) ? options.join(", ") : options.join("\n");
}

export function parseOptionsEditDraft(node: CanvasNode, draft: string) {
  if (usesCommaSeparatedOptions(node)) return draft.split(",").map((item) => item.trim()).filter(Boolean);
  return draft.split("\n");
}

export function textEditDraft(node: CanvasNode) {
  if ((node.kind === "searchBox" || node.kind === "searchBoxVoice") && !node.text) return node.placeholder ?? "";
  return node.text ?? "";
}

export function isTabsNode(node: CanvasNode) {
  return node.kind === "tabs" || node.kind === "tabBar";
}

export function displayNodeName(node: CanvasNode) {
  return isTabsNode(node) ? "Tabs" : node.name;
}

export function nodeOptions(node: CanvasNode, fallback: string[] = []) {
  return node.options?.length ? node.options : fallback;
}

export function nodePercent(node: CanvasNode, fallback = 45) {
  const value = Number(node.value ?? fallback);
  return clamp(Number.isFinite(value) ? value : fallback, 0, 100);
}

export function parseTreePaneRows(node: CanvasNode): TreePaneRow[] {
  return nodeOptions(node).map((rawRow, index) => {
    const line = rawRow.replace(/\t/g, "  ");
    const leading = line.match(/^[ .]*/)?.[0] ?? "";
    const depth = Math.floor([...leading].reduce((sum, char) => sum + (char === "." ? 1 : 0.5), 0));
    const trimmed = line.slice(leading.length);
    const markerMatch = trimmed.match(/^(\[\+\]|\[-\]|\[x\]|\[X\]|\[\s\]|[fFv>\-_▸▾])(?:\s+|$)/);
    const marker = markerMatch?.[1] ?? "_";
    const label = markerMatch ? trimmed.slice(markerMatch[0].length).trimStart() : trimmed.trimStart();
    const iconByMarker: Record<string, TreePaneRow["icon"]> = {
      f: "folder-closed",
      F: "folder-open",
      "[+]": "plus",
      "[-]": "minus",
      "[x]": "checked",
      "[X]": "checked",
      "[ ]": "empty",
      ">": "chevron-right",
      v: "chevron-down",
      "▸": "chevron-right",
      "▾": "chevron-down",
      "-": "file",
      _: "none",
    };
    return {
      key: linkKeyForIndex("tree", label || trimmed || rawRow, index),
      depth,
      icon: iconByMarker[marker] ?? "none",
      label,
    };
  });
}

export function linkKeyFromLabel(label: string, fallback: string) {
  const normalized = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  return normalized || fallback;
}

export function linkKeyForIndex(prefix: string, label: string, index: number) {
  return `${prefix}:${linkKeyFromLabel(label, String(index))}:${index}`;
}

export function extractMarkdownLinks(text: string) {
  const names = [...text.matchAll(/\[([^\]]+)\]/g)].map((match) => match[1].trim()).filter(Boolean);
  return [...new Set(names)];
}

export function linkableElementsForNode(node: CanvasNode): LinkableElement[] {
  const whole = { key: "whole", label: "Whole Control" };
  if (["button", "circleButton", "pointyButton", "multilineButton", "helpButton", "icon", "iconText", "image", "checkbox", "comboBox", "radioButton", "searchBox", "onOffSwitch", "textArea"].includes(node.kind)) return [whole];
  if (node.kind === "datePicker") return ["CANCEL", "OK"].map((label, index) => ({ key: linkKeyForIndex("item", label, index), label }));
  if (node.kind === "dataGrid") return [{ key: "text:data-grid-docs", label: "Data Grid Docs" }];
  if (node.kind === "checkboxList" || node.kind === "radioButtonGroup") {
    return nodeOptions(node).map((item, index) => ({ key: linkKeyForIndex("item", item, index), label: item.replace(/^[-\s[\]x()]+/i, "").trim() || `Item ${index + 1}` }));
  }
  if (node.kind === "treePane") {
    return parseTreePaneRows(node).map((row) => ({ key: row.key, label: row.label || "Untitled row" }));
  }
  if (isTabsNode(node)) {
    return nodeOptions(node).map((item, index) => ({ key: linkKeyForIndex("item", item, index), label: item || `Tab ${index + 1}` }));
  }
  if (node.kind === "buttonBar") {
    return nodeOptions(node).map((item, index) => ({ key: linkKeyForIndex("item", item, index), label: `Item ${index + 1}` }));
  }
  if (node.kind === "alertBox" || node.kind === "alertBoxAndroid") {
    return nodeOptions(node, ["No", "Yes"]).map((item, index) => ({ key: linkKeyForIndex("item", item, index), label: item || `Button ${index + 1}` }));
  }
  if (node.kind === "appBar") {
    return nodeOptions(node, ["Menu", "ChevronDown", "MoreVertical"]).map((item, index) => ({ key: linkKeyForIndex("item", item, index), label: item || `Icon ${index + 1}` }));
  }
  if (["accordion", "linkBar", "breadcrumbs", "menuBar", "menu", "toolbar", "vTabs", "list", "listIcon"].includes(node.kind)) {
    return nodeOptions(node).map((item, index) => {
      const label = node.kind === "accordion" ? item.replace(/^\s*-\s*/, "") : item;
      return { key: linkKeyForIndex("item", item, index), label: label || `Item ${index + 1}` };
    });
  }
  if (["text", "textLabel", "textTitle", "textSubtitle", "textParagraph", "link"].includes(node.kind)) {
    return [
      ...extractMarkdownLinks(node.text ?? "").map((link) => ({ key: `text:${linkKeyFromLabel(link, "link")}`, label: link })),
      whole,
    ];
  }
  return [];
}

export function nodePropertyCapabilities(node: CanvasNode) {
  const isTextNode = ["text", "textLabel", "textTitle", "textSubtitle", "textParagraph", "link", "squigglyParagraph"].includes(node.kind);
  const isTabs = isTabsNode(node);
  const isAccordion = node.kind === "accordion";
  const isAlert = node.kind === "alertBox" || node.kind === "alertBoxAndroid";
  const isAppBar = node.kind === "appBar";
  const isButtonBar = node.kind === "buttonBar";
  const isDataGrid = node.kind === "dataGrid";
  const isArrow = node.kind === "arrow";
  const genericTextStyleKinds: ComponentKind[] = [
    "button",
    "checkbox",
    "checkboxList",
    "comboBox",
    "dateChooser",
    "fieldSet",
    "hCurlyBrace",
    "icon",
    "iconText",
    "image",
    "linkBar",
    "multilineButton",
    "numericStepper",
    "pointyButton",
    "popover",
    "radioButton",
    "radioButtonGroup",
    "searchBox",
    "stickyNote",
    "textArea",
    "textInput",
    "tooltip",
    "vCurlyBrace",
    "window",
  ];
  const genericStateKinds: ComponentKind[] = ["button", "checkbox", "comboBox", "dateChooser", "link", "numericStepper", "radioButton", "searchBox", "hSlider", "textArea", "textInput"];

  return {
    isTextNode,
    isTabs,
    isAccordion,
    isAlert,
    isAppBar,
    isButtonBar,
    isDataGrid,
    isArrow,
    genericTextStyle: !isTabs && !isAccordion && !isAlert && !isAppBar && !isArrow && !isTextNode && genericTextStyleKinds.includes(node.kind),
    showGenericState: genericStateKinds.includes(node.kind),
    showGenericBorder: !isTabs && !isAlert && "showBorder" in node,
    showGenericScrollbar: !isTabs && !isAccordion && "showScrollbar" in node,
    showGenericOpacity: !isTabs && !isArrow && "opacity" in node,
  };
}

export type NodePropertyCapabilities = ReturnType<typeof nodePropertyCapabilities>;

export function commonNodePropertyCapabilities(nodes: CanvasNode[]): NodePropertyCapabilities {
  const capabilities = nodes.map(nodePropertyCapabilities);
  const every = (key: keyof NodePropertyCapabilities) => capabilities.length > 0 && capabilities.every((item) => item[key]);
  return {
    isTextNode: every("isTextNode"),
    isTabs: every("isTabs"),
    isAccordion: every("isAccordion"),
    isAlert: every("isAlert"),
    isAppBar: every("isAppBar"),
    isButtonBar: every("isButtonBar"),
    isDataGrid: every("isDataGrid"),
    isArrow: every("isArrow"),
    genericTextStyle: every("genericTextStyle"),
    showGenericState: every("showGenericState"),
    showGenericBorder: every("showGenericBorder"),
    showGenericScrollbar: every("showGenericScrollbar"),
    showGenericOpacity: every("showGenericOpacity"),
  };
}

export function allNodesHaveProperty(nodes: CanvasNode[], property: keyof CanvasNode) {
  return nodes.length > 0 && nodes.every((node) => property in node);
}

export function nodesShareTextStyleControls(nodes: CanvasNode[]) {
  return nodes.length > 0 && nodes.every((node) => {
    const capabilities = nodePropertyCapabilities(node);
    return capabilities.isTextNode || capabilities.genericTextStyle;
  });
}

export function nodesShareGenericPaintControls(nodes: CanvasNode[]) {
  return nodes.length > 0 && nodes.every((node) => {
    const capabilities = nodePropertyCapabilities(node);
    return !capabilities.isTextNode && !capabilities.isTabs && !capabilities.isAppBar && !capabilities.isArrow;
  });
}

export function nodesShareTextColorControl(nodes: CanvasNode[]) {
  return nodes.length > 0 && nodes.every((node) => {
    const capabilities = nodePropertyCapabilities(node);
    return !capabilities.isTabs && !capabilities.isAppBar && !capabilities.isArrow;
  });
}

export function hasInteractiveOptions(node: CanvasNode) {
  return node.kind === "dropdown" || node.kind === "comboBox";
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
