import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  ArrowLeft,
  ArrowRight,
  Bold,
  BringToFront,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  CornerUpRight,
  Clipboard,
  Italic,
  PanelBottom,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Layers,
  MousePointer2,
  PanelRight,
  PanelTop,
  Play,
  Plus,
  Save,
  Search,
  SendToBack,
  Settings,
  Square,
  StickyNote,
  Strikethrough,
  Type,
  Underline,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  calculateAlignmentSnap,
  cloneNodesForPaste,
  duplicateNodesInStack,
  moveNodeLayer,
  patchNode,
  patchNodes,
  pointHitsNode,
  rectContainsNode,
  rectFromPoints,
  selectedNodesInStack,
  type AlignmentSnapGuide,
  type LayerAction,
} from "./lib/canvasNodeStack";
import {
  commitProjectHistoryChange,
  createDefaultAppearance,
  createDefaultProject,
  createNextWireframe,
  createProjectHistory,
  dirtyProjectSnapshot,
  duplicateWireframe as duplicateWireframeModel,
  projectSnapshot,
  pushHistoryEntry,
  redoProjectHistory,
  undoProjectHistory,
  updateActiveWireframeInProject,
  wireframeBackground,
  wireframeShowGrid,
  type ProjectChangeOptions,
  type ProjectHistory,
} from "./lib/projectModel";
import {
  allNodesHaveProperty,
  commonComponentRank,
  commonNodePropertyCapabilities,
  componentCategories,
  componentCategoryNames,
  controlCatalogue,
  createCanvasNode,
  displayNodeName,
  editableTextField,
  hasInteractiveOptions,
  isMultilineTextNode,
  isTabsNode,
  linkableElementsForNode,
  linkKeyForIndex,
  linkKeyFromLabel,
  nodesShareGenericPaintControls,
  nodesShareTextColorControl,
  nodesShareTextStyleControls,
  nodeOptions,
  nodePercent,
  nodePropertyCapabilities,
  optionsEditDraft,
  parseOptionsEditDraft,
  parseTreePaneRows,
  textEditDraft,
  type ComponentCategory,
  type TreePaneRow,
} from "./lib/canvasNodeSemantics";
import { isTauri, openProjectFile, readLastProjectPath, saveProjectFile, syncEditMenuState, syncRecentProjects, writeLastProjectPath } from "./lib/mockupsApi";
import type { CanvasLink, CanvasNode, CanvasPoint, ComponentDefinition, ComponentKind, MockupProject, Wireframe } from "./types";

const leftPaneCollapsedKey = "moqira-left-pane-collapsed";
const rightPaneCollapsedKey = "moqira-right-pane-collapsed";
const projectPathKey = "moqira-last-project-path";
const themeKey = "moqira-theme";
const accentKey = "moqira-accent";
const appFontSizeKey = "moqira-app-font-size";
const appFontFamilyKey = "moqira-app-font-family";
const accentTitlebarKey = "moqira-accent-titlebar";
const recentProjectsKey = "moqira-recent-projects";
const legacyProjectPathKey = "mockups-last-project-path";
const legacyThemeKey = "mockups-theme";
const legacyAccentKey = "mockups-accent";
const legacyAppFontSizeKey = "mockups-app-font-size";
const legacyAppFontFamilyKey = "mockups-app-font-family";
const legacyAccentTitlebarKey = "mockups-accent-titlebar";
const legacyRecentProjectsKey = "mockups-recent-projects";
const maxRecentProjects = 8;

const lucideIconNames: string[] = Object.keys(LucideIcons)
  .filter((name) => /^[A-Z]/.test(name) && !name.endsWith("Icon") && !name.endsWith("LucideIcon"))
  .filter((name) => {
    const value = (LucideIcons as Record<string, unknown>)[name];
    return typeof value === "object" && value !== null && "$$typeof" in (value as object);
  })
  .sort();

function getLucideIcon(name: string | undefined): LucideIcon {
  if (name) {
    const candidate = (LucideIcons as Record<string, unknown>)[name];
    if (typeof candidate === "object" && candidate !== null && "$$typeof" in (candidate as object)) {
      return candidate as LucideIcon;
    }
  }
  return Plus;
}

const iconMap: Record<string, LucideIcon> = {
  rectangle: Square,
  button: MousePointer2,
  tabs: Layers,
  buttonBar: AlignLeft,
  checkbox: CheckSquare,
  checkboxList: Clipboard,
  icon: PanelRight,
  dropdown: ChevronDown,
  textbox: Type,
  text: Type,
  stickyNote: StickyNote,
};

function componentIcon(name: string): LucideIcon {
  return iconMap[name] ?? getLucideIcon(name);
}

type ContextMenuState = {
  x: number;
  y: number;
  canvasX: number;
  canvasY: number;
  targetId: string | null;
  stack: CanvasNode[];
};

type WireframeContextMenuState = {
  x: number;
  y: number;
  wireframeId: string | null;
};

type RenameWireframeState = {
  wireframeId: string;
  draft: string;
};

type DragState =
  | {
      kind: "move";
      nodeIds: string[];
      startX: number;
      startY: number;
      originalPositions: Record<string, { x: number; y: number }>;
      currentX: number;
      currentY: number;
    }
  | {
      kind: "resize";
      nodeId: string;
      handle: ResizeHandle;
      startX: number;
      startY: number;
      originalX: number;
      originalY: number;
      originalWidth: number;
      originalHeight: number;
      currentX: number;
      currentY: number;
      currentWidth: number;
      currentHeight: number;
    };

type ResizeHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

type PaletteDragState = {
  kind: ComponentKind;
  label: string;
  x: number;
  y: number;
  startX: number;
  startY: number;
  moved: boolean;
};

type SelectionRectState = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  additive: boolean;
  moved: boolean;
};

type ArrowDrawState = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  moved: boolean;
};

type InteractiveSelectState = {
  nodeId: string;
  open: boolean;
  selectedIndex: number | null;
};

type TextEditorState = {
  nodeId: string;
  field: "text" | "options" | "value";
  draft: string;
  x: number;
  y: number;
  width: number;
  height: number;
  maxHeight: number;
  multiline: boolean;
};

type TextEditSnapshot = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
};

type RecentProject = {
  path: string;
  name: string;
  openedAt: number;
};

type ClipboardImage = {
  dataUrl: string;
  mimeType: string;
  width: number;
  height: number;
};

const internalClipboardMarker = "application/x-moqira-component-clipboard";

type MenuActions = {
  newProject: () => void;
  newWireframe: () => void;
  openProject: () => void;
  saveProject: (saveAs?: boolean) => Promise<boolean>;
  undoProjectChange: () => void;
  redoProjectChange: () => void;
  cutNode: () => void;
  copyNode: () => void;
  pasteNode: (x?: number, y?: number) => void | Promise<void>;
  deleteNode: () => void;
  duplicateNode: () => void;
  selectNone: () => void;
  layerNode: (action: LayerAction) => void;
  lockNode: () => void;
  unlockAllNodes: () => void;
  openSettings: () => void;
  openRecentProject: (path: string) => void;
};

type TextInputElement = HTMLInputElement | HTMLTextAreaElement;

let lastTextInput: TextInputElement | null = null;
let lastTextInputSelection: { value: string; selectionStart: number; selectionEnd: number; floatingEditor: boolean; updatedAt: number } | null = null;

function isTextInputElement(element: Element | null): element is TextInputElement {
  if (element instanceof HTMLTextAreaElement) return true;
  return element instanceof HTMLInputElement && ["text", "search", "url", "tel", "email", "password", ""].includes(element.type);
}

function rememberTextInputSelection(element: TextInputElement) {
  lastTextInput = element;
  lastTextInputSelection = {
    value: element.value,
    selectionStart: element.selectionStart ?? 0,
    selectionEnd: element.selectionEnd ?? element.selectionStart ?? 0,
    floatingEditor: Boolean(element.closest(".floating-text-editor")),
    updatedAt: Date.now(),
  };
}

function activeTextInput() {
  const activeElement = document.activeElement;
  if (isTextInputElement(activeElement)) {
    rememberTextInputSelection(activeElement);
    return activeElement;
  }
  if (lastTextInput?.isConnected && lastTextInput.closest(".floating-text-editor")) return lastTextInput;
  return null;
}

function replaceSelectedText(element: TextInputElement, text: string, inputType: InputEvent["inputType"]) {
  const selectionStart = element.selectionStart ?? element.value.length;
  const selectionEnd = element.selectionEnd ?? selectionStart;
  element.setRangeText(text, selectionStart, selectionEnd, "end");
  element.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType }));
  rememberTextInputSelection(element);
}

function textInputSnapshot(element: TextInputElement): TextEditSnapshot {
  return {
    value: element.value,
    selectionStart: element.selectionStart ?? element.value.length,
    selectionEnd: element.selectionEnd ?? element.selectionStart ?? element.value.length,
  };
}

function replaceTextInputSelection(element: TextInputElement, text: string) {
  const selectionStart = element.selectionStart ?? element.value.length;
  const selectionEnd = element.selectionEnd ?? selectionStart;
  const nextValue = `${element.value.slice(0, selectionStart)}${text}${element.value.slice(selectionEnd)}`;
  return {
    value: nextValue,
    selectionStart: selectionStart + text.length,
    selectionEnd: selectionStart + text.length,
  };
}

function runEditableClipboardAction(action: "cut" | "copy" | "paste", allowCachedSelection = false) {
  const element = activeTextInput();
  if (!element && action !== "copy" && action !== "cut") return false;
  if (!element) {
    const canUseCachedSelection =
      allowCachedSelection &&
      lastTextInputSelection?.floatingEditor &&
      Date.now() - lastTextInputSelection.updatedAt < 5000;
    if (!canUseCachedSelection) return false;
    const selectedText = lastTextInputSelection
      ? lastTextInputSelection.value.slice(lastTextInputSelection.selectionStart, lastTextInputSelection.selectionEnd)
      : "";
    if (!selectedText) return false;
    void navigator.clipboard?.writeText(selectedText);
    return true;
  }
  const selectionStart = element.selectionStart ?? lastTextInputSelection?.selectionStart ?? 0;
  const selectionEnd = element.selectionEnd ?? lastTextInputSelection?.selectionEnd ?? selectionStart;
  if (document.activeElement !== element) {
    element.focus({ preventScroll: true });
    element.setSelectionRange(selectionStart, selectionEnd);
  }
  if (document.execCommand(action)) return true;
  if (action === "paste") {
    void navigator.clipboard?.readText().then((text) => replaceSelectedText(element, text, "insertFromPaste"));
    return true;
  }
  const selectedText = element.value.slice(selectionStart, selectionEnd);
  if (!selectedText) return true;
  void navigator.clipboard?.writeText(selectedText);
  if (action === "cut" && selectionStart !== selectionEnd) replaceSelectedText(element, "", "deleteByCut");
  return true;
}

function quickAccessScore(definition: ComponentDefinition, query: string) {
  const label = definition.label.toLowerCase();
  const kind = definition.kind.toLowerCase();
  const category = componentCategoryNames(definition).join(" ").toLowerCase();
  const haystack = `${label} ${category} ${kind}`;
  if (!haystack.includes(query)) return Number.POSITIVE_INFINITY;
  if (label === query) return 0;
  if (label.startsWith(query)) return 1;
  if (label.split(/\s+/).some((word) => word.startsWith(query))) return 2;
  if (kind === query || kind.startsWith(query)) return 3;
  if (componentCategoryNames(definition).some((item) => item.toLowerCase() === query)) return 4;
  return 5;
}

const FILENAME_SLASH = "／";
const FILENAME_LEADING_DOT = "．";
const FILENAME_HASH = "＃";
const FILENAME_PERCENT = "％";

function encodeTitleForFilename(title: string): string {
  return title
    .replace(/\//g, FILENAME_SLASH)
    .replace(/#/g, FILENAME_HASH)
    .replace(/%/g, FILENAME_PERCENT)
    .replace(/^\.+/, (dots) => FILENAME_LEADING_DOT.repeat(dots.length));
}

function decodeTitleFromFilename(name: string): string {
  return name.replace(/／/g, "/").replace(/．/g, ".").replace(/＃/g, "#").replace(/％/g, "%");
}

function readStoredValue(key: string, legacyKey: string) {
  const value = localStorage.getItem(key) ?? localStorage.getItem(legacyKey);
  if (value !== null && !localStorage.getItem(key)) localStorage.setItem(key, value);
  return value;
}

function readRecentProjects(): RecentProject[] {
  try {
    const raw = readStoredValue(recentProjectsKey, legacyRecentProjectsKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentProject[];
    return Array.isArray(parsed) ? parsed.filter((item) => item.path && item.name) : [];
  } catch {
    return [];
  }
}

function writeRecentProjects(projects: RecentProject[]) {
  localStorage.setItem(recentProjectsKey, JSON.stringify(projects.slice(0, maxRecentProjects)));
}

function addRecentProject(projects: RecentProject[], path: string, name: string): RecentProject[] {
  const next = [{ path, name, openedAt: Date.now() }, ...projects.filter((project) => project.path !== path)];
  writeRecentProjects(next);
  return next.slice(0, maxRecentProjects);
}

function createId(prefix: string) {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
}

function defaultAppearance(): MockupProject["appearance"] {
  return createDefaultAppearance();
}

function createArrowNodeFromPoints(start: CanvasPoint, end: CanvasPoint): CanvasNode {
  const padding = 18;
  const minX = Math.min(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const rawWidth = Math.abs(end.x - start.x);
  const rawHeight = Math.abs(end.y - start.y);
  const x = Math.max(0, Math.round(minX - padding));
  const y = Math.max(0, Math.round(minY - padding));
  const width = Math.max(36, Math.round(rawWidth + padding * 2));
  const height = Math.max(36, Math.round(rawHeight + padding * 2));
  const pointInNode = (point: CanvasPoint) => ({
    x: clamp((point.x - x) / width, 0, 1),
    y: clamp((point.y - y) / height, 0, 1),
  });

  return {
    ...createCanvasNode("arrow", x, y, createId("node")),
    width,
    height,
    arrowStart: pointInNode(start),
    arrowEnd: pointInNode(end),
    arrowLine: "curved",
    arrowHeadStart: false,
    arrowHeadEnd: true,
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read clipboard image."));
    reader.readAsDataURL(blob);
  });
}

function imageSizeFromDataUrl(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || 320, height: image.naturalHeight || 240 });
    image.onerror = () => resolve({ width: 320, height: 240 });
    image.src = dataUrl;
  });
}

async function readClipboardImage(): Promise<ClipboardImage | null> {
  try {
    if (!navigator.clipboard?.read) return null;
    const clipboardItems = await navigator.clipboard.read();
    for (const item of clipboardItems) {
      const imageType = item.types.find((type) => type.startsWith("image/"));
      if (!imageType) continue;
      const blob = await item.getType(imageType);
      const dataUrl = await blobToDataUrl(blob);
      const size = await imageSizeFromDataUrl(dataUrl);
      return { dataUrl, mimeType: imageType, ...size };
    }
  } catch {
    return null;
  }
  return null;
}

function internalClipboardMarkerText(count: number) {
  return `${internalClipboardMarker}; count=${count}`;
}

async function systemClipboardHasInternalMarker() {
  try {
    const text = await navigator.clipboard?.readText();
    return typeof text === "string" && text.startsWith(internalClipboardMarker);
  } catch {
    return false;
  }
}

function writeInternalClipboardMarker(count: number) {
  void navigator.clipboard?.writeText(internalClipboardMarkerText(count)).catch(() => undefined);
}

function imageBlobFromDataTransfer(dataTransfer: DataTransfer | null): { blob: Blob; mimeType: string } | null {
  if (!dataTransfer) return null;
  for (const item of Array.from(dataTransfer.items)) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
    const file = item.getAsFile();
    if (file) return { blob: file, mimeType: item.type };
  }
  for (const file of Array.from(dataTransfer.files)) {
    if (file.type.startsWith("image/")) return { blob: file, mimeType: file.type };
  }
  return null;
}

async function clipboardImageFromBlob(blob: Blob, mimeType: string): Promise<ClipboardImage> {
  const dataUrl = await blobToDataUrl(blob);
  const size = await imageSizeFromDataUrl(dataUrl);
  return { dataUrl, mimeType, ...size };
}

function imageNodeDisplaySize(image: Pick<ClipboardImage, "width" | "height">) {
  const naturalWidth = image.width || 320;
  const naturalHeight = image.height || 240;
  const scale = Math.min(1, 720 / naturalWidth, 520 / naturalHeight);
  return {
    width: Math.max(28, Math.round(naturalWidth * scale)),
    height: Math.max(24, Math.round(naturalHeight * scale)),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function resizeBoundsFromHandle(state: Extract<DragState, { kind: "resize" }>, clientX: number, clientY: number) {
  const minWidth = 28;
  const minHeight = 24;
  const deltaX = Math.round(clientX - state.startX);
  const deltaY = Math.round(clientY - state.startY);
  const originalRight = state.originalX + state.originalWidth;
  const originalBottom = state.originalY + state.originalHeight;
  let x = state.originalX;
  let y = state.originalY;
  let width = state.originalWidth;
  let height = state.originalHeight;

  if (state.handle.includes("e")) {
    width = Math.max(minWidth, state.originalWidth + deltaX);
  }
  if (state.handle.includes("s")) {
    height = Math.max(minHeight, state.originalHeight + deltaY);
  }
  if (state.handle.includes("w")) {
    x = Math.min(originalRight - minWidth, Math.max(0, state.originalX + deltaX));
    width = originalRight - x;
  }
  if (state.handle.includes("n")) {
    y = Math.min(originalBottom - minHeight, Math.max(0, state.originalY + deltaY));
    height = originalBottom - y;
  }

  return { x, y, width, height };
}

function fileNameFromPath(path: string) {
  return path.split(/[\\/]/).at(-1) ?? path;
}

function projectNameFromPath(path: string) {
  return decodeTitleFromFilename(fileNameFromPath(path).replace(/\.(moq|moqira|dsmockup|json)$/i, "")) || "Untitled Project";
}

function defaultSaveFileName(project: MockupProject, projectPath: string | null) {
  if (projectPath) return fileNameFromPath(projectPath);
  const baseName = project.name.trim() && project.name !== "New Project" ? project.name.trim() : "Untitled Project";
  return `${encodeTitleForFilename(baseName)}.moq`;
}

function App() {
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [projectHistory, setProjectHistory] = useState<ProjectHistory>(() => createProjectHistory(createDefaultProject(createId)));
  const [appAppearance, setAppAppearance] = useState<MockupProject["appearance"]>(() => {
    const appearance = defaultAppearance();
    appearance.colorScheme = (readStoredValue(themeKey, legacyThemeKey) as MockupProject["appearance"]["colorScheme"]) || appearance.colorScheme;
    appearance.accentColor = readStoredValue(accentKey, legacyAccentKey) || appearance.accentColor;
    appearance.appFontFamily = readStoredValue(appFontFamilyKey, legacyAppFontFamilyKey) || appearance.appFontFamily;
    appearance.appFontSize = Number(readStoredValue(appFontSizeKey, legacyAppFontSizeKey)) || appearance.appFontSize;
    appearance.accentTitlebar = readStoredValue(accentTitlebarKey, legacyAccentTitlebarKey) === "true";
    return appearance;
  });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [clipboard, setClipboard] = useState<CanvasNode[]>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [wireframeContextMenu, setWireframeContextMenu] = useState<WireframeContextMenuState | null>(null);
  const [renameWireframe, setRenameWireframe] = useState<RenameWireframeState | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [selectionRect, setSelectionRect] = useState<SelectionRectState | null>(null);
  const [arrowDraw, setArrowDraw] = useState<ArrowDrawState | null>(null);
  const [snapGuides, setSnapGuides] = useState<AlignmentSnapGuide[]>([]);
  const [paletteDrag, setPaletteDrag] = useState<PaletteDragState | null>(null);
  const [textEditor, setTextEditor] = useState<TextEditorState | null>(null);
  const textEditorRef = useRef<TextEditorState | null>(null);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [closePromptOpen, setClosePromptOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>(() => readRecentProjects());
  const [activeComponentCategory, setActiveComponentCategory] = useState<ComponentCategory>("All");
  const [quickAccessQuery, setQuickAccessQuery] = useState("");
  const [quickAccessOpen, setQuickAccessOpen] = useState(false);
  const [quickAccessIndex, setQuickAccessIndex] = useState(0);
  const [interactiveSelect, setInteractiveSelect] = useState<InteractiveSelectState | null>(null);
  const [interactiveMode, setInteractiveMode] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState<boolean>(() => localStorage.getItem(leftPaneCollapsedKey) === "true");
  const [rightCollapsed, setRightCollapsed] = useState<boolean>(() => localStorage.getItem(rightPaneCollapsedKey) === "true");

  useEffect(() => {
    localStorage.setItem(leftPaneCollapsedKey, String(leftCollapsed));
  }, [leftCollapsed]);
  useEffect(() => {
    localStorage.setItem(rightPaneCollapsedKey, String(rightCollapsed));
  }, [rightCollapsed]);
  useEffect(() => {
    if (!interactiveMode) return;
    setSelectedIds([]);
    textEditorRef.current = null;
    setTextEditor(null);
    setContextMenu(null);
    setDragState(null);
    setSnapGuides([]);
  }, [interactiveMode]);
  useEffect(() => {
    if (!interactiveMode) setInteractiveSelect(null);
  }, [interactiveMode]);
  useEffect(() => {
    setInteractiveSelect(null);
  }, [projectHistory.present.activeWireframeId]);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const arrowKeyDownRef = useRef(false);
  const suppressCanvasClickRef = useRef(false);
  const suppressNextLibraryClickRef = useRef(false);
  const pendingCanvasPasteRef = useRef<number | null>(null);
  const wireframeNavigationStackRef = useRef<string[]>([]);
  const openingProjectRef = useRef(false);
  const projectDialogOpenRef = useRef(false);
  const attemptedStartupRestoreRef = useRef(false);
  const dirtyRef = useRef(false);
  const activeProjectHistoryGroupKeyRef = useRef<string | null>(null);
  const savedProjectSnapshotRef = useRef(dirtyProjectSnapshot(projectHistory.present));
  const project = projectHistory.present;
  const dirty = dirtyProjectSnapshot(project) !== savedProjectSnapshotRef.current;

  const pastePointForSize = useCallback((width: number, height: number) => {
    const canvas = canvasRef.current;
    const scroller = canvas?.parentElement;
    if (!canvas || !scroller) return { x: 120, y: 120 };
    const x = scroller.scrollLeft + (scroller.clientWidth - width) / 2;
    const y = scroller.scrollTop + (scroller.clientHeight - height) / 2;
    return {
      x: Math.max(0, Math.round(x)),
      y: Math.max(0, Math.round(y)),
    };
  }, []);

  const visibleCanvasInsertionPoint = useCallback((width: number, height: number) => {
    const canvas = canvasRef.current;
    const scroller = canvas?.parentElement;
    if (!canvas || !scroller) return { x: 120, y: 120 };
    const inset = 24;
    const maxX = Math.max(0, canvas.clientWidth - width);
    const maxY = Math.max(0, canvas.clientHeight - height);
    return {
      x: clamp(Math.round(scroller.scrollLeft + inset), 0, maxX),
      y: clamp(Math.round(scroller.scrollTop + inset), 0, maxY),
    };
  }, []);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    void syncRecentProjects(recentProjects);
  }, [recentProjects]);

  const activeWireframe = useMemo(
    () => project.wireframes.find((wireframe) => wireframe.id === project.activeWireframeId) ?? project.wireframes[0],
    [project.activeWireframeId, project.wireframes],
  );
  const selectedId = selectedIds.at(-1) ?? null;
  const selectedNode = activeWireframe?.nodes.find((node) => node.id === selectedId) ?? null;
  const selectedNodes = useMemo(() => {
    if (!activeWireframe) return [];
    const selected = new Set(selectedIds);
    return activeWireframe.nodes.filter((node) => selected.has(node.id));
  }, [activeWireframe, selectedIds]);
  const selectOnly = useCallback((id: string | null) => {
    setSelectedIds(id ? [id] : []);
  }, []);
  const selectMany = useCallback((ids: string[]) => {
    setSelectedIds(Array.from(new Set(ids)));
  }, []);
  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }, []);
  const setSelectedId = selectOnly;
  const activeWireframeBackground = wireframeBackground(activeWireframe);
  const activeWireframeShowGrid = wireframeShowGrid(activeWireframe);
  const visibleComponentLibrary = useMemo(() => {
    const definitions = controlCatalogue.filter((definition) => activeComponentCategory === "All" || componentCategoryNames(definition).includes(activeComponentCategory));
    if (activeComponentCategory === "All") return [...definitions].sort((a, b) => a.label.localeCompare(b.label));
    if (activeComponentCategory !== "Common") return definitions;
    return [...definitions].sort((a, b) => {
      const aRank = commonComponentRank.get(a.kind) ?? Number.MAX_SAFE_INTEGER;
      const bRank = commonComponentRank.get(b.kind) ?? Number.MAX_SAFE_INTEGER;
      return aRank - bRank;
    });
  }, [activeComponentCategory]);
  const quickAccessMatches = useMemo(() => {
    const query = quickAccessQuery.trim().toLowerCase();
    const matches = query
      ? controlCatalogue
          .map((definition, index) => ({ definition, index, score: quickAccessScore(definition, query) }))
          .filter((item) => Number.isFinite(item.score))
          .sort((a, b) => a.score - b.score || a.index - b.index)
          .map((item) => item.definition)
      : controlCatalogue.slice(0, 8);
    return matches.slice(0, 8);
  }, [quickAccessQuery]);

  useEffect(() => {
    setQuickAccessIndex(0);
  }, [quickAccessQuery]);

  useEffect(() => {
    void syncEditMenuState({
      canUndo: projectHistory.past.length > 0,
      canRedo: projectHistory.future.length > 0,
      hasSelection: selectedIds.length > 0,
      canPaste: true,
      canLockSelection: selectedNodes.some((node) => !node.locked),
      hasLockedNodes: Boolean(activeWireframe?.nodes.some((node) => node.locked)),
    });
  }, [activeWireframe?.nodes, clipboard.length, projectHistory.future.length, projectHistory.past.length, selectedIds.length, selectedNodes]);

  const startTitlebarDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, input, textarea, select, a")) return;
    if (!isTauri()) return;
    void getCurrentWindow().startDragging();
  };

  useEffect(() => {
    document.documentElement.dataset.theme = appAppearance.colorScheme;
    document.documentElement.style.setProperty("--accent", appAppearance.accentColor);
    document.documentElement.style.setProperty("--app-font-family", appAppearance.appFontFamily);
    document.documentElement.style.setProperty("--app-font-size", `${appAppearance.appFontSize}px`);
    localStorage.setItem(themeKey, appAppearance.colorScheme);
    localStorage.setItem(accentKey, appAppearance.accentColor);
    localStorage.setItem(appFontFamilyKey, appAppearance.appFontFamily);
    localStorage.setItem(appFontSizeKey, String(appAppearance.appFontSize));
    localStorage.setItem(accentTitlebarKey, String(appAppearance.accentTitlebar));
  }, [appAppearance]);

  useEffect(() => {
    if (!saveToast) return;
    const timeout = window.setTimeout(() => setSaveToast(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [saveToast]);

  const endProjectHistoryGroup = useCallback(() => {
    activeProjectHistoryGroupKeyRef.current = null;
  }, []);

  const resetProjectHistory = useCallback((nextProject: MockupProject, saved = true) => {
    endProjectHistoryGroup();
    setProjectHistory(createProjectHistory(nextProject));
    if (saved) savedProjectSnapshotRef.current = dirtyProjectSnapshot(nextProject);
  }, [endProjectHistoryGroup]);

  const commitProjectChange = useCallback(
    (updater: (project: MockupProject) => MockupProject, options: ProjectChangeOptions = {}) => {
      setProjectHistory((current) => {
        const result = commitProjectHistoryChange(current, updater, options, activeProjectHistoryGroupKeyRef.current);
        activeProjectHistoryGroupKeyRef.current = result.groupKey;
        return result.history;
      });
    },
    [],
  );

  const undoProjectChange = useCallback(() => {
    endProjectHistoryGroup();
    setProjectHistory(undoProjectHistory);
    setSelectedId(null);
  }, [endProjectHistoryGroup, setSelectedId]);

  const redoProjectChange = useCallback(() => {
    endProjectHistoryGroup();
    setProjectHistory(redoProjectHistory);
    setSelectedId(null);
  }, [endProjectHistoryGroup, setSelectedId]);

  useEffect(() => {
    if (attemptedStartupRestoreRef.current || !isTauri()) return;
    attemptedStartupRestoreRef.current = true;

    Promise.resolve(readStoredValue(projectPathKey, legacyProjectPathKey))
      .then((localPath) => localPath || readLastProjectPath())
      .then((rememberedPath) => {
        if (!rememberedPath) return null;
        return openProjectFile(rememberedPath).then((loadedProject) => ({ rememberedPath, loadedProject }));
      })
      .then((loadedProject) => {
        if (!loadedProject) {
          return;
        }
        const projectName = projectNameFromPath(loadedProject.rememberedPath);
        const restoredProject = { ...loadedProject.loadedProject, name: projectName };
        resetProjectHistory(restoredProject);
        setProjectPath(loadedProject.rememberedPath);
        setSelectedId(null);
        localStorage.setItem(projectPathKey, loadedProject.rememberedPath);
        void writeLastProjectPath(loadedProject.rememberedPath);
        setRecentProjects((current) => addRecentProject(current, loadedProject.rememberedPath, projectName));
      })
      .catch((error) => {
        console.warn("Could not reopen last project", error);
      });
  }, [resetProjectHistory, setSelectedId]);

  const mutateProject = useCallback((updater: (project: MockupProject) => MockupProject, options?: ProjectChangeOptions) => {
    commitProjectChange(updater, options);
  }, [commitProjectChange]);

  const mutateActiveWireframe = useCallback(
    (updater: (wireframe: Wireframe) => Wireframe, options?: ProjectChangeOptions) => {
      mutateProject((current) => updateActiveWireframeInProject(current, updater), options);
    },
    [mutateProject],
  );

  const updateActiveWireframe = useCallback(
    (patch: Partial<Wireframe>) => {
      mutateActiveWireframe((wireframe) => ({ ...wireframe, ...patch }));
    },
    [mutateActiveWireframe],
  );

  const addNode = useCallback(
    (kind: ComponentKind, x?: number, y?: number) => {
      const node = createCanvasNode(kind, 0, 0, createId("node"));
      const point = x === undefined || y === undefined ? visibleCanvasInsertionPoint(node.width, node.height) : { x: Math.round(x), y: Math.round(y) };
      node.x = point.x;
      node.y = point.y;
      mutateActiveWireframe((wireframe) => ({ ...wireframe, nodes: [...wireframe.nodes, node] }));
      setSelectedId(node.id);
    },
    [mutateActiveWireframe, setSelectedId, visibleCanvasInsertionPoint],
  );

  const addArrowNodeFromPoints = useCallback(
    (start: CanvasPoint, end: CanvasPoint) => {
      const node = createArrowNodeFromPoints(start, end);
      mutateActiveWireframe((wireframe) => ({ ...wireframe, nodes: [...wireframe.nodes, node] }));
      setSelectedId(node.id);
      return node;
    },
    [mutateActiveWireframe, setSelectedId],
  );

  const addImageNode = useCallback(
    (image: ClipboardImage, x?: number, y?: number) => {
      const size = imageNodeDisplaySize(image);
      const point = x === undefined || y === undefined ? pastePointForSize(size.width, size.height) : { x: Math.round(x), y: Math.round(y) };
      const node: CanvasNode = {
        ...createCanvasNode("image", point.x, point.y, createId("node")),
        width: size.width,
        height: size.height,
        imageDataUrl: image.dataUrl,
        imageMimeType: image.mimeType,
        imageNaturalWidth: image.width,
        imageNaturalHeight: image.height,
      };
      mutateActiveWireframe((wireframe) => ({ ...wireframe, nodes: [...wireframe.nodes, node] }));
      setSelectedId(node.id);
      return node;
    },
    [mutateActiveWireframe, pastePointForSize, setSelectedId],
  );

  const updateNode = useCallback(
    (id: string, patch: Partial<CanvasNode>, options?: ProjectChangeOptions) => {
      mutateActiveWireframe((wireframe) => ({
        ...wireframe,
        nodes: patchNode(wireframe.nodes, id, patch),
      }), options);
    },
    [mutateActiveWireframe],
  );

  const updateSelectedNodes = useCallback(
    (patch: Partial<CanvasNode>, options?: ProjectChangeOptions) => {
      const ids = new Set(selectedIds);
      if (!ids.size) return;
      mutateActiveWireframe((wireframe) => ({
        ...wireframe,
        nodes: wireframe.nodes.map((node) => (ids.has(node.id) ? { ...node, ...patch } : node)),
      }), options);
    },
    [mutateActiveWireframe, selectedIds],
  );

  const previewNode = useCallback((id: string, patch: Partial<CanvasNode>) => {
    endProjectHistoryGroup();
    setProjectHistory((current) => ({
      ...current,
      present: {
        ...current.present,
        wireframes: current.present.wireframes.map((wireframe) =>
          wireframe.id === current.present.activeWireframeId
            ? { ...wireframe, nodes: patchNode(wireframe.nodes, id, patch) }
            : wireframe,
        ),
      },
    }));
  }, [endProjectHistoryGroup]);

  const previewNodes = useCallback((patches: Record<string, Partial<CanvasNode>>) => {
    endProjectHistoryGroup();
    setProjectHistory((current) => ({
      ...current,
      present: {
        ...current.present,
        wireframes: current.present.wireframes.map((wireframe) =>
          wireframe.id === current.present.activeWireframeId
            ? { ...wireframe, nodes: patchNodes(wireframe.nodes, patches) }
            : wireframe,
        ),
      },
    }));
  }, [endProjectHistoryGroup]);

  const commitNodeDrag = useCallback((state: DragState) => {
    setProjectHistory((current) => {
      const originalProject = {
        ...current.present,
        wireframes: current.present.wireframes.map((wireframe) =>
          wireframe.id === current.present.activeWireframeId
            ? {
                ...wireframe,
                nodes: wireframe.nodes.map((node) => {
                  if (state.kind === "move") {
                    const originalPosition = state.originalPositions[node.id];
                    return originalPosition ? { ...node, ...originalPosition } : node;
                  }
                  if (node.id !== state.nodeId) return node;
                  return { ...node, x: state.originalX, y: state.originalY, width: state.originalWidth, height: state.originalHeight };
                }),
              }
            : wireframe,
        ),
      };
      if (projectSnapshot(originalProject) === projectSnapshot(current.present)) return current;
      return {
        past: pushHistoryEntry(current.past, originalProject),
        present: current.present,
        future: [],
      };
    });
  }, []);

  const beginTextEdit = useCallback((node: CanvasNode) => {
    const field = editableTextField(node);
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!field || !canvasRect) return;

    const draft =
      field === "options"
        ? optionsEditDraft(node)
        : field === "value"
          ? String(node.value ?? "")
          : textEditDraft(node);
    const multiline = isMultilineTextNode(node, field, draft);
    const lineCount = Math.max(1, draft.split("\n").length);
    const maxEditorHeight = Math.max(142, Math.floor(canvasRect.height * 0.4));
    const naturalEditorHeight = multiline ? 56 + lineCount * 28 : 96;
    const nodeViewportX = canvasRect.left + node.x;
    const nodeViewportY = canvasRect.top + node.y;
    const width = Math.max(multiline ? 420 : 360, node.width + 220);
    const height = multiline ? clamp(Math.max(170, node.height + 82, naturalEditorHeight), 170, maxEditorHeight) : 96;
    const maxX = Math.max(12, window.innerWidth - width - 12);
    const maxY = Math.max(12, window.innerHeight - height - 12);

    setSelectedId(node.id);
    const nextEditor = {
      nodeId: node.id,
      field,
      draft,
      x: clamp(nodeViewportX - 12, 12, maxX),
      y: clamp(nodeViewportY + Math.min(24, node.height), 12, maxY),
      width,
      height,
      maxHeight: maxEditorHeight,
      multiline,
    };
    textEditorRef.current = nextEditor;
    setTextEditor(nextEditor);
  }, [setSelectedId]);

  const closeTextEditor = useCallback(
    (commit: boolean, draftOverride?: string) => {
      const editor = textEditorRef.current;
      if (!editor) return;
      if (commit) {
        const node = project.wireframes.flatMap((wireframe) => wireframe.nodes).find((item) => item.id === editor.nodeId);
        if (!node) {
          textEditorRef.current = null;
          setTextEditor(null);
          return;
        }
        const draft = draftOverride ?? editor.draft;
        const patch =
          editor.field === "options"
            ? { options: parseOptionsEditDraft(node, draft) }
            : editor.field === "value"
              ? { value: Number.isFinite(Number(draft)) ? Number(draft) : draft }
              : { text: draft };
        updateNode(editor.nodeId, patch);
      }
      textEditorRef.current = null;
      setTextEditor(null);
    },
    [project.wireframes, updateNode],
  );

  const deleteNode = useCallback(
    (id?: string | null) => {
      const ids = id ? [id] : selectedIds;
      if (!ids.length) return;
      const deleted = new Set(ids);
      mutateActiveWireframe((wireframe) => ({ ...wireframe, nodes: wireframe.nodes.filter((node) => !deleted.has(node.id)) }));
      setSelectedIds((current) => current.filter((item) => !deleted.has(item)));
    },
    [mutateActiveWireframe, selectedIds],
  );

  const duplicateNode = useCallback(
    (id?: string | null) => {
      const sourceIds = id ? [id] : selectedIds;
      const nodes = selectedNodesInStack(activeWireframe?.nodes ?? [], sourceIds);
      if (!nodes.length) return;
      const result = duplicateNodesInStack(activeWireframe?.nodes ?? [], sourceIds, createId);
      mutateActiveWireframe((wireframe) => ({ ...wireframe, nodes: result.nodes }));
      selectMany(result.duplicates.map((node) => node.id));
    },
    [activeWireframe?.nodes, mutateActiveWireframe, selectMany, selectedIds],
  );

  const copyNode = useCallback(
    (id?: string | null) => {
      const sourceIds = id ? [id] : selectedIds;
      const nodes = selectedNodesInStack(activeWireframe?.nodes ?? [], sourceIds);
      if (!nodes.length) return;
      setClipboard(nodes);
      writeInternalClipboardMarker(nodes.length);
    },
    [activeWireframe?.nodes, selectedIds],
  );

  const cutNode = useCallback(
    (id?: string | null) => {
      const sourceIds = id ? [id] : selectedIds;
      const nodes = selectedNodesInStack(activeWireframe?.nodes ?? [], sourceIds);
      if (!nodes.length) return;
      setClipboard(nodes);
      writeInternalClipboardMarker(nodes.length);
      deleteNode(id);
    },
    [activeWireframe?.nodes, deleteNode, selectedIds],
  );

  const pasteClipboardNodes = useCallback(
    (x?: number, y?: number) => {
      if (!clipboard.length) return false;
      const nodes = cloneNodesForPaste(clipboard, createId, x === undefined || y === undefined ? undefined : { x, y });
      mutateActiveWireframe((wireframe) => ({ ...wireframe, nodes: [...wireframe.nodes, ...nodes] }));
      selectMany(nodes.map((node) => node.id));
      return true;
    },
    [clipboard, mutateActiveWireframe, selectMany],
  );

  const pasteNode = useCallback(
    async (x?: number, y?: number) => {
      if (clipboard.length && await systemClipboardHasInternalMarker()) {
        pasteClipboardNodes(x, y);
        return;
      }
      const image = await readClipboardImage();
      if (image) {
        addImageNode(image, x, y);
        return;
      }
      if (pasteClipboardNodes(x, y)) return;
    },
    [addImageNode, clipboard.length, pasteClipboardNodes],
  );

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (interactiveMode) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select")) return;
      const marker = event.clipboardData?.getData("text/plain");
      if (clipboard.length && marker?.startsWith(internalClipboardMarker)) {
        event.preventDefault();
        pendingCanvasPasteRef.current = null;
        pasteClipboardNodes();
        return;
      }
      const imageBlob = imageBlobFromDataTransfer(event.clipboardData);
      if (!imageBlob) return;
      event.preventDefault();
      pendingCanvasPasteRef.current = null;
      void clipboardImageFromBlob(imageBlob.blob, imageBlob.mimeType).then((image) => addImageNode(image));
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addImageNode, clipboard.length, interactiveMode, pasteClipboardNodes]);

  const layerNode = useCallback(
    (id: string | null, action: LayerAction) => {
      const ids = id ? [id] : selectedIds;
      if (!ids.length) return;
      mutateActiveWireframe((wireframe) => ({ ...wireframe, nodes: moveNodeLayer(wireframe.nodes, ids, action) }));
    },
    [mutateActiveWireframe, selectedIds],
  );

  const lockNode = useCallback(
    (id?: string | null) => {
      const ids = id ? [id] : selectedIds;
      if (!ids.length) return;
      const locked = new Set(ids);
      mutateActiveWireframe((wireframe) => ({
        ...wireframe,
        nodes: wireframe.nodes.map((node) => (locked.has(node.id) ? { ...node, locked: true } : node)),
      }));
    },
    [mutateActiveWireframe, selectedIds],
  );

  const unlockAllNodes = useCallback(() => {
    mutateActiveWireframe((wireframe) => ({
      ...wireframe,
      nodes: wireframe.nodes.map((node) => (node.locked ? { ...node, locked: false } : node)),
    }));
  }, [mutateActiveWireframe]);

  const selectNone = useCallback(() => {
    closeTextEditor(true);
    setSelectedId(null);
    setContextMenu(null);
  }, [closeTextEditor, setSelectedId]);

  const selectWireframe = useCallback((wireframeId: string) => {
    endProjectHistoryGroup();
    setProjectHistory((current) =>
      current.present.activeWireframeId === wireframeId
        ? current
        : { ...current, present: { ...current.present, activeWireframeId: wireframeId } },
    );
    setSelectedId(null);
  }, [endProjectHistoryGroup, setSelectedId]);

  const followLink = useCallback(
    (link: CanvasLink | undefined) => {
      if (!link) return;
      if (link.kind === "url") {
        if (link.url) window.open(link.url, "_blank", "noopener,noreferrer");
        return;
      }
      if (link.kind === "back") {
        const previousWireframeId = wireframeNavigationStackRef.current.pop();
        if (previousWireframeId && project.wireframes.some((wireframe) => wireframe.id === previousWireframeId)) {
          selectWireframe(previousWireframeId);
        }
        return;
      }
      if (link.wireframeId === project.activeWireframeId) return;
      if (!project.wireframes.some((wireframe) => wireframe.id === link.wireframeId)) return;
      if (project.activeWireframeId) wireframeNavigationStackRef.current.push(project.activeWireframeId);
      selectWireframe(link.wireframeId);
    },
    [project.activeWireframeId, project.wireframes, selectWireframe],
  );

  const followNodeLink = useCallback(
    (node: CanvasNode, key: string) => {
      followLink(node.links?.[key] ?? node.links?.whole);
    },
    [followLink],
  );

  const toggleInteractiveSelect = useCallback((node: CanvasNode) => {
    if (!hasInteractiveOptions(node)) return;
    setInteractiveSelect((current) => ({
      nodeId: node.id,
      selectedIndex: current?.nodeId === node.id ? current.selectedIndex : null,
      open: current?.nodeId === node.id ? !current.open : true,
    }));
  }, []);

  const confirmLosingUnsavedChanges = useCallback(() => {
    if (!dirty) return true;
    return window.confirm("This project has unsaved changes. Continue without saving them?");
  }, [dirty]);

  const saveProject = useCallback(
    async (saveAs = false): Promise<boolean> => {
      let nextPath = saveAs ? null : projectPath;
      if (!nextPath || saveAs) {
        if (projectDialogOpenRef.current) return false;
        projectDialogOpenRef.current = true;
        try {
          const chosen = await saveDialog({
            title: "Save Moqira Project",
            defaultPath: defaultSaveFileName(project, saveAs ? null : projectPath),
            filters: [{ name: "Moqira Project", extensions: ["moq", "moqira", "dsmockup", "json"] }],
          });
          if (!chosen) {
            return false;
          }
          nextPath = chosen;
        } finally {
          projectDialogOpenRef.current = false;
        }
      }
      const projectToSave = { ...project, name: projectNameFromPath(nextPath) };
      await saveProjectFile(nextPath, projectToSave);
      endProjectHistoryGroup();
      setProjectHistory((current) => ({ ...current, present: projectToSave }));
      setProjectPath(nextPath);
      localStorage.setItem(projectPathKey, nextPath);
      await writeLastProjectPath(nextPath);
      setRecentProjects((current) => addRecentProject(current, nextPath, projectToSave.name));
      savedProjectSnapshotRef.current = dirtyProjectSnapshot(projectToSave);
      setSaveToast(`Saved ${fileNameFromPath(nextPath)}`);
      return true;
    },
    [endProjectHistoryGroup, project, projectPath],
  );

  const closeWindow = useCallback(async () => {
    await getCurrentWindow().destroy();
  }, []);

  const handleCloseRequest = useCallback(() => {
    if (dirtyRef.current) {
      setClosePromptOpen(true);
      return;
    }
    void closeWindow();
  }, [closeWindow]);

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    listen("mockups-window-close-requested", handleCloseRequest).then((cleanup) => {
      if (cancelled) cleanup();
      else unlisten = cleanup;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [handleCloseRequest]);

  const openProject = useCallback(async () => {
    if (openingProjectRef.current) return;
    if (projectDialogOpenRef.current) return;
    if (!confirmLosingUnsavedChanges()) return;
    openingProjectRef.current = true;
    projectDialogOpenRef.current = true;
    try {
      const chosen = await openDialog({
        title: "Open Moqira Project",
        multiple: false,
      });
      if (!chosen || Array.isArray(chosen)) return;
      const loaded = await openProjectFile(chosen);
      const projectName = projectNameFromPath(chosen);
      resetProjectHistory({ ...loaded, name: projectName });
      setProjectPath(chosen);
      localStorage.setItem(projectPathKey, chosen);
      await writeLastProjectPath(chosen);
      setRecentProjects((current) => addRecentProject(current, chosen, projectName));
      setSelectedId(null);
    } finally {
      openingProjectRef.current = false;
      projectDialogOpenRef.current = false;
    }
  }, [confirmLosingUnsavedChanges, resetProjectHistory, setSelectedId]);

  const openRecentProject = useCallback(
    async (path: string) => {
      if (!confirmLosingUnsavedChanges()) return;
      try {
        const loaded = await openProjectFile(path);
        const projectName = projectNameFromPath(path);
        resetProjectHistory({ ...loaded, name: projectName });
        setProjectPath(path);
        localStorage.setItem(projectPathKey, path);
        await writeLastProjectPath(path);
        setRecentProjects((current) => addRecentProject(current, path, projectName));
        setSelectedId(null);
      } catch (error) {
        console.warn("Could not open recent project", error);
        setRecentProjects((current) => {
          const next = current.filter((project) => project.path !== path);
          writeRecentProjects(next);
          return next;
        });
      }
    },
    [confirmLosingUnsavedChanges, resetProjectHistory, setSelectedId],
  );

  const newProject = useCallback(() => {
    if (!confirmLosingUnsavedChanges()) return;
    resetProjectHistory(createDefaultProject(createId));
    setProjectPath(null);
    setSelectedId(null);
  }, [confirmLosingUnsavedChanges, resetProjectHistory, setSelectedId]);

  const menuActionsRef = useRef<MenuActions>({
    newProject: () => {},
    newWireframe: () => {},
    openProject: () => {},
    saveProject: async () => false,
    undoProjectChange: () => {},
    redoProjectChange: () => {},
    cutNode: () => {},
    copyNode: () => {},
    pasteNode: () => {},
    deleteNode: () => {},
    duplicateNode: () => {},
    selectNone: () => {},
    layerNode: () => {},
    lockNode: () => {},
    unlockAllNodes: () => {},
    openSettings: () => {},
    openRecentProject: () => {},
  });

  menuActionsRef.current = {
    newProject,
    newWireframe: addWireframe,
    openProject,
    saveProject,
    undoProjectChange,
    redoProjectChange,
    cutNode,
    copyNode,
    pasteNode,
    deleteNode,
    duplicateNode,
    selectNone,
    layerNode: (action) => layerNode(null, action),
    lockNode,
    unlockAllNodes,
    openSettings: () => {
      setSelectedId(null);
      setSettingsOpen(true);
    },
    openRecentProject: (path) => void openRecentProject(path),
  };

  useEffect(() => {
    if (!isTauri()) return;
    const cleanups: Array<() => void> = [];
    let disposed = false;
    const runAfterMenuCloses = (action: () => void) => {
      window.setTimeout(action, 0);
    };
    const addMenuListener = <T,>(eventName: string, handler: (event: { payload: T }) => void) => {
      void listen<T>(eventName, handler).then((cleanup) => {
        if (disposed) cleanup();
        else cleanups.push(cleanup);
      });
    };

    addMenuListener("menu-new-project", () => menuActionsRef.current.newProject());
    addMenuListener("menu-new-wireframe", () => menuActionsRef.current.newWireframe());
    addMenuListener("menu-open-project", () => runAfterMenuCloses(() => void menuActionsRef.current.openProject()));
    addMenuListener("menu-save-project", () => void menuActionsRef.current.saveProject(false));
    addMenuListener("menu-save-project-as", () => runAfterMenuCloses(() => void menuActionsRef.current.saveProject(true)));
    addMenuListener("menu-undo-project", () => menuActionsRef.current.undoProjectChange());
    addMenuListener("menu-redo-project", () => menuActionsRef.current.redoProjectChange());
    addMenuListener("menu-cut-node", () => {
      if (!runEditableClipboardAction("cut", true)) menuActionsRef.current.cutNode();
    });
    addMenuListener("menu-copy-node", () => {
      if (!runEditableClipboardAction("copy", true)) menuActionsRef.current.copyNode();
    });
    addMenuListener("menu-paste-node", () => {
      if (!runEditableClipboardAction("paste")) void menuActionsRef.current.pasteNode();
    });
    addMenuListener("menu-delete-node", () => menuActionsRef.current.deleteNode());
    addMenuListener("menu-duplicate-node", () => menuActionsRef.current.duplicateNode());
    addMenuListener("menu-select-none", () => menuActionsRef.current.selectNone());
    addMenuListener("menu-layer-front", () => menuActionsRef.current.layerNode("front"));
    addMenuListener("menu-layer-forward", () => menuActionsRef.current.layerNode("forward"));
    addMenuListener("menu-layer-backward", () => menuActionsRef.current.layerNode("backward"));
    addMenuListener("menu-layer-back", () => menuActionsRef.current.layerNode("back"));
    addMenuListener("menu-lock-node", () => menuActionsRef.current.lockNode());
    addMenuListener("menu-unlock-all-nodes", () => menuActionsRef.current.unlockAllNodes());
    addMenuListener("menu-open-settings", () => menuActionsRef.current.openSettings());
    addMenuListener<string>("menu-open-recent-project", (event) => menuActionsRef.current.openRecentProject(event.payload));

    return () => {
      disposed = true;
      cleanups.forEach((cleanup) => cleanup());
    };
  }, []);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (!dragState) return;
      event.preventDefault();
      if (dragState.kind === "move") {
        const node = activeWireframe?.nodes.find((item) => item.id === dragState.nodeIds[0]);
        if (!node) return;
        const originalPosition = dragState.originalPositions[node.id];
        if (!originalPosition) return;
        const rawX = Math.max(0, Math.round(originalPosition.x + event.clientX - dragState.startX));
        const rawY = Math.max(0, Math.round(originalPosition.y + event.clientY - dragState.startY));
        const canvasWidth = canvasRef.current?.clientWidth ?? 0;
        const canvasHeight = canvasRef.current?.clientHeight ?? 0;
        const snap = event.shiftKey
          ? { deltaX: rawX - originalPosition.x, deltaY: rawY - originalPosition.y, guides: [] }
          : calculateAlignmentSnap({
              nodes: activeWireframe?.nodes ?? [],
              movingIds: dragState.nodeIds,
              originalPositions: dragState.originalPositions,
              activeNodeId: node.id,
              rawX,
              rawY,
              canvasWidth,
              canvasHeight,
            });
        const patches = Object.fromEntries(
          dragState.nodeIds.flatMap((id) => {
            const position = dragState.originalPositions[id];
            return position ? [[id, { x: Math.max(0, position.x + snap.deltaX), y: Math.max(0, position.y + snap.deltaY) }]] : [];
          }),
        );
        setSnapGuides(snap.guides);
        setDragState({ ...dragState, currentX: originalPosition.x + snap.deltaX, currentY: originalPosition.y + snap.deltaY });
        previewNodes(patches);
      } else {
        const nextBounds = resizeBoundsFromHandle(dragState, event.clientX, event.clientY);
        setDragState({ ...dragState, ...nextBounds, currentX: nextBounds.x, currentY: nextBounds.y, currentWidth: nextBounds.width, currentHeight: nextBounds.height });
        previewNode(dragState.nodeId, nextBounds);
      }
    };
    const onPointerUp = () => {
      if (dragState) commitNodeDrag(dragState);
      endProjectHistoryGroup();
      setDragState(null);
      setSnapGuides([]);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [activeWireframe?.nodes, commitNodeDrag, dragState, endProjectHistoryGroup, previewNode, previewNodes]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (!paletteDrag) return;
      const moved = paletteDrag.moved || Math.hypot(event.clientX - paletteDrag.startX, event.clientY - paletteDrag.startY) > 4;
      setPaletteDrag({ ...paletteDrag, x: event.clientX, y: event.clientY, moved });
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!paletteDrag) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      const droppedOnCanvas =
        rect && event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      if (paletteDrag.moved) {
        suppressNextLibraryClickRef.current = true;
        if (!interactiveMode && droppedOnCanvas && rect) {
          addNode(paletteDrag.kind, event.clientX - rect.left, event.clientY - rect.top);
        }
      }
      setPaletteDrag(null);
      window.setTimeout(() => {
        suppressNextLibraryClickRef.current = false;
      }, 0);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [addNode, interactiveMode, paletteDrag]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (!selectionRect) return;
      event.preventDefault();
      const point = canvasPointFromEvent(event);
      const moved = selectionRect.moved || Math.hypot(point.x - selectionRect.startX, point.y - selectionRect.startY) > 4;
      setSelectionRect({ ...selectionRect, currentX: point.x, currentY: point.y, moved });
    };
    const onPointerUp = () => {
      if (!selectionRect) return;
      if (selectionRect.moved) {
        const rect = rectFromPoints(selectionRect.startX, selectionRect.startY, selectionRect.currentX, selectionRect.currentY);
        const hits = (activeWireframe?.nodes ?? []).filter((node) => rectContainsNode(rect, node)).map((node) => node.id);
        selectMany(selectionRect.additive ? [...selectedIds, ...hits] : hits);
        suppressCanvasClickRef.current = true;
        window.setTimeout(() => {
          suppressCanvasClickRef.current = false;
        }, 0);
      } else if (!selectionRect.additive) {
        selectOnly(null);
      }
      setSelectionRect(null);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [activeWireframe?.nodes, selectMany, selectOnly, selectedIds, selectionRect]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (!arrowDraw) return;
      event.preventDefault();
      const point = canvasPointFromEvent(event);
      const moved = arrowDraw.moved || Math.hypot(point.x - arrowDraw.startX, point.y - arrowDraw.startY) > 4;
      setArrowDraw({ ...arrowDraw, currentX: point.x, currentY: point.y, moved });
    };
    const onPointerUp = () => {
      if (!arrowDraw) return;
      if (arrowDraw.moved && Math.hypot(arrowDraw.currentX - arrowDraw.startX, arrowDraw.currentY - arrowDraw.startY) > 8) {
        addArrowNodeFromPoints(
          { x: arrowDraw.startX, y: arrowDraw.startY },
          { x: arrowDraw.currentX, y: arrowDraw.currentY },
        );
        suppressCanvasClickRef.current = true;
        window.setTimeout(() => {
          suppressCanvasClickRef.current = false;
        }, 0);
      }
      setArrowDraw(null);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [addArrowNodeFromPoints, arrowDraw]);

  useEffect(() => {
    if (!interactiveMode || !interactiveSelect?.open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".interactive-select-menu, .node-dropdown, .node-comboBox")) return;
      setInteractiveSelect((current) => (current ? { ...current, open: false } : null));
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, [interactiveMode, interactiveSelect?.open]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      const target = event.target as HTMLElement | null;
      const isEditingText = Boolean(target?.closest("input, textarea, select"));
      if (modifier && event.key.toLowerCase() === "a" && isEditingText) {
        const element = activeTextInput();
        if (element) {
          event.preventDefault();
          event.stopPropagation();
          element.select();
          rememberTextInputSelection(element);
          return;
        }
      }
      if (modifier && event.key.toLowerCase() === "z" && !isEditingText) {
        event.preventDefault();
        if (event.shiftKey) redoProjectChange();
        else undoProjectChange();
        return;
      }
      if (modifier && event.key.toLowerCase() === "y" && !isEditingText) {
        event.preventDefault();
        redoProjectChange();
        return;
      }
      if (modifier && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveProject(event.shiftKey);
      }
      if (interactiveMode) {
        if (event.key === "Escape") {
          event.preventDefault();
          if (interactiveSelect?.open) {
            setInteractiveSelect((current) => (current ? { ...current, open: false } : null));
            return;
          }
          setInteractiveMode(false);
        }
        return;
      }
      if (!modifier && event.key.toLowerCase() === "a" && !isEditingText) {
        arrowKeyDownRef.current = true;
        return;
      }
      if (modifier && event.key.toLowerCase() === "c" && !isEditingText) {
        event.preventDefault();
        if (runEditableClipboardAction("copy")) return;
        copyNode();
        return;
      }
      if (modifier && event.key.toLowerCase() === "x" && !isEditingText) {
        event.preventDefault();
        if (runEditableClipboardAction("cut")) return;
        cutNode();
        return;
      }
      if (modifier && event.key.toLowerCase() === "v" && !isEditingText) {
        if (runEditableClipboardAction("paste")) return;
        const pasteToken = Date.now();
        pendingCanvasPasteRef.current = pasteToken;
        window.setTimeout(() => {
          if (pendingCanvasPasteRef.current !== pasteToken) return;
          pendingCanvasPasteRef.current = null;
          void pasteNode();
        }, 80);
        return;
      }
      if (modifier && event.key.toLowerCase() === "d" && !isEditingText) {
        event.preventDefault();
        duplicateNode();
      }
      if (modifier && event.shiftKey && event.key.toLowerCase() === "a" && !isEditingText) {
        event.preventDefault();
        selectNone();
      }
      if (modifier && event.key === "2" && !isEditingText) {
        event.preventDefault();
        lockNode();
      }
      if (modifier && event.key === "3" && !isEditingText) {
        event.preventDefault();
        unlockAllNodes();
      }
      if (modifier && event.altKey && !isEditingText) {
        const layerShortcuts: Record<string, LayerAction> = {
          ArrowUp: event.shiftKey ? "front" : "forward",
          ArrowDown: event.shiftKey ? "back" : "backward",
        };
        const action = layerShortcuts[event.key];
        if (action) {
          event.preventDefault();
          layerNode(null, action);
        }
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedIds.length) {
        if (target?.closest("input, textarea, select")) return;
        event.preventDefault();
        deleteNode();
      }
      if (event.key === "Escape") {
        if (textEditor) {
          event.preventDefault();
          closeTextEditor(false);
          return;
        }
        setContextMenu(null);
        selectOnly(null);
      }
      if (event.key === "Enter" && !modifier && selectedNode && !isEditingText) {
        event.preventDefault();
        beginTextEdit(selectedNode);
        return;
      }
      if (selectedIds.length && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        if (target?.closest("input, textarea, select")) return;
        event.preventDefault();
        const distance = event.shiftKey ? 10 : 1;
        const selected = new Set(selectedIds);
        mutateActiveWireframe((wireframe) => ({
          ...wireframe,
          nodes: wireframe.nodes.map((node) =>
            selected.has(node.id)
              ? {
                  ...node,
                  x: Math.max(0, node.x + (event.key === "ArrowLeft" ? -distance : event.key === "ArrowRight" ? distance : 0)),
                  y: Math.max(0, node.y + (event.key === "ArrowUp" ? -distance : event.key === "ArrowDown" ? distance : 0)),
                }
              : node,
          ),
        }));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeWireframe?.nodes,
    beginTextEdit,
    closeTextEditor,
    copyNode,
    cutNode,
    deleteNode,
    duplicateNode,
    interactiveSelect?.open,
    interactiveMode,
    layerNode,
    lockNode,
    mutateActiveWireframe,
    pasteNode,
    redoProjectChange,
    saveProject,
    selectOnly,
    selectNone,
    selectedId,
    selectedIds,
    selectedNode,
    textEditor,
    undoProjectChange,
    unlockAllNodes,
  ]);

  useEffect(() => {
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "a") return;
      arrowKeyDownRef.current = false;
    };
    window.addEventListener("keyup", onKeyUp);
    return () => window.removeEventListener("keyup", onKeyUp);
  }, []);

  function addWireframe() {
    const wireframe = createNextWireframe(project.wireframes, createId);
    mutateProject((current) => ({
      ...current,
      activeWireframeId: wireframe.id,
      wireframes: [...current.wireframes, wireframe],
    }));
    setSelectedId(null);
  }

  const duplicateWireframe = (wireframeId = activeWireframe?.id) => {
    const sourceWireframe = project.wireframes.find((wireframe) => wireframe.id === wireframeId);
    if (!sourceWireframe) return;
    const wireframe = duplicateWireframeModel(sourceWireframe, project.wireframes, createId);
    mutateProject((current) => ({
      ...current,
      activeWireframeId: wireframe.id,
      wireframes: [...current.wireframes, wireframe],
    }));
    setSelectedId(null);
  };

  const deleteWireframe = (wireframeId = activeWireframe?.id) => {
    if (!wireframeId || project.wireframes.length === 1) return;
    mutateProject((current) => {
      const nextWireframes = current.wireframes.filter((wireframe) => wireframe.id !== wireframeId);
      const activeWireframeId = current.activeWireframeId === wireframeId ? nextWireframes[0].id : current.activeWireframeId;
      return { ...current, wireframes: nextWireframes, activeWireframeId };
    });
    setSelectedId(null);
  };

  const beginRenameWireframe = (wireframeId: string) => {
    const wireframe = project.wireframes.find((item) => item.id === wireframeId);
    if (!wireframe) return;
    setRenameWireframe({ wireframeId, draft: wireframe.name });
  };

  const commitRenameWireframe = (wireframeId: string, name: string) => {
    const nextName = name.trim();
    if (!nextName) return false;
    const duplicate = project.wireframes.some((wireframe) => wireframe.id !== wireframeId && wireframe.name.trim().toLowerCase() === nextName.toLowerCase());
    if (duplicate) return false;
    mutateProject((current) => ({
      ...current,
      wireframes: current.wireframes.map((wireframe) => (wireframe.id === wireframeId ? { ...wireframe, name: nextName } : wireframe)),
    }));
    return true;
  };

  const canvasPointFromEvent = (event: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return {
      x: Math.round(event.clientX - (rect?.left ?? 0)),
      y: Math.round(event.clientY - (rect?.top ?? 0)),
    };
  };

  const openCanvasContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    if (interactiveMode) return;
    const point = canvasPointFromEvent(event);
    const stack = [...(activeWireframe?.nodes ?? [])].filter((node) => pointHitsNode(point.x, point.y, node)).reverse();
    const selected = new Set(selectedIds);
    const selectedTarget = stack.find((node) => selected.has(node.id));
    const targetId = selectedTarget?.id ?? stack[0]?.id ?? null;
    if (targetId && !selected.has(targetId)) setSelectedId(targetId);
    setContextMenu({ x: event.clientX, y: event.clientY, canvasX: point.x, canvasY: point.y, targetId, stack });
  };

  const contextTargetName = contextMenu?.targetId
    ? selectedIds.length > 1 && selectedIds.includes(contextMenu.targetId)
      ? `${selectedIds.length} selected`
      : activeWireframe?.nodes.find((node) => node.id === contextMenu.targetId)?.name ?? "Object"
    : "Canvas";
  const contextActionTargetId = contextMenu?.targetId && selectedIds.includes(contextMenu.targetId) ? null : contextMenu?.targetId ?? null;
  const projectDisplayName = projectPath ? projectNameFromPath(projectPath) : "Unsaved Project";
  const addQuickAccessNode = (definition: ComponentDefinition) => {
    addNode(definition.kind);
    setQuickAccessQuery("");
    setQuickAccessOpen(false);
    setQuickAccessIndex(0);
  };

  const createWireframeForLink = useCallback(() => {
    const wireframe = createNextWireframe(project.wireframes, createId);
    mutateProject((current) => ({
      ...current,
      wireframes: [...current.wireframes, wireframe],
    }));
    return wireframe.id;
  }, [mutateProject, project.wireframes]);

  const duplicateWireframeForLink = useCallback(() => {
    const sourceWireframe = activeWireframe;
    const wireframe = sourceWireframe
      ? duplicateWireframeModel(sourceWireframe, project.wireframes, createId)
      : createNextWireframe(project.wireframes, createId);
    mutateProject((current) => ({
      ...current,
      wireframes: [...current.wireframes, wireframe],
    }));
    return wireframe.id;
  }, [activeWireframe, mutateProject, project.wireframes]);

  const effectiveRightCollapsed = rightCollapsed || interactiveMode;

  return (
    <div className={interactiveMode ? "app-shell links-active is-interactive" : "app-shell"}>
      <header
        className={appAppearance.accentTitlebar ? "app-titlebar is-accented" : "app-titlebar"}
        data-tauri-drag-region
        onPointerDown={startTitlebarDrag}
      >
        <button
          type="button"
          className="titlebar-pane-toggle"
          title={leftCollapsed ? "Show sidebar" : "Hide sidebar"}
          onClick={() => setLeftCollapsed((v) => !v)}
        >
          {leftCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>
        <div className="project-title">
          <span>{projectDisplayName}</span>
          <strong
            className={dirty ? "save-state is-dirty" : "save-state"}
            title={dirty ? "Unsaved changes" : projectPath ? "Saved" : "Not saved"}
            aria-label={dirty ? "Unsaved changes" : projectPath ? "Saved" : "Not saved"}
          />
        </div>
        <div className="titlebar-actions">
          <div className="quick-access" role="combobox" aria-expanded={quickAccessOpen} aria-controls="quick-access-results">
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              value={quickAccessQuery}
              placeholder="Quick Access"
              aria-label="Quick Access components"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              onFocus={() => setQuickAccessOpen(true)}
              onBlur={() => window.setTimeout(() => setQuickAccessOpen(false), 120)}
              onChange={(event) => {
                setQuickAccessQuery(event.target.value);
                setQuickAccessOpen(true);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setQuickAccessOpen(true);
                  setQuickAccessIndex((index) => clamp(index + 1, 0, Math.max(quickAccessMatches.length - 1, 0)));
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setQuickAccessOpen(true);
                  setQuickAccessIndex((index) => clamp(index - 1, 0, Math.max(quickAccessMatches.length - 1, 0)));
                }
                if (event.key === "Enter") {
                  const definition = quickAccessMatches[quickAccessIndex];
                  if (!definition) return;
                  event.preventDefault();
                  addQuickAccessNode(definition);
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setQuickAccessOpen(false);
                }
              }}
            />
            {quickAccessOpen ? (
              <div className="quick-access-results" id="quick-access-results" role="listbox">
                {quickAccessMatches.length ? (
                  quickAccessMatches.map((definition, index) => {
                    const Icon = componentIcon(definition.icon);
                    return (
                      <button
                        key={definition.kind}
                        type="button"
                        role="option"
                        aria-selected={index === quickAccessIndex}
                        className={index === quickAccessIndex ? "is-active" : ""}
                        onMouseEnter={() => setQuickAccessIndex(index)}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => addQuickAccessNode(definition)}
                      >
                        <Icon size={16} />
                        <span>{definition.label}</span>
                      </button>
                    );
                  })
                ) : (
                  <div className="quick-access-empty">No components found</div>
                )}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="titlebar-pane-toggle"
            title="Save project"
            aria-label="Save project"
            onClick={() => void saveProject(false)}
          >
            <Save size={17} />
          </button>
          <button
            type="button"
            className={interactiveMode ? "titlebar-pane-toggle is-active" : "titlebar-pane-toggle"}
            title={interactiveMode ? "Stop interactive mode" : "Play interactive mode"}
            aria-label={interactiveMode ? "Stop interactive mode" : "Play interactive mode"}
            aria-pressed={interactiveMode}
            onClick={() => setInteractiveMode((value) => !value)}
          >
            {interactiveMode ? <Square size={16} /> : <Play size={17} />}
          </button>
          <button
            type="button"
            className="titlebar-pane-toggle"
            title={rightCollapsed ? "Show properties" : "Hide properties"}
            onClick={() => setRightCollapsed((v) => !v)}
          >
            {rightCollapsed ? <PanelRightOpen size={17} /> : <PanelRightClose size={17} />}
          </button>
        </div>
      </header>

      <main className={`workspace${leftCollapsed ? " left-collapsed" : ""}${effectiveRightCollapsed ? " right-collapsed" : ""}`}>
        <div className="component-library-shell">
          <div className="component-categories" aria-label="Component categories">
            {componentCategories.map((category) => (
              <button
                key={category}
                type="button"
                className={category === activeComponentCategory ? "is-active" : ""}
                onClick={() => setActiveComponentCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>
          <div className="component-library">
            {visibleComponentLibrary.map((definition) => {
              const Icon = componentIcon(definition.icon);
              return (
                <button
                  key={definition.kind}
                  type="button"
                  className="library-item"
                  disabled={interactiveMode}
                  onClick={() => {
                    if (interactiveMode) return;
                    if (suppressNextLibraryClickRef.current) return;
                    addNode(definition.kind);
                  }}
                  onPointerDown={(event) => {
                    if (interactiveMode) return;
                    if (event.button !== 0) return;
                    setPaletteDrag({
                      kind: definition.kind,
                      label: definition.label,
                      x: event.clientX,
                      y: event.clientY,
                      startX: event.clientX,
                      startY: event.clientY,
                      moved: false,
                    });
                  }}
                >
                  <Icon size={26} />
                  <span>{definition.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {leftCollapsed ? null : (
        <aside className="left-pane">
          <div className="pane-header">
            <h2>Wireframes</h2>
            <button type="button" onClick={addWireframe} title="Add wireframe">
              <Plus size={16} />
            </button>
          </div>
          <div
            className="wireframe-list"
            onContextMenu={(event) => {
              if ((event.target as HTMLElement).closest(".wireframe-row")) return;
              event.preventDefault();
              setWireframeContextMenu({ x: event.clientX, y: event.clientY, wireframeId: null });
            }}
          >
            {project.wireframes.map((wireframe) => (
              <button
                key={wireframe.id}
                type="button"
                className={wireframe.id === activeWireframe?.id ? "wireframe-row is-active" : "wireframe-row"}
                onClick={() => selectWireframe(wireframe.id)}
                onDoubleClick={() => {
                  selectWireframe(wireframe.id);
                  beginRenameWireframe(wireframe.id);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  selectWireframe(wireframe.id);
                  setWireframeContextMenu({ x: event.clientX, y: event.clientY, wireframeId: wireframe.id });
                }}
              >
                <span>{wireframe.name}</span>
                <small>{wireframe.nodes.length}</small>
              </button>
            ))}
          </div>
          <div className="wireframe-actions">
            <button type="button" onClick={() => duplicateWireframe()}>Duplicate</button>
            <button type="button" onClick={() => deleteWireframe()} disabled={project.wireframes.length === 1}>Delete</button>
          </div>
        </aside>
        )}

        <section className="center-pane">
          <div
            className={`canvas-scroll canvas-bg-${activeWireframeBackground}${activeWireframeShowGrid ? " has-grid" : ""}`}
          >
            <div
              ref={canvasRef}
              className="canvas"
              onPointerDown={(event) => {
                if (interactiveMode) return;
                if (event.button !== 0 || event.target !== event.currentTarget) return;
                const point = canvasPointFromEvent(event);
                setContextMenu(null);
                closeTextEditor(true);
                if (arrowKeyDownRef.current) {
                  setSelectedId(null);
                  setSelectionRect(null);
                  setArrowDraw({
                    startX: point.x,
                    startY: point.y,
                    currentX: point.x,
                    currentY: point.y,
                    moved: false,
                  });
                  return;
                }
                setSelectionRect({
                  startX: point.x,
                  startY: point.y,
                  currentX: point.x,
                  currentY: point.y,
                  additive: event.shiftKey || event.metaKey || event.ctrlKey,
                  moved: false,
                });
              }}
              onClick={(event) => {
                if (suppressCanvasClickRef.current) {
                  event.preventDefault();
                  return;
                }
                if (selectionRect?.moved) return;
                if (event.target === event.currentTarget && !event.shiftKey && !event.metaKey && !event.ctrlKey) setSelectedId(null);
                setContextMenu(null);
                closeTextEditor(true);
              }}
              onContextMenu={openCanvasContextMenu}
            >
              {snapGuides.map((guide, index) => (
                <div
                  key={`guide-${index}-${guide.axis}-${guide.position}`}
                  className={`snap-guide snap-guide-${guide.axis}`}
                  style={guide.axis === "x" ? { left: guide.position } : { top: guide.position }}
                />
              ))}
              {selectionRect?.moved ? (
                <div
                  className="selection-marquee"
                  style={{
                    left: rectFromPoints(selectionRect.startX, selectionRect.startY, selectionRect.currentX, selectionRect.currentY).x,
                    top: rectFromPoints(selectionRect.startX, selectionRect.startY, selectionRect.currentX, selectionRect.currentY).y,
                    width: rectFromPoints(selectionRect.startX, selectionRect.startY, selectionRect.currentX, selectionRect.currentY).width,
                    height: rectFromPoints(selectionRect.startX, selectionRect.startY, selectionRect.currentX, selectionRect.currentY).height,
                  }}
                />
              ) : null}
              {arrowDraw?.moved ? (
                <ArrowDrawPreview state={arrowDraw} />
              ) : null}
              {activeWireframe?.nodes.map((node) => (
                <CanvasItem
                  key={node.id}
                  node={node}
                  selected={selectedIds.includes(node.id)}
                  primarySelected={node.id === selectedId}
                  linksActive={interactiveMode}
                  editingLocked={interactiveMode}
                  interactiveSelect={interactiveSelect?.nodeId === node.id ? interactiveSelect : null}
                  onSelect={(additive) => {
                    if (additive) toggleSelection(node.id);
                    else setSelectedId(node.id);
                  }}
                  onLinkClick={(key) => followNodeLink(node, key)}
                  onInteractiveSelect={() => toggleInteractiveSelect(node)}
                  onInteractiveOptionSelect={(index) => {
                    setInteractiveSelect({ nodeId: node.id, selectedIndex: index, open: false });
                  }}
                  onTextEdit={() => beginTextEdit(node)}
                  onMoveStart={(event) => {
                    if (interactiveMode) return;
                    if (node.locked) return;
                    event.stopPropagation();
                    if (event.shiftKey || event.metaKey || event.ctrlKey) {
                      toggleSelection(node.id);
                      return;
                    }
                    const nodeIds = selectedIds.includes(node.id) ? selectedIds : [node.id];
                    if (!selectedIds.includes(node.id)) setSelectedId(node.id);
                    const movingNodes = activeWireframe?.nodes.filter((item) => nodeIds.includes(item.id) && !item.locked) ?? [];
                    setDragState({
                      kind: "move",
                      nodeIds: movingNodes.map((item) => item.id),
                      startX: event.clientX,
                      startY: event.clientY,
                      originalPositions: Object.fromEntries(movingNodes.map((item) => [item.id, { x: item.x, y: item.y }])),
                      currentX: node.x,
                      currentY: node.y,
                    });
                  }}
                  onResizeStart={(event, handle) => {
                    if (interactiveMode) return;
                    event.stopPropagation();
                    setSelectedId(node.id);
                    setDragState({
                      kind: "resize",
                      nodeId: node.id,
                      handle,
                      startX: event.clientX,
                      startY: event.clientY,
                      originalX: node.x,
                      originalY: node.y,
                      originalWidth: node.width,
                      originalHeight: node.height,
                      currentX: node.x,
                      currentY: node.y,
                      currentWidth: node.width,
                      currentHeight: node.height,
                    });
                  }}
                />
              ))}
            </div>
          </div>
        </section>

        {effectiveRightCollapsed ? null : (
          <aside className="right-pane">
            <PropertiesPane
              selectedNode={selectedNode}
              selectedNodes={selectedNodes}
              selectedCount={selectedIds.length}
              activeWireframe={activeWireframe}
              onWireframeChange={updateActiveWireframe}
              onNodeChange={(patch, options) => {
                if (!selectedNode) return;
                if (selectedIds.length > 1) updateSelectedNodes(patch, options);
                else updateNode(selectedNode.id, patch, options);
              }}
              onNodeChangeEnd={endProjectHistoryGroup}
              onLayer={(action) => layerNode(null, action)}
              projectWireframes={project.wireframes}
              onCreateWireframeForLink={createWireframeForLink}
              onDuplicateWireframeForLink={duplicateWireframeForLink}
            />
          </aside>
        )}
      </main>

      {contextMenu ? (
        <ContextMenu
          state={contextMenu}
          targetName={contextTargetName}
          canPaste={true}
          onClose={() => setContextMenu(null)}
          onSelect={(id) => {
            setSelectedId(id);
            setContextMenu((current) => (current ? { ...current, targetId: id } : current));
          }}
          onCut={() => cutNode(contextActionTargetId)}
          onCopy={() => copyNode(contextActionTargetId)}
          onPaste={() => pasteNode(contextMenu.canvasX, contextMenu.canvasY)}
          onDelete={() => deleteNode(contextActionTargetId)}
          onLayer={(action) => layerNode(contextActionTargetId, action)}
        />
      ) : null}
      {wireframeContextMenu ? (
        <WireframeContextMenu
          state={wireframeContextMenu}
          canDelete={Boolean(wireframeContextMenu.wireframeId) && project.wireframes.length > 1}
          canDuplicate={Boolean(wireframeContextMenu.wireframeId)}
          canRename={Boolean(wireframeContextMenu.wireframeId)}
          onClose={() => setWireframeContextMenu(null)}
          onNew={addWireframe}
          onRename={() => wireframeContextMenu.wireframeId && beginRenameWireframe(wireframeContextMenu.wireframeId)}
          onDuplicate={() => wireframeContextMenu.wireframeId && duplicateWireframe(wireframeContextMenu.wireframeId)}
          onDelete={() => wireframeContextMenu.wireframeId && deleteWireframe(wireframeContextMenu.wireframeId)}
        />
      ) : null}
      {renameWireframe ? (
        <RenameWireframeDialog
          state={renameWireframe}
          wireframes={project.wireframes}
          onChange={(draft) => setRenameWireframe((current) => (current ? { ...current, draft } : current))}
          onCancel={() => setRenameWireframe(null)}
          onSave={() => {
            if (!commitRenameWireframe(renameWireframe.wireframeId, renameWireframe.draft)) return false;
            setRenameWireframe(null);
            return true;
          }}
        />
      ) : null}
      {paletteDrag?.moved ? (
        <div className="palette-drag-preview" style={{ left: paletteDrag.x, top: paletteDrag.y }}>
          {paletteDrag.label}
        </div>
      ) : null}
      {textEditor ? (
        <FloatingTextEditor
          editor={textEditor}
          node={activeWireframe?.nodes.find((node) => node.id === textEditor.nodeId) ?? null}
          onChange={(draft) => {
            setTextEditor((current) => {
              if (!current) return current;
              const nextEditor = { ...current, draft };
              textEditorRef.current = nextEditor;
              return nextEditor;
            });
          }}
          onFormatChange={(patch) => updateNode(textEditor.nodeId, patch, { groupKey: `text-format:${textEditor.nodeId}` })}
          onCommit={(draft) => closeTextEditor(true, draft)}
          onCancel={() => closeTextEditor(false)}
        />
      ) : null}
      {saveToast ? <div className="save-toast">{saveToast}</div> : null}
      {settingsOpen ? (
        <SettingsDialog
          appAppearance={appAppearance}
          onAppearanceChange={(appearance) => setAppAppearance((current) => ({ ...current, ...appearance }))}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
      {closePromptOpen ? (
        <UnsavedChangesDialog
          projectName={projectDisplayName}
          onCancel={() => setClosePromptOpen(false)}
          onDiscard={() => {
            setClosePromptOpen(false);
            void closeWindow();
          }}
          onSave={async () => {
            const saved = await saveProject(false);
            if (!saved) return;
            setClosePromptOpen(false);
            await closeWindow();
          }}
        />
      ) : null}
    </div>
  );
}

function CanvasItem({
  node,
  selected,
  primarySelected,
  linksActive,
  editingLocked,
  interactiveSelect,
  onSelect,
  onLinkClick,
  onInteractiveSelect,
  onInteractiveOptionSelect,
  onTextEdit,
  onMoveStart,
  onResizeStart,
}: {
  node: CanvasNode;
  selected: boolean;
  primarySelected: boolean;
  linksActive: boolean;
  editingLocked: boolean;
  interactiveSelect: InteractiveSelectState | null;
  onSelect: (additive: boolean) => void;
  onLinkClick: (key: string) => void;
  onInteractiveSelect: () => void;
  onInteractiveOptionSelect: (index: number) => void;
  onTextEdit: () => void;
  onMoveStart: (event: React.PointerEvent) => void;
  onResizeStart: (event: React.PointerEvent, handle: ResizeHandle) => void;
}) {
  const isArrow = node.kind === "arrow";
  const style = {
    left: node.x,
    top: node.y,
    width: node.width,
    height: node.height,
    "--node-fill": node.fill ?? "#ffffff",
    "--node-stroke": node.stroke ?? "#111827",
    "--node-text": node.textColor ?? "#111827",
    "--node-font-size": `${node.fontSize ?? 14}px`,
    opacity: (node.opacity ?? 100) / 100,
  } as React.CSSProperties;

  return (
    <div
      className={`canvas-node node-${node.kind}${selected ? " is-selected" : ""}${primarySelected ? " is-primary-selected" : ""}${node.locked ? " is-locked" : ""}${node.disabled ? " is-disabled" : ""}`}
      style={style}
      onPointerDown={(event) => {
        if (event.button !== 0) {
          event.preventDefault();
          return;
        }
        if (editingLocked) {
          if (linksActive && (event.target as HTMLElement).closest("[data-link-key]")) event.stopPropagation();
          return;
        }
        if (linksActive && selected && (event.target as HTMLElement).closest("[data-link-key]")) {
          event.stopPropagation();
          return;
        }
        onMoveStart(event);
      }}
      onClick={(event) => {
        event.stopPropagation();
        const linkTarget = (event.target as HTMLElement).closest<HTMLElement>("[data-link-key]");
        const accordionTarget = (event.target as HTMLElement).closest<HTMLElement>("[data-accordion-index]");
        if (editingLocked && node.kind === "accordion" && accordionTarget) {
          const nextIndex = Number(accordionTarget.dataset.accordionIndex);
          if (Number.isFinite(nextIndex)) onInteractiveOptionSelect(nextIndex);
          if (linksActive && linkTarget) onLinkClick(linkTarget.dataset.linkKey ?? "whole");
          return;
        }
        if (linksActive && linkTarget) {
          onLinkClick(linkTarget.dataset.linkKey ?? "whole");
          return;
        }
        if (linksActive && node.links?.whole) {
          onLinkClick("whole");
          return;
        }
        if (editingLocked && (node.kind === "dropdown" || node.kind === "comboBox")) {
          onInteractiveSelect();
          return;
        }
        if (editingLocked) return;
        if (event.shiftKey || event.metaKey || event.ctrlKey) return;
        onSelect(event.shiftKey || event.metaKey || event.ctrlKey);
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        if (editingLocked) return;
        onTextEdit();
      }}
    >
      <div className="canvas-node-clip">
        <NodeContent node={node} selected={selected} linksActive={linksActive} onLinkClick={onLinkClick} selectedOptionIndex={interactiveSelect?.selectedIndex ?? null} />
      </div>
      {interactiveSelect?.open && (node.kind === "dropdown" || node.kind === "comboBox") ? (
        <div className="interactive-select-menu" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
          {nodeOptions(node, ["First", "Second", "Third"]).map((option, index) => (
            <button key={`${option}-${index}`} type="button" className={textFormatClassName(node, index === interactiveSelect.selectedIndex ? "is-selected" : "")} onClick={() => onInteractiveOptionSelect(index)}>
              {renderInlineFormatting(option)}
            </button>
          ))}
        </div>
      ) : null}
      {primarySelected && !editingLocked && isArrow ? (
        <ArrowSelectionHandles node={node} onResizeStart={onResizeStart} />
      ) : primarySelected && !editingLocked ? (
        <>
          {(["nw", "n", "ne", "e", "se", "s", "sw", "w"] as ResizeHandle[]).map((handle) => (
            <span
              key={handle}
              className={`selection-handle handle-${handle}`}
              onPointerDown={(event) => {
                event.stopPropagation();
                if (event.button !== 0) return;
                onResizeStart(event, handle);
              }}
            />
          ))}
        </>
      ) : null}
    </div>
  );
}

function ArrowDrawPreview({ state }: { state: ArrowDrawState }) {
  const node = createArrowNodeFromPoints(
    { x: state.startX, y: state.startY },
    { x: state.currentX, y: state.currentY },
  );
  return (
    <div
      className="arrow-draw-preview"
      style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
    >
      <ArrowVisual node={node} />
    </div>
  );
}

function arrowResizeHandleForPoint(point: CanvasPoint): ResizeHandle {
  const vertical = point.y < 0.34 ? "n" : point.y > 0.66 ? "s" : "";
  const horizontal = point.x < 0.34 ? "w" : point.x > 0.66 ? "e" : "";
  const handle = `${vertical}${horizontal}` as ResizeHandle | "";
  return handle || "se";
}

function ArrowSelectionHandles({ node, onResizeStart }: { node: CanvasNode; onResizeStart: (event: React.PointerEvent, handle: ResizeHandle) => void }) {
  const start = normalizedArrowPoint(node.arrowStart, { x: 0.12, y: 0.2 });
  const end = normalizedArrowPoint(node.arrowEnd, { x: 0.88, y: 0.8 });
  const startPoint = arrowSvgPoint(node, start);
  const endPoint = arrowSvgPoint(node, end);
  const controlPoint = arrowControlPoint(node, startPoint, endPoint);

  return (
    <>
      {[
        { key: "start", point: startPoint, handle: arrowResizeHandleForPoint(start) },
        { key: "control", point: controlPoint, handle: null },
        { key: "end", point: endPoint, handle: arrowResizeHandleForPoint(end) },
      ].map((item) => (
        <span
          key={item.key}
          className={`selection-handle arrow-selection-handle arrow-handle-${item.key}`}
          style={{ left: item.point.x, top: item.point.y }}
          onPointerDown={item.handle ? (event) => {
            event.stopPropagation();
            if (event.button !== 0) return;
            onResizeStart(event, item.handle);
          } : undefined}
        />
      ))}
    </>
  );
}

type CheckboxListRow =
  | { kind: "checkbox"; checked: boolean; indeterminate: boolean; disabled: boolean; text: string }
  | { kind: "text"; text: string };

type AccordionSection = {
  title: string;
  optionIndex: number;
  children: { text: string; optionIndex: number; raw: string }[];
  raw: string;
};

function parseCheckboxListRow(row: string): CheckboxListRow {
  const disabledMatch = row.match(/^-\[( |x|X|-)\]\s*(.*)-$/);
  const enabledMatch = row.match(/^\[( |x|X|-)\]\s*(.*)$/);
  const match = disabledMatch ?? enabledMatch;
  if (!match) return { kind: "text", text: row };
  const marker = match[1].toLowerCase();
  return {
    kind: "checkbox",
    checked: marker === "x",
    indeterminate: marker === "-",
    disabled: Boolean(disabledMatch),
    text: match[2],
  };
}

function parseAccordionSections(node: CanvasNode): AccordionSection[] {
  const sections: AccordionSection[] = [];
  nodeOptions(node, ["Item One", "Item Two", "Item Three", "Item Four"]).forEach((raw, optionIndex) => {
    const childMatch = raw.match(/^\s*-\s*(.*)$/);
    if (childMatch && sections.length) {
      sections[sections.length - 1].children.push({ text: childMatch[1] || raw.trim(), optionIndex, raw });
      return;
    }
    sections.push({ title: raw, optionIndex, children: [], raw });
  });
  return sections;
}

function accordionOpenIndex(node: CanvasNode, selectedOptionIndex?: number | null) {
  const sections = parseAccordionSections(node);
  if (!sections.length) return -1;
  const requestedIndex = typeof selectedOptionIndex === "number" ? selectedOptionIndex : node.activeIndex;
  const matchingSection = sections.find((section) => section.optionIndex === requestedIndex);
  return matchingSection?.optionIndex ?? sections[0].optionIndex;
}

function alertTextParts(node: CanvasNode) {
  const lines = (node.text ?? "Alert\nAlert text goes here").split("\n");
  const title = lines[0]?.trim() || "Alert";
  const message = lines.slice(1).join("\n").trim() || "Alert text goes here";
  return { title, message };
}

function iconNameFromMarkdown(name: string) {
  return name
    .split("-")
    .filter((part) => part && part !== "solid")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

type InlineMarkdownOptions = {
  selected?: boolean;
  linksActive?: boolean;
  onLinkClick?: (key: string) => void;
  links?: boolean;
};

function renderInlineMarkdown(text: string, options: InlineMarkdownOptions = {}): React.ReactNode[] {
  const { selected = false, linksActive = false, onLinkClick, links = true } = options;
  const nodes: React.ReactNode[] = [];
  const pattern = /(\{color:([^}]+)\}([\s\S]*?)\{color\}|\[([^\]]+)\]|:([a-z0-9-]+):|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|_([^_\n]+)_|<u>([\s\S]*?)<\/u>|&([^&\n]+)&|~~([^~\n]+)~~|~([^~\n]+)~)/gi;
  let cursor = 0;
  let index = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined) continue;
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const key = `md-${index++}`;
    if (match[2] && match[3]) nodes.push(<span key={key} style={{ color: match[2] }}>{match[3]}</span>);
    else if (match[4]) {
      const linkKey = `text:${linkKeyFromLabel(match[4], "link")}`;
      if (links) {
        nodes.push(
          <span
            key={key}
            className="mock-link"
            data-link-key={linkKey}
            onPointerDown={(event) => {
              if (linksActive && selected && onLinkClick) event.stopPropagation();
            }}
          >
            {match[4]}
          </span>,
        );
      } else {
        nodes.push(match[0]);
      }
    }
    else if (match[5]) {
      const Icon = getLucideIcon(iconNameFromMarkdown(match[5]));
      nodes.push(<Icon key={key} className="inline-markdown-icon" size="1em" />);
    } else if (match[6]) nodes.push(<strong key={key}>{match[6]}</strong>);
    else if (match[7]) nodes.push(<em key={key}>{match[7]}</em>);
    else if (match[8]) nodes.push(<em key={key}>{match[8]}</em>);
    else if (match[9]) nodes.push(<u key={key}>{match[9]}</u>);
    else if (match[10]) nodes.push(<u key={key}>{match[10]}</u>);
    else if (match[11]) nodes.push(<s key={key}>{match[11]}</s>);
    else if (match[12]) nodes.push(<s key={key}>{match[12]}</s>);
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function renderInlineFormatting(text: string): React.ReactNode[] {
  return renderInlineMarkdown(text, { links: false });
}

function textFormatClassName(node: CanvasNode, ...classNames: Array<string | false | null | undefined>) {
  return [
    ...classNames,
    node.textBold ? "text-format-bold" : "",
    node.textItalic ? "text-format-italic" : "",
    node.textUnderline ? "text-format-underline" : "",
    node.textStrikethrough ? "text-format-strikethrough" : "",
  ].filter(Boolean).join(" ");
}

function NodeContent({
  node,
  selected = false,
  linksActive = false,
  onLinkClick,
  selectedOptionIndex,
}: {
  node: CanvasNode;
  selected?: boolean;
  linksActive?: boolean;
  onLinkClick?: (key: string) => void;
  selectedOptionIndex?: number | null;
}) {
  if (["button", "circleButton", "pointyButton", "multilineButton", "helpButton"].includes(node.kind)) return <ButtonVisual node={node} />;
  if (["text", "textLabel", "textTitle", "textSubtitle", "textParagraph", "link", "squigglyParagraph"].includes(node.kind)) return <TextVisual node={node} selected={selected} linksActive={linksActive} onLinkClick={onLinkClick} />;
  if (["checkbox", "checkboxList", "radioButton", "radioButtonGroup", "dropdown", "comboBox", "textbox", "textInput", "textArea", "searchBox", "searchBoxVoice", "colorPicker", "numericStepper", "onOffSwitch", "progressBar", "progressBarIndeterminate"].includes(node.kind)) {
    return <FormVisual node={node} selected={selected} linksActive={linksActive} onLinkClick={onLinkClick} selectedOptionIndex={selectedOptionIndex} />;
  }
  if (["tabs", "buttonBar", "tabBar", "vTabs", "linkBar", "breadcrumbs", "menuBar", "menu", "appBar", "playback", "toolbar"].includes(node.kind)) return <NavigationVisual node={node} selected={selected} linksActive={linksActive} onLinkClick={onLinkClick} />;
  if (["accordion", "alertBox", "alertBoxAndroid", "browser", "window", "modalScreen", "fieldSet", "popover", "tooltip", "callout"].includes(node.kind)) return <ContainerVisual node={node} selected={selected} linksActive={linksActive} onLinkClick={onLinkClick} selectedOptionIndex={selectedOptionIndex} />;
  if (["list", "listIcon", "treePane", "dataGrid", "calendar", "dateChooser", "datePicker", "timePicker", "siteMap", "streetMap", "tagCloud"].includes(node.kind)) return <DataVisual node={node} selected={selected} linksActive={linksActive} onLinkClick={onLinkClick} />;
  if (["chartBar", "chartColumn", "chartLine", "chartPie", "hScrollBar", "vScrollBar", "hSlider", "vSlider", "volumeSlider"].includes(node.kind)) return <ChartVisual node={node} />;
  if (["arrow", "hRule", "vRule", "hSplitter", "vSplitter", "redX", "scratchOut", "squigglyLine", "hCurlyBrace", "vCurlyBrace", "shape"].includes(node.kind)) return <MarkupVisual node={node} />;
  if (["icon", "iconText", "image", "webcam", "videoPlayer", "coverFlow", "smartphone", "iphone", "ipad", "iosKeyboard", "iosMenu", "iosPicker"].includes(node.kind)) return <MediaVisual node={node} />;
  if (node.kind === "stickyNote") return <div className={textFormatClassName(node, "editable-node-text")}>{renderInlineFormatting(node.text ?? "")}</div>;
  return null;
}

function ButtonVisual({ node }: { node: CanvasNode }) {
  const className = `button-node visual-button visual-button-${node.kind}`;
  return (
    <div className={className} data-link-key="whole">
      <span className={textFormatClassName(node)}>{renderInlineFormatting(node.text ?? "")}</span>
    </div>
  );
}

function TextVisual({ node, selected, linksActive, onLinkClick }: { node: CanvasNode; selected?: boolean; linksActive?: boolean; onLinkClick?: (key: string) => void }) {
  const text = node.text ?? "";
  const textAlign = node.textAlign ?? "left";
  const textClassName = [
    "editable-node-text",
    "text-visual",
    `text-visual-${node.kind}`,
    `text-align-${textAlign}`,
    node.textBold ? "text-format-bold" : "",
    node.textItalic ? "text-format-italic" : "",
    (node.textUnderline ?? node.kind === "link") ? "text-format-underline" : "",
    node.textStrikethrough ? "text-format-strikethrough" : "",
  ].filter(Boolean).join(" ");
  if (node.kind === "squigglyParagraph") {
    return (
      <div className="squiggle-paragraph">
        <span />
        <span />
        <span />
        <span />
      </div>
    );
  }
  if (node.kind === "textParagraph") {
    return (
      <div className={textClassName}>
        {text.split("\n").map((line, index) => (
          <span key={`${line}-${index}`} className="markdown-line">
            {renderInlineMarkdown(line, { selected, linksActive, onLinkClick })}
          </span>
        ))}
      </div>
    );
  }
  return <div className={textClassName} data-link-key="whole">{renderInlineMarkdown(text, { selected, linksActive, onLinkClick })}</div>;
}

function FormVisual({
  node,
  selected = false,
  linksActive = false,
  onLinkClick,
  selectedOptionIndex,
}: {
  node: CanvasNode;
  selected?: boolean;
  linksActive?: boolean;
  onLinkClick?: (key: string) => void;
  selectedOptionIndex?: number | null;
}) {
  if (node.kind === "checkbox") {
    return (
      <label className="checkbox-node">
        <span className={node.checked ? "mock-checkbox is-checked" : "mock-checkbox"} />
        <span className={textFormatClassName(node)}>{renderInlineFormatting(node.text ?? "")}</span>
      </label>
    );
  }
  if (node.kind === "radioButton") {
    return (
      <label className="radio-node">
        <span className={node.checked ? "radio-dot is-checked" : "radio-dot"} />
        <span className={textFormatClassName(node)}>{renderInlineFormatting(node.text ?? "")}</span>
      </label>
    );
  }
  if (node.kind === "checkboxList" || node.kind === "radioButtonGroup") {
    return (
      <div className="checkbox-list-node">
        {nodeOptions(node, ["Option one", "Option two", "Option three"]).map((option, index) => {
          const checkboxRow = parseCheckboxListRow(option);
          return (
            <div
              key={`${option}-${index}`}
              className={checkboxRow.kind === "checkbox" && checkboxRow.disabled ? "is-disabled" : ""}
              data-link-key={linkKeyForIndex("item", option, index)}
              onPointerDown={(event) => {
                if (linksActive && selected && onLinkClick) event.stopPropagation();
              }}
            >
              {node.kind === "radioButtonGroup" ? <span className={index === 0 ? "radio-dot is-checked" : "radio-dot"} /> : null}
              {node.kind === "checkboxList" && checkboxRow.kind === "checkbox" ? (
                <span className={`mock-checkbox${checkboxRow.checked ? " is-checked" : ""}${checkboxRow.indeterminate ? " is-indeterminate" : ""}`} />
              ) : null}
              <span className={textFormatClassName(node)}>{renderInlineFormatting(checkboxRow.text)}</span>
            </div>
          );
        })}
      </div>
    );
  }
  if (node.kind === "dropdown" || node.kind === "comboBox") {
    const options = nodeOptions(node);
    const storedIndex = typeof node.activeIndex === "number" ? clamp(node.activeIndex, 0, Math.max(0, options.length - 1)) : null;
    const selectedOption = typeof selectedOptionIndex === "number" ? options[selectedOptionIndex] : typeof storedIndex === "number" ? options[storedIndex] : null;
    return (
      <div className="dropdown-node">
        <span className={textFormatClassName(node)}>{renderInlineFormatting(selectedOption ?? node.text ?? "")}</span>
        <ChevronDown size={16} />
      </div>
    );
  }
  if (node.kind === "textbox" || node.kind === "textInput") return <div className={textFormatClassName(node, "textbox-node")}>{renderInlineFormatting(node.text || node.placeholder || "")}</div>;
  if (node.kind === "textArea") return <div className={textFormatClassName(node, "textarea-node")}>{renderInlineFormatting(node.text ?? "")}</div>;
  if (node.kind === "searchBox" || node.kind === "searchBoxVoice") {
    return (
      <div className="search-node">
        <Search size={14} />
        <span className={textFormatClassName(node)}>{renderInlineFormatting(node.text || node.placeholder || "")}</span>
        {node.kind === "searchBoxVoice" ? <span className="mic-dot" /> : null}
      </div>
    );
  }
  if (node.kind === "colorPicker") return <div className="color-picker-node"><span /></div>;
  if (node.kind === "numericStepper") return <div className="stepper-node"><strong>{node.value ?? 3}</strong><span>▲</span><span>▼</span></div>;
  if (node.kind === "onOffSwitch") return <div className={node.checked ? "switch-node is-on" : "switch-node"}><span /></div>;
  if (node.kind === "progressBar" || node.kind === "progressBarIndeterminate") {
    return <div className="progress-node"><span style={{ width: node.kind === "progressBarIndeterminate" ? "28%" : `${nodePercent(node)}%` }} /></div>;
  }
  return null;
}

function LinkedVisualItem({
  linkKey,
  selected,
  linksActive,
  onLinkClick,
  className,
  children,
}: {
  linkKey: string;
  selected?: boolean;
  linksActive?: boolean;
  onLinkClick?: (key: string) => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={className}
      data-link-key={linkKey}
      onPointerDown={(event) => {
        if (linksActive && selected && onLinkClick) event.stopPropagation();
      }}
    >
      {children}
    </span>
  );
}

function NavigationVisual({ node, selected, linksActive, onLinkClick }: { node: CanvasNode; selected?: boolean; linksActive?: boolean; onLinkClick?: (key: string) => void }) {
  if (isTabsNode(node)) return <TabsVisual node={node} selected={selected} linksActive={linksActive} onLinkClick={onLinkClick} />;
  if (node.kind === "buttonBar") {
    const items = nodeOptions(node);
    const activeIndex = items.length ? clamp(node.activeIndex ?? 0, 0, items.length - 1) : -1;
    return <Segmented items={items} activeIndex={activeIndex} compact selected={selected} linksActive={linksActive} onLinkClick={onLinkClick} textClassName={textFormatClassName(node)} />;
  }
  if (node.kind === "vTabs") return <div className="v-tabs-node">{nodeOptions(node).map((item, index) => <LinkedVisualItem key={`${item}-${index}`} linkKey={linkKeyForIndex("item", item, index)} selected={selected} linksActive={linksActive} onLinkClick={onLinkClick} className={textFormatClassName(node, index === (node.activeIndex ?? 0) ? "is-active" : "")}>{renderInlineFormatting(item)}</LinkedVisualItem>)}</div>;
  if (node.kind === "linkBar" || node.kind === "breadcrumbs") {
    return (
      <div className={`linkbar-node ${node.kind}`}>
        {nodeOptions(node).map((item, index) => (
          <LinkedVisualItem key={`${item}-${index}`} linkKey={linkKeyForIndex("item", item, index)} selected={selected} linksActive={linksActive} onLinkClick={onLinkClick} className={textFormatClassName(node)}>
            {node.kind === "breadcrumbs" ? <span className="breadcrumb-label">{renderInlineFormatting(item)}</span> : renderInlineFormatting(item)}
          </LinkedVisualItem>
        ))}
      </div>
    );
  }
  if (node.kind === "menuBar") return <div className="menu-bar-node">{nodeOptions(node).map((item, index) => <LinkedVisualItem key={`${item}-${index}`} linkKey={linkKeyForIndex("item", item, index)} selected={selected} linksActive={linksActive} onLinkClick={onLinkClick} className={textFormatClassName(node)}>{renderInlineFormatting(item)}</LinkedVisualItem>)}</div>;
  if (node.kind === "menu") return <div className="menu-node">{nodeOptions(node).map((item, index) => <LinkedVisualItem key={`${item}-${index}`} linkKey={linkKeyForIndex("item", item, index)} selected={selected} linksActive={linksActive} onLinkClick={onLinkClick} className={textFormatClassName(node)}>{renderInlineFormatting(item)}</LinkedVisualItem>)}</div>;
  if (node.kind === "appBar") return <AppBarVisual node={node} selected={selected} linksActive={linksActive} onLinkClick={onLinkClick} />;
  if (node.kind === "playback") return <div className="playback-node"><span>◀◀</span><span>▶</span><span>▶▶</span></div>;
  if (node.kind === "toolbar") return <div className="toolbar-node">{nodeOptions(node).map((item, index) => <LinkedVisualItem key={`${item}-${index}`} linkKey={linkKeyForIndex("item", item, index)} selected={selected} linksActive={linksActive} onLinkClick={onLinkClick} className={textFormatClassName(node)}>{renderInlineFormatting(item)}</LinkedVisualItem>)}</div>;
  return null;
}

function AppBarVisual({ node, selected, linksActive, onLinkClick }: { node: CanvasNode; selected?: boolean; linksActive?: boolean; onLinkClick?: (key: string) => void }) {
  const icons = nodeOptions(node, ["Menu", "ChevronDown", "MoreVertical"]);
  const iconAt = (index: number, fallback: string) => {
    const iconName = icons[index] || fallback;
    const Icon = getLucideIcon(iconName);
    return (
      <span
        className="app-bar-icon"
        data-link-key={linkKeyForIndex("item", iconName, index)}
        title={iconName}
        onPointerDown={(event) => {
          if (linksActive && selected && onLinkClick) event.stopPropagation();
        }}
      >
        <Icon size="1.35em" strokeWidth={2.4} />
      </span>
    );
  };

  return (
    <div className="app-bar-node">
      {iconAt(0, "Menu")}
      <span className={textFormatClassName(node, "app-bar-title")}>{renderInlineFormatting(node.text ?? "Heading")}</span>
      {iconAt(1, "ChevronDown")}
      <span className="app-bar-spacer" />
      {iconAt(2, "MoreVertical")}
    </div>
  );
}

function TabsVisual({ node, selected, linksActive, onLinkClick }: { node: CanvasNode; selected?: boolean; linksActive?: boolean; onLinkClick?: (key: string) => void }) {
  const items = nodeOptions(node, ["One", "Two", "Three", "Four"]);
  const activeIndex = clamp(node.activeIndex ?? -1, -1, items.length - 1);
  const placement = node.tabPlacement ?? "top";
  const alignment = node.tabAlignment ?? "left";
  return (
    <div className={`tabs-node tabs-${placement} tabs-align-${alignment}${node.showBorder === false ? " no-border" : " has-border"}${node.showScrollbar ? " has-scrollbar" : ""}${node.textBold ? " tabs-text-bold" : ""}${node.textItalic ? " tabs-text-italic" : ""}${node.textUnderline ? " tabs-text-underline" : ""}${node.textStrikethrough ? " tabs-text-strikethrough" : ""}`}>
      <div className="tabs-strip">
        {items.map((item, index) => (
          <LinkedVisualItem
            key={`${item}-${index}`}
            linkKey={linkKeyForIndex("item", item, index)}
            selected={selected}
            linksActive={linksActive}
            onLinkClick={onLinkClick}
            className={`tabs-tab${index === activeIndex ? " is-active" : ""}`}
          >
            {renderInlineFormatting(item)}
          </LinkedVisualItem>
        ))}
      </div>
      <div className="tabs-panel">
        {node.showScrollbar ? <span className="tabs-scrollbar" /> : null}
      </div>
    </div>
  );
}

function ContainerVisual({
  node,
  selected,
  linksActive,
  onLinkClick,
  selectedOptionIndex,
}: {
  node: CanvasNode;
  selected?: boolean;
  linksActive?: boolean;
  onLinkClick?: (key: string) => void;
  selectedOptionIndex?: number | null;
}) {
  if (node.kind === "accordion") return <AccordionVisual node={node} selected={selected} linksActive={linksActive} onLinkClick={onLinkClick} selectedOptionIndex={selectedOptionIndex} />;
  if (node.kind === "alertBox" || node.kind === "alertBoxAndroid") return <AlertVisual node={node} selected={selected} linksActive={linksActive} onLinkClick={onLinkClick} />;
  if (node.kind === "browser" || node.kind === "window") return <ChromeFrame node={node} />;
  if (node.kind === "modalScreen") return <div className="modal-screen-node" />;
  if (node.kind === "fieldSet") return <fieldset className="fieldset-node"><legend className={textFormatClassName(node)}>{renderInlineFormatting(node.text ?? "")}</legend></fieldset>;
  if (node.kind === "popover") return <div className={textFormatClassName(node, "popover-node")}><span />{renderInlineFormatting(node.text ?? "")}</div>;
  if (node.kind === "tooltip") return <div className={textFormatClassName(node, "tooltip-node")}>{renderInlineFormatting(node.text ?? "")}</div>;
  if (node.kind === "callout") return <div className={textFormatClassName(node, "callout-node")}>{renderInlineFormatting(node.text ?? "")}</div>;
  return null;
}

function AccordionVisual({
  node,
  selected,
  linksActive,
  onLinkClick,
  selectedOptionIndex,
}: {
  node: CanvasNode;
  selected?: boolean;
  linksActive?: boolean;
  onLinkClick?: (key: string) => void;
  selectedOptionIndex?: number | null;
}) {
  const sections = parseAccordionSections(node);
  const openIndex = accordionOpenIndex(node, selectedOptionIndex);
  const className = [
    "accordion-node",
    node.showScrollbar ? "has-scrollbar" : "",
    node.textBold ? "accordion-text-bold" : "",
    node.textItalic ? "accordion-text-italic" : "",
    node.textUnderline ? "accordion-text-underline" : "",
    node.textStrikethrough ? "accordion-text-strikethrough" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={className}>
      {sections.map((section) => {
        const isOpen = section.optionIndex === openIndex;
        return (
          <div key={`${section.raw}-${section.optionIndex}`} className={isOpen ? "accordion-section is-open" : "accordion-section"}>
            <span
              className="accordion-header"
              data-accordion-index={section.optionIndex}
              data-link-key={linkKeyForIndex("item", section.raw, section.optionIndex)}
              onPointerDown={(event) => {
                if (linksActive && selected && onLinkClick) event.stopPropagation();
              }}
            >
              {renderInlineFormatting(section.title)}
            </span>
            {isOpen ? (
              <div className="accordion-panel">
                {section.children.map((child) => (
                  <span
                    key={`${child.raw}-${child.optionIndex}`}
                    className="accordion-child"
                    data-link-key={linkKeyForIndex("item", child.raw, child.optionIndex)}
                    onPointerDown={(event) => {
                      if (linksActive && selected && onLinkClick) event.stopPropagation();
                    }}
                  >
                    {renderInlineFormatting(child.text)}
                  </span>
                ))}
                {node.showScrollbar ? <span className="accordion-scrollbar" /> : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function AlertVisual({
  node,
  selected,
  linksActive,
  onLinkClick,
}: {
  node: CanvasNode;
  selected?: boolean;
  linksActive?: boolean;
  onLinkClick?: (key: string) => void;
}) {
  const { title, message } = alertTextParts(node);
  const buttons = nodeOptions(node, ["No", "Yes"]);
  const align = node.textAlign ?? (node.kind === "alertBox" ? "center" : "left");
  const className = [
    "alert-node",
    node.kind === "alertBoxAndroid" ? "alert-android" : "alert-standard",
    node.showBorder === false ? "no-border" : "",
    `text-align-${align}`,
    node.textBold ? "alert-text-bold" : "",
    node.textItalic ? "alert-text-italic" : "",
    node.textUnderline ? "alert-text-underline" : "",
    node.textStrikethrough ? "alert-text-strikethrough" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={className}>
      <div className="alert-content">
        <strong>{renderInlineFormatting(title)}</strong>
        <p>{renderInlineFormatting(message)}</p>
      </div>
      <div className="alert-buttons">
        {buttons.map((item, index) => (
          <span
            key={`${item}-${index}`}
            data-link-key={linkKeyForIndex("item", item, index)}
            onPointerDown={(event) => {
              if (linksActive && selected && onLinkClick) event.stopPropagation();
            }}
          >
            {renderInlineFormatting(item || `Button ${index + 1}`)}
          </span>
        ))}
      </div>
    </div>
  );
}

function ChromeFrame({ node }: { node: CanvasNode }) {
  return (
    <div className={`chrome-frame-node${node.showBorder === false ? " no-border" : ""}${node.showScrollbar ? " has-scrollbar" : ""}`}>
      <div><span /><span /><span /><strong className={textFormatClassName(node)}>{renderInlineFormatting((node.text ?? "").split("\n")[0] ?? "")}</strong></div>
      <section>
        {node.showScrollbar ? <i aria-hidden="true" /> : null}
      </section>
    </div>
  );
}

function DataVisual({ node, selected, linksActive, onLinkClick }: { node: CanvasNode; selected?: boolean; linksActive?: boolean; onLinkClick?: (key: string) => void }) {
  if (node.kind === "treePane") return <TreePaneVisual node={node} selected={selected} linksActive={linksActive} onLinkClick={onLinkClick} />;
  if (node.kind === "list" || node.kind === "listIcon") {
    return (
      <div className={textFormatClassName(node, "list-node", node.kind)}>
        {nodeOptions(node).map((item, index) => (
          <LinkedVisualItem key={`${item}-${index}`} linkKey={linkKeyForIndex("item", item, index)} selected={selected} linksActive={linksActive} onLinkClick={onLinkClick}>
            {node.kind === "listIcon" ? "◆ " : ""}
            {renderInlineFormatting(item)}
          </LinkedVisualItem>
        ))}
      </div>
    );
  }
  if (node.kind === "dataGrid") return <DataGridVisual node={node} />;
  if (node.kind === "calendar" || node.kind === "datePicker") return <CalendarVisual node={node} />;
  if (node.kind === "dateChooser") return <div className={textFormatClassName(node, "date-chooser-node")}>{renderInlineFormatting(node.text ?? "")}<span>▣</span></div>;
  if (node.kind === "timePicker") return <div className="time-picker-node"><span className={textFormatClassName(node)}>{renderInlineFormatting(node.text ?? "")}</span><i /></div>;
  if (node.kind === "siteMap") return <SiteMapVisual node={node} />;
  if (node.kind === "streetMap") return <div className="street-map-node"><span /><span /><span /></div>;
  if (node.kind === "tagCloud") return <div className="tag-cloud-node">{(node.text ?? "").split(/\s+/).map((word, index) => <span key={`${word}-${index}`} className={textFormatClassName(node)}>{renderInlineFormatting(word)}</span>)}</div>;
  return null;
}

function TreePaneVisual({ node, selected, linksActive, onLinkClick }: { node: CanvasNode; selected?: boolean; linksActive?: boolean; onLinkClick?: (key: string) => void }) {
  return (
    <div className="tree-pane-node">
      {parseTreePaneRows(node).map((row) => (
        <span
          key={row.key}
          className="tree-pane-row"
          data-link-key={row.key}
          style={{ "--tree-depth": row.depth } as React.CSSProperties}
          onPointerDown={(event) => {
            if (linksActive && selected && onLinkClick) event.stopPropagation();
          }}
        >
          <TreePaneIcon icon={row.icon} />
          <span className={textFormatClassName(node, "tree-pane-label")}>{renderInlineFormatting(row.label)}</span>
        </span>
      ))}
    </div>
  );
}

function TreePaneIcon({ icon }: { icon: TreePaneRow["icon"] }) {
  if (icon === "none") return <span className="tree-pane-icon tree-pane-icon-none" aria-hidden="true" />;
  const iconNames: Record<Exclude<TreePaneRow["icon"], "none">, string> = {
    "folder-closed": "Folder",
    "folder-open": "FolderOpen",
    plus: "SquarePlus",
    minus: "SquareMinus",
    checked: "SquareCheckBig",
    empty: "Square",
    "chevron-right": "ChevronRight",
    "chevron-down": "ChevronDown",
    file: "FileText",
  };
  const Icon = getLucideIcon(iconNames[icon]);
  return (
    <span className="tree-pane-icon" aria-hidden="true">
      <Icon size="1.12em" strokeWidth={2.6} />
    </span>
  );
}

function DataGridVisual({ node }: { node: CanvasNode }) {
  const grid = parseDataGrid(node);
  const blankRows = createDataGridBlankRows(node, grid);
  return (
    <table className={textFormatClassName(node, "data-grid-node")}>
      <colgroup>
        {grid.columns.map((column, index) => (
          <col key={`${column.text}-${index}`} style={{ width: column.width }} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {grid.columns.map((column, index) => (
            <th key={`${column.text}-${index}`} style={{ textAlign: column.align }}>
              <DataGridCell cell={column.text} />
              {column.sort ? (
                <span
                  className={`data-grid-sort ${column.sort === "▲" ? "is-ascending" : column.sort === "▼" ? "is-descending" : "is-both"}`}
                  aria-label={column.sort === "▲" ? "ascending" : column.sort === "▼" ? "descending" : "ascending and descending"}
                />
              ) : null}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {grid.rows.map((row, rowIndex) => (
          <tr key={`${row.join("|")}-${rowIndex}`}>
            {grid.columns.map((column, index) => (
              <td key={index} className={parseDataGridControl((row[index] ?? "").trim()) ? "is-control-cell" : ""} style={{ textAlign: column.align }}>
                <DataGridCell cell={row[index] ?? ""} />
              </td>
            ))}
          </tr>
        ))}
        {blankRows.map((row) => (
          <tr key={row}>
            {grid.columns.map((column, index) => (
              <td key={index} style={{ textAlign: column.align }}>
                <span className="data-grid-cell-line" />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type ParsedDataGridColumn = {
  text: string;
  align?: "left" | "center" | "right";
  sort?: string;
  width?: string;
};

function parseDataGrid(node: CanvasNode): { columns: ParsedDataGridColumn[]; rows: string[][] } {
  const source = node.text?.trim()
    ? node.text
    : [
        (node.columns?.length ? node.columns : ["Name", "Role", "Status"]).join(", "),
        ...(node.rows?.length ? node.rows.map((row) => row.split("|").join(", ")) : ["Alice, PM, Active", "Ben, Design, Review"]),
      ].join("\n");
  const lines = source.split(/\r?\n/).map((line) => line.trimEnd()).filter((line) => line.trim());
  const specMatch = lines.at(-1)?.trim().match(/^\{(.+)\}$/);
  const columnSpecs = specMatch ? parseDataGridColumnSpecs(specMatch[1]) : [];
  const dataLines = specMatch ? lines.slice(0, -1) : lines;
  const [headerLine = "Column 1, Column 2", ...bodyLines] = dataLines;
  const headerCells = parseDelimitedRow(headerLine);
  const columns = headerCells.map((cell, index) => {
    const { text, sort } = parseHeaderCell(cell);
    const spec = columnSpecs[index];
    return {
      text,
      sort,
      align: spec?.align,
      width: spec?.width,
    };
  });
  const rows = bodyLines.map((line) => parseDelimitedRow(line));
  return { columns, rows };
}

function parseDelimitedRow(line: string): string[] {
  const delimiter = line.includes("\t") ? "\t" : ",";
  const cells: string[] = [];
  let current = "";
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\\") {
      const nextChar = line[index + 1];
      if (nextChar === delimiter) {
        current += nextChar;
        index += 1;
        continue;
      }
      current += char;
      continue;
    }
    if (char === delimiter) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function parseDataGridColumnSpecs(spec: string): Array<{ align?: "left" | "center" | "right"; width?: string }> {
  const parts = parseDelimitedRow(spec);
  const numericParts = parts.map((part) => Number(part.match(/\d+/)?.[0] ?? 1));
  const positiveTotal = numericParts.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
  const flexibleColumnCount = numericParts.filter((value) => value === 0).length;
  const flexibleColumnWidth = flexibleColumnCount ? Math.min(18, 100 / numericParts.length) : 0;
  const weightedColumnWidth = Math.max(0, 100 - flexibleColumnWidth * flexibleColumnCount);
  return parts.map((part, index) => {
    const alignCode = part.match(/[LCR]\s*$/i)?.[0].trim().toUpperCase();
    const numericValue = numericParts[index];
    const width = numericValue === 0
      ? `${flexibleColumnWidth}%`
      : positiveTotal
        ? `${(numericValue / positiveTotal) * weightedColumnWidth}%`
        : `${100 / numericParts.length}%`;
    return {
      align: alignCode === "R" ? "right" : alignCode === "C" ? "center" : alignCode === "L" ? "left" : undefined,
      width,
    };
  });
}

function createDataGridBlankRows(node: CanvasNode, grid: { columns: ParsedDataGridColumn[]; rows: string[][] }) {
  const fontSize = node.fontSize ?? 14;
  const lineHeight = fontSize * 1.2;
  const cellVerticalPadding = 8;
  const rowHeight = Math.ceil(lineHeight + cellVerticalPadding);
  const headerHeight = Math.ceil(Math.max(...grid.columns.map((column) => dataGridLineCount(column.text)), 1) * lineHeight + cellVerticalPadding);
  const bodyHeight = grid.rows.reduce((height, row) => {
    const rowLines = Math.max(...grid.columns.map((_, index) => dataGridLineCount(row[index] ?? "")), 1);
    return height + Math.ceil(rowLines * lineHeight + cellVerticalPadding);
  }, 0);
  const borderAllowance = 4;
  const extraHeight = node.height - headerHeight - bodyHeight - borderAllowance;
  return Array.from({ length: Math.max(0, Math.floor(extraHeight / rowHeight) - 1) }, (_, index) => `blank-${index}`);
}

function dataGridLineCount(cell: string) {
  return Math.max(1, cell.split(/\\r/g).length);
}

function parseHeaderCell(cell: string): { text: string; sort?: string } {
  const match = cell.match(/\s+(\^v|\^|v)$/);
  if (!match) return { text: cell };
  const sortToken = match[1];
  return {
    text: cell.slice(0, -sortToken.length).trim(),
    sort: sortToken === "^" ? "▲" : sortToken === "v" ? "▼" : "▲▼",
  };
}

function DataGridCell({ cell }: { cell: string }) {
  const trimmed = cell.trim();
  const control = parseDataGridControl(trimmed);
  if (control) return <span className={`data-grid-control ${control.kind} ${control.state}`} />;
  const link = trimmed.match(/^\[([^\]]+)\](?:\([^)]+\))?$/);
  if (link) return <span className="data-grid-link">{renderInlineFormatting(link[1].trim())}</span>;
  return (
    <>
      {cell.split(/\\r/g).map((part, index) => (
        <span key={`${part}-${index}`} className="data-grid-cell-line">
          {renderInlineFormatting(part)}
        </span>
      ))}
    </>
  );
}

function parseDataGridControl(cell: string): { kind: "checkbox" | "radio"; state: "empty" | "checked" | "mixed" } | null {
  if (/^\[\s*\]$/.test(cell) || cell === "[]") return { kind: "checkbox", state: "empty" };
  if (/^\[(x|v|o|\*|X|V|O)\]$/.test(cell)) return { kind: "checkbox", state: "checked" };
  if (/^\[(-|=)\]$/.test(cell)) return { kind: "checkbox", state: "mixed" };
  if (/^\(\s*\)$/.test(cell) || cell === "()") return { kind: "radio", state: "empty" };
  if (/^\((x|v|o|\*|X|V|O)\)$/.test(cell)) return { kind: "radio", state: "checked" };
  if (/^\((-|=)\)$/.test(cell)) return { kind: "radio", state: "mixed" };
  return null;
}

function CalendarVisual({ node }: { node: CanvasNode }) {
  return <div className="calendar-node"><strong className={textFormatClassName(node)}>{renderInlineFormatting(node.text ?? "")}</strong>{Array.from({ length: 35 }, (_, index) => <span key={index}>{index > 4 ? index - 4 : ""}</span>)}</div>;
}

function SiteMapVisual({ node }: { node: CanvasNode }) {
  const items = nodeOptions(node);
  return <div className="site-map-node"><strong className={textFormatClassName(node)}>{renderInlineFormatting(items[0] ?? "")}</strong>{items.slice(1).map((item) => <span key={item} className={textFormatClassName(node)}>{renderInlineFormatting(item)}</span>)}</div>;
}

function ChartVisual({ node }: { node: CanvasNode }) {
  if (node.kind === "chartPie") return <div className="chart-pie-node" />;
  if (node.kind === "chartLine") return <div className="chart-line-node"><span /><span /><span /></div>;
  if (node.kind === "chartBar" || node.kind === "chartColumn") return <div className={`chart-bars-node ${node.kind}`}>{[58, 82, 42, 68].map((value) => <span key={value} style={{ "--bar-value": `${value}%` } as React.CSSProperties} />)}</div>;
  if (node.kind === "hScrollBar" || node.kind === "vScrollBar") return <div className={`scrollbar-node ${node.kind}`}><span className="scrollbar-button scrollbar-button-start" /><span className="scrollbar-track" /><span className="scrollbar-thumb" /><span className="scrollbar-button scrollbar-button-end" /></div>;
  if (node.kind === "hSlider" || node.kind === "vSlider" || node.kind === "volumeSlider") return <div className={`slider-node ${node.kind}`}><span /><i style={{ "--slider-value": `${nodePercent(node)}%` } as React.CSSProperties} /></div>;
  return null;
}

function normalizedArrowPoint(point: CanvasPoint | undefined, fallback: CanvasPoint): CanvasPoint {
  return {
    x: clamp(point?.x ?? fallback.x, 0, 1),
    y: clamp(point?.y ?? fallback.y, 0, 1),
  };
}

function arrowSvgPoint(node: CanvasNode, point: CanvasPoint): CanvasPoint {
  const inset = Math.min(18, Math.max(8, Math.min(node.width, node.height) * 0.22));
  const drawableWidth = Math.max(1, node.width - inset * 2);
  const drawableHeight = Math.max(1, node.height - inset * 2);
  return {
    x: inset + point.x * drawableWidth,
    y: inset + point.y * drawableHeight,
  };
}

function arrowControlPoint(node: CanvasNode, start: CanvasPoint, end: CanvasPoint): CanvasPoint {
  if (node.arrowControl) return arrowSvgPoint(node, normalizedArrowPoint(node.arrowControl, { x: 0.5, y: 0.5 }));
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const bend = Math.min(100, Math.max(28, length * 0.34));
  return {
    x: midX - (dy / length) * bend,
    y: midY + (dx / length) * bend,
  };
}

function pointOnArrow(node: CanvasNode, start: CanvasPoint, control: CanvasPoint, end: CanvasPoint, t: number): CanvasPoint {
  if (node.arrowLine === "straight") {
    return {
      x: start.x + (end.x - start.x) * t,
      y: start.y + (end.y - start.y) * t,
    };
  }
  const oneMinusT = 1 - t;
  return {
    x: oneMinusT * oneMinusT * start.x + 2 * oneMinusT * t * control.x + t * t * end.x,
    y: oneMinusT * oneMinusT * start.y + 2 * oneMinusT * t * control.y + t * t * end.y,
  };
}

function arrowStrokeDashArray(node: CanvasNode) {
  if (node.arrowStrokeStyle === "dashed") return "12 10";
  if (node.arrowStrokeStyle === "dotted") return "1 9";
  return undefined;
}

function ArrowVisual({ node }: { node: CanvasNode }) {
  const start = arrowSvgPoint(node, normalizedArrowPoint(node.arrowStart, { x: 0.12, y: 0.2 }));
  const end = arrowSvgPoint(node, normalizedArrowPoint(node.arrowEnd, { x: 0.88, y: 0.8 }));
  const control = arrowControlPoint(node, start, end);
  const isStraight = node.arrowLine === "straight";
  const path = isStraight ? `M ${start.x} ${start.y} L ${end.x} ${end.y}` : `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`;
  const labelT = clamp((node.arrowLabelPosition ?? 50) / 100, 0, 1);
  const labelPoint = pointOnArrow(node, start, control, end, labelT);
  const markerId = `arrow-head-${node.id.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const label = node.text?.trim();
  const dashArray = arrowStrokeDashArray(node);
  const labelClassName = [
    "arrow-label",
    node.textBold ? "text-format-bold" : "",
    node.textItalic ? "text-format-italic" : "",
    node.textUnderline ? "text-format-underline" : "",
    node.textStrikethrough ? "text-format-strikethrough" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className="arrow-node">
      <svg viewBox={`0 0 ${node.width} ${node.height}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <marker id={markerId} markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto-start-reverse" markerUnits="strokeWidth">
            <path d="M 1 1 L 11 6 L 1 11 Z" fill="var(--node-stroke)" />
          </marker>
        </defs>
        <path className="arrow-shadow" d={path} strokeDasharray={dashArray} />
        <path
          className="arrow-line"
          d={path}
          strokeDasharray={dashArray}
          markerStart={node.arrowHeadStart ? `url(#${markerId})` : undefined}
          markerEnd={node.arrowHeadEnd !== false ? `url(#${markerId})` : undefined}
        />
      </svg>
      {label ? (
        <div
          className={labelClassName}
          style={{ left: labelPoint.x, top: labelPoint.y }}
        >
          {renderInlineFormatting(label)}
        </div>
      ) : null}
    </div>
  );
}

function MarkupVisual({ node }: { node: CanvasNode }) {
  if (node.kind === "arrow") return <ArrowVisual node={node} />;
  if (node.kind === "hRule" || node.kind === "vRule") return <div className={`rule-node ${node.kind}`} />;
  if (node.kind === "hSplitter" || node.kind === "vSplitter") return <div className={`splitter-node ${node.kind}`}><span /></div>;
  if (node.kind === "redX") return <div className="red-x-node"><span /><span /></div>;
  if (node.kind === "scratchOut") return <div className="scratch-node">{Array.from({ length: 8 }, (_, index) => <span key={index} />)}</div>;
  if (node.kind === "squigglyLine") return <div className="squiggly-line-node" />;
  if (node.kind === "hCurlyBrace" || node.kind === "vCurlyBrace") return <div className={`curly-node ${node.kind}`}><span>{node.kind === "hCurlyBrace" ? "︷" : "}"}</span><small className={textFormatClassName(node)}>{renderInlineFormatting(node.text ?? "")}</small></div>;
  if (node.kind === "shape") return <div className="shape-node" />;
  return null;
}

function iconPaint(node: CanvasNode) {
  return {
    fill: node.fill ?? "none",
    stroke: node.stroke ?? node.fill ?? node.textColor ?? "#111827",
  };
}

function MediaVisual({ node }: { node: CanvasNode }) {
  if (node.kind === "icon") {
    const Icon = getLucideIcon(node.icon);
    const paint = iconPaint(node);
    return <Icon className="icon-node" data-link-key="whole" color={paint.stroke} fill={paint.fill} size={Math.max(12, Math.min(node.width, node.height) - 14)} />;
  }
  if (node.kind === "iconText") {
    const Icon = getLucideIcon(node.icon);
    const paint = iconPaint(node);
    return <div className="icon-text-node" data-link-key="whole"><Icon color={paint.stroke} fill={paint.fill} size={Math.max(22, Math.min(node.width, node.height) / 2)} /><span className={textFormatClassName(node)}>{renderInlineFormatting(node.text ?? "")}</span></div>;
  }
  if (node.kind === "image") {
    if (node.imageDataUrl) {
      return <img className="image-node image-node-bitmap" src={node.imageDataUrl} alt={node.name || "Image"} draggable={false} />;
    }
    return <div className="image-node"><span /><span /></div>;
  }
  if (node.kind === "webcam") return <div className="webcam-node"><span /><i /></div>;
  if (node.kind === "videoPlayer") return <div className="video-node"><section /><footer><span /><b /></footer></div>;
  if (node.kind === "coverFlow") return <div className="coverflow-node"><span /><span /><span /></div>;
  if (node.kind === "smartphone" || node.kind === "iphone" || node.kind === "ipad") return <DeviceVisual node={node} />;
  if (node.kind === "iosKeyboard") return <div className="ios-keyboard-node">{Array.from({ length: 30 }, (_, index) => <span key={index}>{index === 26 ? "space" : ""}</span>)}</div>;
  if (node.kind === "iosMenu") return <div className="ios-menu-node">{nodeOptions(node).map((item) => <span key={item} className={textFormatClassName(node)}>{renderInlineFormatting(item)}</span>)}</div>;
  if (node.kind === "iosPicker") return <div className="ios-picker-node">{nodeOptions(node).map((item) => <span key={item} className={textFormatClassName(node)}>{renderInlineFormatting(item)}</span>)}</div>;
  return null;
}

function DeviceVisual({ node }: { node: CanvasNode }) {
  return <div className={`device-node ${node.kind}`}><span /><section /></div>;
}

function Segmented({
  items,
  activeIndex,
  compact = false,
  selected,
  linksActive,
  onLinkClick,
  textClassName,
}: {
  items: string[];
  activeIndex: number;
  compact?: boolean;
  selected?: boolean;
  linksActive?: boolean;
  onLinkClick?: (key: string) => void;
  textClassName?: string;
}) {
  return (
    <div className={compact ? "segmented compact" : "segmented"}>
      {items.map((item, index) => (
        <span
          key={`${item}-${index}`}
          className={[index === activeIndex ? "is-active" : "", textClassName].filter(Boolean).join(" ")}
          data-link-key={compact ? linkKeyForIndex("item", item, index) : undefined}
          onPointerDown={(event) => {
            if (compact && linksActive && selected && onLinkClick) event.stopPropagation();
          }}
        >
          {renderInlineFormatting(item)}
        </span>
      ))}
    </div>
  );
}

function FloatingTextEditor({
  editor,
  node,
  onChange,
  onFormatChange,
  onCommit,
  onCancel,
}: {
  editor: TextEditorState;
  node: CanvasNode | null;
  onChange: (draft: string) => void;
  onFormatChange: (patch: Partial<CanvasNode>) => void;
  onCommit: (draft?: string) => void;
  onCancel: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const undoStackRef = useRef<TextEditSnapshot[]>([]);
  const redoStackRef = useRef<TextEditSnapshot[]>([]);
  const lineCount = Math.max(1, editor.draft.split("\n").length);
  const toolbarHeight = node ? 48 : 0;
  const naturalHeight = editor.multiline ? 56 + lineCount * 28 : editor.height;
  const baseEditorHeight = editor.multiline ? clamp(naturalHeight, editor.height, editor.maxHeight) : Math.max(editor.height, 58);
  const editorHeight = Math.max(baseEditorHeight + toolbarHeight, node ? 128 : baseEditorHeight);
  const textUnderline = node ? node.textUnderline ?? node.kind === "link" : false;
  const toggleFormat = (patch: Partial<CanvasNode>) => {
    onFormatChange(patch);
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  };
  const setTextareaSelection = (snapshot: Pick<TextEditSnapshot, "selectionStart" | "selectionEnd">) => {
    window.requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
      rememberTextInputSelection(textarea);
    });
  };
  const applyTextChange = (snapshot: TextEditSnapshot) => {
    onChange(snapshot.value);
    setTextareaSelection(snapshot);
  };
  const pushUndoSnapshot = (snapshot: TextEditSnapshot) => {
    const previous = undoStackRef.current.at(-1);
    if (
      previous &&
      previous.value === snapshot.value &&
      previous.selectionStart === snapshot.selectionStart &&
      previous.selectionEnd === snapshot.selectionEnd
    ) {
      return;
    }
    undoStackRef.current = [...undoStackRef.current, snapshot].slice(-100);
    redoStackRef.current = [];
  };
  const selectedText = (textarea: HTMLTextAreaElement) => {
    const { value, selectionStart, selectionEnd } = textInputSnapshot(textarea);
    return value.slice(selectionStart, selectionEnd);
  };
  const writeSelectionToClipboard = (textarea: HTMLTextAreaElement) => {
    const text = selectedText(textarea);
    if (!text) return;
    document.execCommand("copy");
    void navigator.clipboard?.writeText(text).catch(() => undefined);
  };
  const pasteFromClipboard = (textarea: HTMLTextAreaElement) => {
    void (async () => {
      try {
        const text = await navigator.clipboard?.readText();
        if (typeof text === "string") {
          applyTextChange(replaceTextInputSelection(textarea, text));
          return;
        }
      } catch {
        // Fall back to the webview's native paste command when direct clipboard access is unavailable.
      }
      document.execCommand("paste");
      rememberTextInputSelection(textarea);
    })();
  };
  const isPlainTextEditKey = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return false;
    return event.key.length === 1 || ["Backspace", "Delete", "Enter"].includes(event.key);
  };

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    undoStackRef.current = [];
    redoStackRef.current = [];
    textarea.focus();
    textarea.select();
    rememberTextInputSelection(textarea);
  }, [editor.nodeId, editor.field]);

  return (
    <div
      className={editor.multiline ? "floating-text-editor is-multiline" : "floating-text-editor"}
      style={{ left: editor.x, top: editor.y, width: editor.width, height: editorHeight, maxHeight: editor.maxHeight + toolbarHeight }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {node ? (
        <div className="floating-text-toolbar">
          <div className="toolbar-group">
            <button type="button" className={node.textBold ? "is-active" : ""} title="Bold" onMouseDown={(event) => event.preventDefault()} onClick={() => toggleFormat({ textBold: !node.textBold })}><Bold size={16} /></button>
            <button type="button" className={node.textItalic ? "is-active" : ""} title="Italic" onMouseDown={(event) => event.preventDefault()} onClick={() => toggleFormat({ textItalic: !node.textItalic })}><Italic size={16} /></button>
            <button type="button" className={textUnderline ? "is-active" : ""} title="Underline" onMouseDown={(event) => event.preventDefault()} onClick={() => toggleFormat({ textUnderline: !textUnderline })}><Underline size={16} /></button>
            <button type="button" className={node.textStrikethrough ? "is-active" : ""} title="Strikethrough" onMouseDown={(event) => event.preventDefault()} onClick={() => toggleFormat({ textStrikethrough: !node.textStrikethrough })}><Strikethrough size={16} /></button>
          </div>
          <GeometryNumberInput
            className="floating-font-size-field"
            min={8}
            max={72}
            title="Font size"
            value={node.fontSize ?? 14}
            onChange={(value) => onFormatChange({ fontSize: value })}
          />
        </div>
      ) : null}
      <textarea
        ref={textareaRef}
        value={editor.draft}
        rows={editor.multiline ? 6 : 1}
        onChange={(event) => {
          onChange(event.target.value);
          rememberTextInputSelection(event.currentTarget);
        }}
        onFocus={(event) => rememberTextInputSelection(event.currentTarget)}
        onSelect={(event) => rememberTextInputSelection(event.currentTarget)}
        onKeyUp={(event) => rememberTextInputSelection(event.currentTarget)}
        onMouseUp={(event) => rememberTextInputSelection(event.currentTarget)}
        onBlur={(event) => {
          const nextTarget = event.relatedTarget;
          if (nextTarget && event.currentTarget.closest(".floating-text-editor")?.contains(nextTarget)) return;
          onCommit(event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          const textarea = event.currentTarget;
          const modifier = event.metaKey || event.ctrlKey;
          const key = event.key.toLowerCase();
          if (modifier && key === "a") {
            event.preventDefault();
            event.stopPropagation();
            textarea.select();
            rememberTextInputSelection(textarea);
            return;
          }
          if (modifier && ["c", "x", "v", "z"].includes(key)) {
            event.preventDefault();
            event.stopPropagation();
            if (key === "c") {
              writeSelectionToClipboard(textarea);
              return;
            }
            if (key === "x") {
              pushUndoSnapshot(textInputSnapshot(textarea));
              writeSelectionToClipboard(textarea);
              applyTextChange(replaceTextInputSelection(textarea, ""));
              return;
            }
            if (key === "v") {
              pushUndoSnapshot(textInputSnapshot(textarea));
              pasteFromClipboard(textarea);
              return;
            }
            if (key === "z") {
              if (event.shiftKey) {
                const next = redoStackRef.current.pop();
                if (!next) return;
                undoStackRef.current = [...undoStackRef.current, textInputSnapshot(textarea)].slice(-100);
                applyTextChange(next);
                return;
              }
              const previous = undoStackRef.current.pop();
              if (!previous) return;
              redoStackRef.current = [...redoStackRef.current, textInputSnapshot(textarea)].slice(-100);
              applyTextChange(previous);
              return;
            }
          }
          if (isPlainTextEditKey(event)) pushUndoSnapshot(textInputSnapshot(textarea));
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
          if (!editor.multiline && event.key === "Enter") {
            event.preventDefault();
            onCommit(textarea.value);
          }
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            onCommit(textarea.value);
          }
        }}
      />
      <span className="floating-text-count">{editor.draft.length}</span>
    </div>
  );
}

function LinkTargetSelect({
  value,
  wireframes,
  onChange,
}: {
  value: CanvasLink | undefined;
  wireframes: Wireframe[];
  onChange: (link: CanvasLink | undefined | "new-wireframe" | "duplicate-wireframe") => void;
}) {
  const selectValue = value ? (value.kind === "wireframe" ? `wireframe:${value.wireframeId}` : value.kind) : "";
  return (
    <select
      value={selectValue}
      onChange={(event) => {
        const nextValue = event.target.value;
        if (!nextValue) onChange(undefined);
        else if (nextValue === "url") {
          const url = window.prompt("Link to a Web Address", value?.kind === "url" ? value.url : "https://");
          onChange(url ? { kind: "url", url } : value);
        } else if (nextValue === "new-wireframe") onChange("new-wireframe");
        else if (nextValue === "duplicate-wireframe") onChange("duplicate-wireframe");
        else if (nextValue === "back") onChange({ kind: "back" });
        else if (nextValue.startsWith("wireframe:")) onChange({ kind: "wireframe", wireframeId: nextValue.slice("wireframe:".length) });
      }}
    >
      <option value="">No Link</option>
      {wireframes.map((wireframe) => (
        <option key={wireframe.id} value={`wireframe:${wireframe.id}`}>
          {wireframe.name}
        </option>
      ))}
      <option value="url">Link to a Web Address...</option>
      <option value="new-wireframe">Link to New Wireframe</option>
      <option value="duplicate-wireframe">Link to a Duplicate of This Wireframe</option>
      <option value="back">Go Back</option>
    </select>
  );
}

function ButtonBarProperties({
  node,
  onChange,
}: {
  node: CanvasNode;
  onChange: (property: keyof CanvasNode, patch: Partial<CanvasNode>) => void;
}) {
  const options = nodeOptions(node);
  const activeIndex = options.length ? clamp(node.activeIndex ?? 0, 0, options.length - 1) : -1;

  return (
    <section className="property-section">
      <h3>Selection</h3>
      <select
        value={String(activeIndex)}
        disabled={!options.length}
        onChange={(event) => onChange("activeIndex", { activeIndex: Number(event.target.value) })}
      >
        {!options.length ? <option value="-1">No Items</option> : null}
        {options.map((item, index) => (
          <option key={`${item}-${index}`} value={index}>
            {item || `Item ${index + 1}`}
          </option>
        ))}
      </select>
    </section>
  );
}

function TabsProperties({
  node,
  onChange,
  onChangeEnd,
}: {
  node: CanvasNode;
  onChange: (property: keyof CanvasNode, patch: Partial<CanvasNode>) => void;
  onChangeEnd: () => void;
}) {
  const options = nodeOptions(node, ["One", "Two", "Three", "Four"]);
  const activeIndex = clamp(node.activeIndex ?? -1, -1, options.length - 1);
  const tabPlacement = node.tabPlacement ?? "top";
  const tabAlignment = node.tabAlignment ?? "left";

  return (
    <>
      <section className="property-section">
        <h3>Scrollbar</h3>
        <label className="icon-toggle-setting" title="Show scrollbar">
          <input
            type="checkbox"
            checked={Boolean(node.showScrollbar)}
            onChange={(event) => onChange("showScrollbar", { showScrollbar: event.target.checked })}
          />
          <span aria-hidden="true" />
        </label>
      </section>
      <section className="property-section">
        <h3>Selection</h3>
        <select
          value={String(activeIndex)}
          onChange={(event) => onChange("activeIndex", { activeIndex: Number(event.target.value) })}
        >
          <option value="-1">None</option>
          {options.map((item, index) => (
            <option key={`${item}-${index}`} value={index}>
              {item || `Tab ${index + 1}`}
            </option>
          ))}
        </select>
      </section>
      <section className="property-section">
        <h3>Tabs Position</h3>
        <div className="tabs-position-controls">
          <div className="toolbar-group">
            <button type="button" className={tabPlacement === "top" ? "is-active" : ""} title="Tabs on top" onClick={() => onChange("tabPlacement", { tabPlacement: "top" })}>
              <PanelTop size={18} />
            </button>
            <button type="button" className={tabPlacement === "bottom" ? "is-active" : ""} title="Tabs on bottom" onClick={() => onChange("tabPlacement", { tabPlacement: "bottom" })}>
              <PanelBottom size={18} />
            </button>
          </div>
          <div className="toolbar-group">
            <button type="button" className={tabAlignment === "left" ? "is-active" : ""} title="Align tabs left" onClick={() => onChange("tabAlignment", { tabAlignment: "left" })}>
              <AlignLeft size={18} />
            </button>
            <button type="button" className={tabAlignment === "center" ? "is-active" : ""} title="Align tabs center" onClick={() => onChange("tabAlignment", { tabAlignment: "center" })}>
              <AlignCenter size={18} />
            </button>
            <button type="button" className={tabAlignment === "right" ? "is-active" : ""} title="Align tabs right" onClick={() => onChange("tabAlignment", { tabAlignment: "right" })}>
              <AlignRight size={18} />
            </button>
          </div>
        </div>
      </section>
      <section className="property-section">
        <h3>Text</h3>
        <div className="text-toolbar tabs-text-toolbar">
          <div className="toolbar-group">
            <button type="button" className={node.textBold ? "is-active" : ""} title="Bold" onClick={() => onChange("textBold", { textBold: !node.textBold })}><Bold size={18} /></button>
            <button type="button" className={node.textItalic ? "is-active" : ""} title="Italic" onClick={() => onChange("textItalic", { textItalic: !node.textItalic })}><Italic size={18} /></button>
            <button type="button" className={node.textUnderline ? "is-active" : ""} title="Underline" onClick={() => onChange("textUnderline", { textUnderline: !node.textUnderline })}><Underline size={18} /></button>
            <button type="button" className={node.textStrikethrough ? "is-active" : ""} title="Strikethrough" onClick={() => onChange("textStrikethrough", { textStrikethrough: !node.textStrikethrough })}><Strikethrough size={18} /></button>
          </div>
          <GeometryNumberInput
            className="font-size-field"
            min={8}
            max={72}
            value={node.fontSize ?? 14}
            onBlur={onChangeEnd}
            onChange={(value) => onChange("fontSize", { fontSize: value })}
          />
        </div>
      </section>
    </>
  );
}

function AccordionProperties({
  node,
  onChange,
  onChangeEnd,
}: {
  node: CanvasNode;
  onChange: (property: keyof CanvasNode, patch: Partial<CanvasNode>) => void;
  onChangeEnd: () => void;
}) {
  const sections = parseAccordionSections(node);
  const activeIndex = accordionOpenIndex(node);
  const textUnderline = Boolean(node.textUnderline);
  const textStrikethrough = Boolean(node.textStrikethrough);

  return (
    <>
      <section className="property-section">
        <h3>Scrollbar</h3>
        <label className="icon-toggle-setting" title="Show scrollbar">
          <input
            type="checkbox"
            checked={Boolean(node.showScrollbar)}
            onChange={(event) => onChange("showScrollbar", { showScrollbar: event.target.checked })}
          />
          <span aria-hidden="true" />
        </label>
      </section>
      <section className="property-section">
        <h3>Selection</h3>
        <select
          value={String(activeIndex)}
          disabled={!sections.length}
          onChange={(event) => onChange("activeIndex", { activeIndex: Number(event.target.value) })}
        >
          {!sections.length ? <option value="-1">No Items</option> : null}
          {sections.map((section) => (
            <option key={`${section.raw}-${section.optionIndex}`} value={section.optionIndex}>
              {section.title || `Item ${section.optionIndex + 1}`}
            </option>
          ))}
        </select>
      </section>
      <section className="property-section">
        <h3>Text</h3>
        <div className="text-toolbar">
          <div className="toolbar-group">
            <button type="button" className={node.textBold ? "is-active" : ""} title="Bold" onClick={() => onChange("textBold", { textBold: !node.textBold })}><Bold size={18} /></button>
            <button type="button" className={node.textItalic ? "is-active" : ""} title="Italic" onClick={() => onChange("textItalic", { textItalic: !node.textItalic })}><Italic size={18} /></button>
            <button type="button" className={textUnderline ? "is-active" : ""} title="Underline" onClick={() => onChange("textUnderline", { textUnderline: !textUnderline })}><Underline size={18} /></button>
            <button type="button" className={textStrikethrough ? "is-active" : ""} title="Strikethrough" onClick={() => onChange("textStrikethrough", { textStrikethrough: !textStrikethrough })}><Strikethrough size={18} /></button>
          </div>
          <GeometryNumberInput
            className="font-size-field"
            min={8}
            max={72}
            value={node.fontSize ?? 14}
            onBlur={onChangeEnd}
            onChange={(value) => onChange("fontSize", { fontSize: value })}
          />
        </div>
      </section>
    </>
  );
}

function AlertProperties({
  node,
  onChange,
  onChangeEnd,
}: {
  node: CanvasNode;
  onChange: (property: keyof CanvasNode, patch: Partial<CanvasNode>) => void;
  onChangeEnd: () => void;
}) {
  const textAlign = node.textAlign ?? (node.kind === "alertBox" ? "center" : "left");
  const textUnderline = Boolean(node.textUnderline);
  const textStrikethrough = Boolean(node.textStrikethrough);

  return (
    <>
      <section className="property-section">
        <h3>Border</h3>
        <label className="toggle-setting">
          <input
            type="checkbox"
            checked={node.showBorder !== false}
            onChange={(event) => onChange("showBorder", { showBorder: event.target.checked })}
          />
          <span>Show Border</span>
        </label>
      </section>
      <section className="property-section">
        <h3>Text</h3>
        <div className="text-toolbar">
          <div className="toolbar-group">
            <button type="button" className={node.textBold ? "is-active" : ""} title="Bold" onClick={() => onChange("textBold", { textBold: !node.textBold })}><Bold size={18} /></button>
            <button type="button" className={node.textItalic ? "is-active" : ""} title="Italic" onClick={() => onChange("textItalic", { textItalic: !node.textItalic })}><Italic size={18} /></button>
            <button type="button" className={textUnderline ? "is-active" : ""} title="Underline" onClick={() => onChange("textUnderline", { textUnderline: !textUnderline })}><Underline size={18} /></button>
            <button type="button" className={textStrikethrough ? "is-active" : ""} title="Strikethrough" onClick={() => onChange("textStrikethrough", { textStrikethrough: !textStrikethrough })}><Strikethrough size={18} /></button>
          </div>
          <div className="toolbar-group">
            <button type="button" className={textAlign === "left" ? "is-active" : ""} title="Align left" onClick={() => onChange("textAlign", { textAlign: "left" })}><AlignLeft size={18} /></button>
            <button type="button" className={textAlign === "center" ? "is-active" : ""} title="Align center" onClick={() => onChange("textAlign", { textAlign: "center" })}><AlignCenter size={18} /></button>
            <button type="button" className={textAlign === "right" ? "is-active" : ""} title="Align right" onClick={() => onChange("textAlign", { textAlign: "right" })}><AlignRight size={18} /></button>
          </div>
          <GeometryNumberInput
            className="font-size-field"
            min={8}
            max={72}
            value={node.fontSize ?? 14}
            onBlur={onChangeEnd}
            onChange={(value) => onChange("fontSize", { fontSize: value })}
          />
        </div>
      </section>
    </>
  );
}

function AppBarProperties({
  node,
  onChange,
  onChangeEnd,
}: {
  node: CanvasNode;
  onChange: (property: keyof CanvasNode, patch: Partial<CanvasNode>) => void;
  onChangeEnd: () => void;
}) {
  const icons = nodeOptions(node, ["Menu", "ChevronDown", "MoreVertical"]);
  const updateIcon = (index: number, icon: string) => {
    const nextIcons = [...icons];
    nextIcons[index] = icon;
    onChange("options", { options: nextIcons });
  };

  return (
    <>
      <label className="property-swatch-row">
        Color
        <input type="color" value={node.fill ?? "#d9d9d9"} onBlur={onChangeEnd} onChange={(event) => onChange("fill", { fill: event.target.value })} />
      </label>
      <section className="property-section appbar-icons-section">
        <h3>Icons</h3>
        <div className="appbar-icon-list">
          {icons.map((icon, index) => (
            <IconPicker key={`${index}-${icon}`} value={icon || "Circle"} onChange={(name) => updateIcon(index, name)} />
          ))}
        </div>
      </section>
    </>
  );
}

function AppBarTextProperties({
  node,
  onChange,
  onChangeEnd,
}: {
  node: CanvasNode;
  onChange: (property: keyof CanvasNode, patch: Partial<CanvasNode>) => void;
  onChangeEnd: () => void;
}) {
  const textUnderline = Boolean(node.textUnderline);
  const textStrikethrough = Boolean(node.textStrikethrough);

  return (
    <>
      <section className="property-section">
        <h3>Text</h3>
        <div className="text-toolbar arrow-text-toolbar">
          <div className="toolbar-group">
            <button type="button" className={node.textBold ? "is-active" : ""} title="Bold" onClick={() => onChange("textBold", { textBold: !node.textBold })}><Bold size={18} /></button>
            <button type="button" className={node.textItalic ? "is-active" : ""} title="Italic" onClick={() => onChange("textItalic", { textItalic: !node.textItalic })}><Italic size={18} /></button>
            <button type="button" className={textUnderline ? "is-active" : ""} title="Underline" onClick={() => onChange("textUnderline", { textUnderline: !textUnderline })}><Underline size={18} /></button>
            <button type="button" className={textStrikethrough ? "is-active" : ""} title="Strikethrough" onClick={() => onChange("textStrikethrough", { textStrikethrough: !textStrikethrough })}><Strikethrough size={18} /></button>
          </div>
          <GeometryNumberInput
            className="font-size-field"
            min={8}
            max={72}
            value={node.fontSize ?? 16}
            onBlur={onChangeEnd}
            onChange={(value) => onChange("fontSize", { fontSize: value })}
          />
        </div>
      </section>
    </>
  );
}

function ArrowProperties({
  node,
  onChange,
  onChangeEnd,
}: {
  node: CanvasNode;
  onChange: (property: keyof CanvasNode, patch: Partial<CanvasNode>) => void;
  onChangeEnd: () => void;
}) {
  const line = node.arrowLine ?? "curved";
  const strokeStyle = node.arrowStrokeStyle ?? "solid";

  return (
    <>
      <section className="property-section arrow-properties">
        <h3>Arrow</h3>
        <div className="arrow-options-grid">
          <span>Options</span>
          <div className="toolbar-group arrow-toolbar-group">
            <button type="button" className={line === "curved" ? "is-active" : ""} title="Curved" onClick={() => onChange("arrowLine", { arrowLine: "curved" })}>
              <CornerUpRight size={18} />
            </button>
            <button type="button" className={line === "straight" ? "is-active" : ""} title="Straight" onClick={() => onChange("arrowLine", { arrowLine: "straight" })}>
              <span className="straight-line-icon" />
            </button>
          </div>
          <div className="toolbar-group arrow-toolbar-group">
            <button type="button" className={node.arrowHeadStart ? "is-active" : ""} title="Arrowhead at start" onClick={() => onChange("arrowHeadStart", { arrowHeadStart: !node.arrowHeadStart })}>
              <ArrowLeft size={19} />
            </button>
            <button type="button" className={node.arrowHeadEnd !== false ? "is-active" : ""} title="Arrowhead at end" onClick={() => onChange("arrowHeadEnd", { arrowHeadEnd: node.arrowHeadEnd === false })}>
              <ArrowRight size={19} />
            </button>
          </div>
        </div>
        <label className="property-range-row">
          Label Position
          <input
            type="range"
            min={0}
            max={100}
            value={node.arrowLabelPosition ?? 50}
            onBlur={onChangeEnd}
            onChange={(event) => onChange("arrowLabelPosition", { arrowLabelPosition: Number(event.target.value) })}
          />
        </label>
      </section>
      <label className="property-swatch-row">
        Color
        <input type="color" value={node.stroke ?? "#000000"} onBlur={onChangeEnd} onChange={(event) => onChange("stroke", { stroke: event.target.value })} />
      </label>
      <label className="property-swatch-row">
        Label Color
        <input type="color" value={node.textColor ?? "#111827"} onBlur={onChangeEnd} onChange={(event) => onChange("textColor", { textColor: event.target.value })} />
      </label>
      <label className="property-range-row">
        Opacity
        <input
          type="range"
          min={0}
          max={100}
          value={node.opacity ?? 100}
          onBlur={onChangeEnd}
          onChange={(event) => onChange("opacity", { opacity: Number(event.target.value) })}
        />
      </label>
      <section className="property-section">
        <h3>Stroke</h3>
        <div className="toolbar-group arrow-stroke-toolbar">
          <button type="button" className={strokeStyle === "solid" ? "is-active" : ""} title="Solid" onClick={() => onChange("arrowStrokeStyle", { arrowStrokeStyle: "solid" })}>
            <span className="stroke-icon stroke-solid" />
          </button>
          <button type="button" className={strokeStyle === "dashed" ? "is-active" : ""} title="Dashed" onClick={() => onChange("arrowStrokeStyle", { arrowStrokeStyle: "dashed" })}>
            <span className="stroke-icon stroke-dashed" />
          </button>
          <button type="button" className={strokeStyle === "dotted" ? "is-active" : ""} title="Dotted" onClick={() => onChange("arrowStrokeStyle", { arrowStrokeStyle: "dotted" })}>
            <span className="stroke-icon stroke-dotted" />
          </button>
        </div>
      </section>
      <section className="property-section">
        <h3>Text</h3>
        <div className="text-toolbar arrow-text-toolbar">
          <div className="toolbar-group">
            <button type="button" className={node.textBold ? "is-active" : ""} title="Bold" onClick={() => onChange("textBold", { textBold: !node.textBold })}><Bold size={18} /></button>
            <button type="button" className={node.textItalic ? "is-active" : ""} title="Italic" onClick={() => onChange("textItalic", { textItalic: !node.textItalic })}><Italic size={18} /></button>
            <button type="button" className={node.textUnderline ? "is-active" : ""} title="Underline" onClick={() => onChange("textUnderline", { textUnderline: !node.textUnderline })}><Underline size={18} /></button>
            <button type="button" className={node.textStrikethrough ? "is-active" : ""} title="Strikethrough" onClick={() => onChange("textStrikethrough", { textStrikethrough: !node.textStrikethrough })}><Strikethrough size={18} /></button>
          </div>
          <GeometryNumberInput
            className="font-size-field"
            min={8}
            max={72}
            value={node.fontSize ?? 14}
            onBlur={onChangeEnd}
            onChange={(value) => onChange("fontSize", { fontSize: value })}
          />
        </div>
      </section>
    </>
  );
}

function GeometryNumberInput({
  value,
  onChange,
  onBlur = () => {},
  min,
  max,
  title,
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  onBlur?: () => void;
  min?: number;
  max?: number;
  title?: string;
  className?: string;
}) {
  const clampValue = (nextValue: number) => {
    if (!Number.isFinite(nextValue)) return value;
    return clamp(nextValue, min ?? Number.NEGATIVE_INFINITY, max ?? Number.POSITIVE_INFINITY);
  };
  const stepValue = (delta: number) => {
    onChange(clampValue(value + delta));
    onBlur();
  };

  return (
    <div className={["geometry-number-field", className].filter(Boolean).join(" ")}>
      <input
        className="geometry-number-input"
        type="number"
        min={min}
        max={max}
        title={title}
        value={value}
        onBlur={onBlur}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="geometry-number-buttons">
        <button
          type="button"
          tabIndex={-1}
          title="Increase"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => stepValue(1)}
        >
          <ChevronUp size={14} strokeWidth={2.7} />
        </button>
        <button
          type="button"
          tabIndex={-1}
          title="Decrease"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => stepValue(-1)}
        >
          <ChevronDown size={14} strokeWidth={2.7} />
        </button>
      </span>
    </div>
  );
}

function PropertiesPane({
  selectedNode,
  selectedNodes,
  selectedCount,
  activeWireframe,
  onWireframeChange,
  onNodeChange,
  onNodeChangeEnd,
  onLayer,
  projectWireframes,
  onCreateWireframeForLink,
  onDuplicateWireframeForLink,
}: {
  selectedNode: CanvasNode | null;
  selectedNodes: CanvasNode[];
  selectedCount: number;
  activeWireframe: Wireframe | undefined;
  onWireframeChange: (patch: Partial<Wireframe>) => void;
  onNodeChange: (patch: Partial<CanvasNode>, options?: ProjectChangeOptions) => void;
  onNodeChangeEnd: () => void;
  onLayer: (action: LayerAction) => void;
  projectWireframes: Wireframe[];
  onCreateWireframeForLink: () => string;
  onDuplicateWireframeForLink: () => string;
}) {
  if (!selectedNode) {
    const background = wireframeBackground(activeWireframe);
    const showGrid = wireframeShowGrid(activeWireframe);
    return (
      <div className="properties canvas-properties">
        <div className="properties-title">
          <h2>Canvas</h2>
        </div>
        <section className="property-section">
          <h3>Background</h3>
          <div className="segmented-property">
            <button
              type="button"
              className={background === "white" ? "is-active" : ""}
              onClick={() => onWireframeChange({ background: "white" })}
            >
              White
            </button>
            <button
              type="button"
              className={background === "black" ? "is-active" : ""}
              onClick={() => onWireframeChange({ background: "black" })}
            >
              Black
            </button>
          </div>
        </section>
        <section className="property-section">
          <h3>Grid</h3>
          <label className="toggle-setting">
            <input
              type="checkbox"
              checked={showGrid}
              onChange={(event) => onWireframeChange({ showGrid: event.target.checked })}
            />
            <span>Show grid lines</span>
          </label>
        </section>
      </div>
    );
  }

  const selectionNodes = selectedNodes.length ? selectedNodes : [selectedNode];
  const isMultiSelection = selectionNodes.length > 1;
  const selectionKey = selectionNodes.map((node) => node.id).join(",");
  const groupedChange = (property: keyof CanvasNode, patch: Partial<CanvasNode>) => {
    onNodeChange(patch, { groupKey: `property:${selectionKey}:${property}` });
  };
  const {
    isTextNode,
    isTabs,
    isAccordion,
    isAlert,
    isAppBar,
    isButtonBar,
    isDataGrid,
    isArrow,
    showGenericState,
    showGenericBorder,
    showGenericScrollbar,
    showGenericOpacity,
  } = isMultiSelection ? commonNodePropertyCapabilities(selectionNodes) : nodePropertyCapabilities(selectedNode);
  const hasTextStyleControls = nodesShareTextStyleControls(selectionNodes);
  const showGenericPaint = nodesShareGenericPaintControls(selectionNodes);
  const showTextColor = nodesShareTextColorControl(selectionNodes);
  const showChecked = allNodesHaveProperty(selectionNodes, "checked");
  const showValue = !isMultiSelection && allNodesHaveProperty(selectionNodes, "value");
  const showPlaceholder = !isMultiSelection && allNodesHaveProperty(selectionNodes, "placeholder");
  const showTableTextAreas = !isMultiSelection && !isDataGrid;
  const showSpecializedProperties = !isMultiSelection;
  const textAlign = selectedNode.textAlign ?? "left";
  const textUnderline = selectedNode.textUnderline ?? selectedNode.kind === "link";
  const textStrikethrough = Boolean(selectedNode.textStrikethrough);
  const genericState = selectedNode.disabled ? "disabled" : "normal";
  const selectedNodeOptions = nodeOptions(selectedNode);
  const canChooseActiveOption = !isMultiSelection && hasInteractiveOptions(selectedNode) && selectedNodeOptions.length > 0;
  const selectedActiveIndex = canChooseActiveOption ? clamp(selectedNode.activeIndex ?? 0, 0, selectedNodeOptions.length - 1) : -1;
  const linkableElements = linkableElementsForNode(selectedNode);
  const changeLink = (key: string, link: CanvasLink | undefined | "new-wireframe" | "duplicate-wireframe") => {
    const nextLink =
      link === "new-wireframe"
        ? { kind: "wireframe" as const, wireframeId: onCreateWireframeForLink() }
        : link === "duplicate-wireframe"
          ? { kind: "wireframe" as const, wireframeId: onDuplicateWireframeForLink() }
          : link;
    const nextLinks = { ...(selectedNode.links ?? {}) };
    if (nextLink) nextLinks[key] = nextLink;
    else delete nextLinks[key];
    onNodeChange({ links: Object.keys(nextLinks).length ? nextLinks : undefined });
  };

  return (
    <div className="properties">
      <div className="properties-title">
        <h2>{selectedCount > 1 ? `${selectedCount} selected` : displayNodeName(selectedNode)}</h2>
        <ChevronDown size={20} />
      </div>
      <section className="property-section">
        <div className="property-row">
          <strong>Position</strong>
          <label>
            <GeometryNumberInput value={selectedNode.x} onBlur={onNodeChangeEnd} onChange={(value) => groupedChange("x", { x: value })} />
            <span>X</span>
          </label>
          <label>
            <GeometryNumberInput value={selectedNode.y} onBlur={onNodeChangeEnd} onChange={(value) => groupedChange("y", { y: value })} />
            <span>Y</span>
          </label>
        </div>
        <div className="property-row">
          <strong>Size</strong>
          <label>
            <GeometryNumberInput value={selectedNode.width} onBlur={onNodeChangeEnd} onChange={(value) => groupedChange("width", { width: value })} />
            <span>Width</span>
          </label>
          <label>
            <GeometryNumberInput value={selectedNode.height} onBlur={onNodeChangeEnd} onChange={(value) => groupedChange("height", { height: value })} />
            <span>Height</span>
          </label>
        </div>
      </section>
      <section className="property-section">
        <h3>Layering</h3>
        <div className="layer-button-groups">
          <button type="button" onClick={() => onLayer("back")} title="Send to back"><SendToBack size={18} /><span>Back</span></button>
          <button type="button" onClick={() => onLayer("front")} title="Bring to front"><BringToFront size={18} /><span>Front</span></button>
          <button type="button" onClick={() => onLayer("backward")} title="Send backward"><SendToBack size={18} /><span>Backward</span></button>
          <button type="button" onClick={() => onLayer("forward")} title="Bring forward"><BringToFront size={18} /><span>Forward</span></button>
        </div>
      </section>
      {showGenericBorder ? (
        <section className="property-section">
          <h3>Border</h3>
          <label className="toggle-setting">
            <input
              type="checkbox"
              checked={selectedNode.showBorder !== false}
              onChange={(event) => groupedChange("showBorder", { showBorder: event.target.checked })}
            />
            <span>Show Border</span>
          </label>
        </section>
      ) : null}
      {showGenericScrollbar ? (
        <section className="property-section">
          <h3>Scrollbar</h3>
          <label className="icon-toggle-setting" title="Show scrollbar">
            <input
              type="checkbox"
              checked={Boolean(selectedNode.showScrollbar)}
              onChange={(event) => groupedChange("showScrollbar", { showScrollbar: event.target.checked })}
            />
            <span aria-hidden="true" />
          </label>
        </section>
      ) : null}
      {showSpecializedProperties && isTabs ? (
        <>
          <section className="property-section">
            <h3>Border</h3>
            <label className="toggle-setting">
              <input
                type="checkbox"
                checked={selectedNode.showBorder !== false}
                onChange={(event) => groupedChange("showBorder", { showBorder: event.target.checked })}
              />
              <span>Show Border</span>
            </label>
          </section>
          <label className="property-swatch-row">
            Color
            <input type="color" value={selectedNode.fill ?? "#ffffff"} onBlur={onNodeChangeEnd} onChange={(event) => groupedChange("fill", { fill: event.target.value })} />
          </label>
          <label className="property-range-row">
            Opacity
            <input
              type="range"
              min={0}
              max={100}
              value={selectedNode.opacity ?? 100}
              onBlur={onNodeChangeEnd}
              onChange={(event) => groupedChange("opacity", { opacity: Number(event.target.value) })}
            />
          </label>
        </>
      ) : showSpecializedProperties && isAppBar ? (
        <AppBarProperties node={selectedNode} onChange={groupedChange} onChangeEnd={onNodeChangeEnd} />
      ) : showSpecializedProperties && isArrow ? (
        <ArrowProperties node={selectedNode} onChange={groupedChange} onChangeEnd={onNodeChangeEnd} />
      ) : showGenericPaint ? (
        <>
          <label>
            Fill
            <input type="color" value={selectedNode.fill ?? "#ffffff"} onBlur={onNodeChangeEnd} onChange={(event) => groupedChange("fill", { fill: event.target.value })} />
          </label>
          <label>
            Stroke
            <input type="color" value={selectedNode.stroke ?? "#111827"} onBlur={onNodeChangeEnd} onChange={(event) => groupedChange("stroke", { stroke: event.target.value })} />
          </label>
        </>
      ) : null}
      {showTextColor ? (
        <label className="property-swatch-row">
          Text Color
          <input type="color" value={selectedNode.textColor ?? "#111827"} onBlur={onNodeChangeEnd} onChange={(event) => groupedChange("textColor", { textColor: event.target.value })} />
        </label>
      ) : null}
      {showGenericOpacity ? (
        <label className="property-range-row">
          Opacity
          <input
            type="range"
            min={0}
            max={100}
            value={selectedNode.opacity ?? 100}
            onBlur={onNodeChangeEnd}
            onChange={(event) => groupedChange("opacity", { opacity: Number(event.target.value) })}
          />
        </label>
      ) : null}
      {!isMultiSelection && linkableElements.length ? (
        <section className="property-section">
          <div className="property-section-heading">
            <h3>Links</h3>
            <button type="button">Hide</button>
          </div>
          <div className="links-editor">
            {linkableElements.map((item) => (
              <div key={item.key} className="link-row">
                <span title={item.label}>{item.label}</span>
                <LinkTargetSelect
                  value={selectedNode.links?.[item.key]}
                  wireframes={projectWireframes}
                  onChange={(link) => changeLink(item.key, link)}
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {showSpecializedProperties && isButtonBar ? (
        <ButtonBarProperties node={selectedNode} onChange={groupedChange} />
      ) : null}
      {showSpecializedProperties && isTabs ? (
        <TabsProperties node={selectedNode} onChange={groupedChange} onChangeEnd={onNodeChangeEnd} />
      ) : showSpecializedProperties && isAccordion ? (
        <AccordionProperties node={selectedNode} onChange={groupedChange} onChangeEnd={onNodeChangeEnd} />
      ) : showSpecializedProperties && isAlert ? (
        <AlertProperties node={selectedNode} onChange={groupedChange} onChangeEnd={onNodeChangeEnd} />
      ) : showSpecializedProperties && isAppBar ? (
        <AppBarTextProperties node={selectedNode} onChange={groupedChange} onChangeEnd={onNodeChangeEnd} />
      ) : showSpecializedProperties && isArrow ? null : isTextNode ? (
        <>
          {showGenericState ? (
            <section className="property-section">
              <h3>State</h3>
              <select value={genericState} onChange={(event) => groupedChange("disabled", { disabled: event.target.value === "disabled" || undefined })}>
                <option value="normal">Normal</option>
                <option value="disabled">Disabled</option>
              </select>
            </section>
          ) : null}
          {hasTextStyleControls ? (
            <section className="property-section">
              <h3>Text</h3>
              <div className="text-toolbar">
                <div className="toolbar-group">
                  <button type="button" className={selectedNode.textBold ? "is-active" : ""} title="Bold" onClick={() => groupedChange("textBold", { textBold: !selectedNode.textBold })}><Bold size={18} /></button>
                  <button type="button" className={selectedNode.textItalic ? "is-active" : ""} title="Italic" onClick={() => groupedChange("textItalic", { textItalic: !selectedNode.textItalic })}><Italic size={18} /></button>
                  <button type="button" className={textUnderline ? "is-active" : ""} title="Underline" onClick={() => groupedChange("textUnderline", { textUnderline: !textUnderline })}><Underline size={18} /></button>
                  <button type="button" className={textStrikethrough ? "is-active" : ""} title="Strikethrough" onClick={() => groupedChange("textStrikethrough", { textStrikethrough: !textStrikethrough })}><Strikethrough size={18} /></button>
                </div>
                <div className="toolbar-group">
                  <button type="button" className={textAlign === "left" ? "is-active" : ""} title="Align left" onClick={() => groupedChange("textAlign", { textAlign: "left" })}><AlignLeft size={18} /></button>
                  <button type="button" className={textAlign === "center" ? "is-active" : ""} title="Align center" onClick={() => groupedChange("textAlign", { textAlign: "center" })}><AlignCenter size={18} /></button>
                  <button type="button" className={textAlign === "right" ? "is-active" : ""} title="Align right" onClick={() => groupedChange("textAlign", { textAlign: "right" })}><AlignRight size={18} /></button>
                </div>
                <GeometryNumberInput
                  className="font-size-field"
                  min={8}
                  max={72}
                  value={selectedNode.fontSize ?? 14}
                  onBlur={onNodeChangeEnd}
                  onChange={(value) => groupedChange("fontSize", { fontSize: value })}
                />
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <>
          {showGenericState ? (
            <section className="property-section">
              <h3>State</h3>
              <select value={genericState} onChange={(event) => groupedChange("disabled", { disabled: event.target.value === "disabled" || undefined })}>
                <option value="normal">Normal</option>
                <option value="disabled">Disabled</option>
              </select>
            </section>
          ) : null}
          {showChecked ? (
            <label className="checkbox-setting">
              <input type="checkbox" checked={Boolean(selectedNode.checked)} onChange={(event) => groupedChange("checked", { checked: event.target.checked })} />
              Checked
            </label>
          ) : null}
          {hasTextStyleControls ? (
            <section className="property-section">
              <h3>Text</h3>
              <div className="text-toolbar arrow-text-toolbar">
                <div className="toolbar-group">
                  <button type="button" className={selectedNode.textBold ? "is-active" : ""} title="Bold" onClick={() => groupedChange("textBold", { textBold: !selectedNode.textBold })}><Bold size={18} /></button>
                  <button type="button" className={selectedNode.textItalic ? "is-active" : ""} title="Italic" onClick={() => groupedChange("textItalic", { textItalic: !selectedNode.textItalic })}><Italic size={18} /></button>
                  <button type="button" className={textUnderline ? "is-active" : ""} title="Underline" onClick={() => groupedChange("textUnderline", { textUnderline: !textUnderline })}><Underline size={18} /></button>
                  <button type="button" className={textStrikethrough ? "is-active" : ""} title="Strikethrough" onClick={() => groupedChange("textStrikethrough", { textStrikethrough: !textStrikethrough })}><Strikethrough size={18} /></button>
                </div>
                <GeometryNumberInput
                  className="font-size-field"
                  min={8}
                  max={72}
                  value={selectedNode.fontSize ?? 14}
                  onBlur={onNodeChangeEnd}
                  onChange={(value) => groupedChange("fontSize", { fontSize: value })}
                />
              </div>
            </section>
          ) : null}
        </>
      )}
      {canChooseActiveOption ? (
        <section className="property-section">
          <h3>Selection</h3>
          <select value={String(selectedActiveIndex)} onChange={(event) => groupedChange("activeIndex", { activeIndex: Number(event.target.value) })}>
            {selectedNodeOptions.map((item, index) => (
              <option key={`${item}-${index}`} value={index}>
                {item || `Item ${index + 1}`}
              </option>
            ))}
          </select>
        </section>
      ) : null}
      {showValue ? (
        <label>
          Value
          <input
            type="number"
            min={["progressBar", "hSlider", "vSlider", "volumeSlider"].includes(selectedNode.kind) ? 0 : undefined}
            max={["progressBar", "hSlider", "vSlider", "volumeSlider"].includes(selectedNode.kind) ? 100 : undefined}
            value={selectedNode.value ?? ""}
            onBlur={onNodeChangeEnd}
            onChange={(event) => groupedChange("value", { value: Number.isFinite(event.target.valueAsNumber) ? event.target.valueAsNumber : event.target.value })}
          />
        </label>
      ) : null}
      {showPlaceholder ? (
        <label>
          Placeholder
          <input value={selectedNode.placeholder ?? ""} onBlur={onNodeChangeEnd} onChange={(event) => groupedChange("placeholder", { placeholder: event.target.value })} />
        </label>
      ) : null}
      {showTableTextAreas && selectedNode.columns ? (
        <label>
          Columns
          <textarea value={selectedNode.columns.join("\n")} onBlur={onNodeChangeEnd} onChange={(event) => groupedChange("columns", { columns: event.target.value.split("\n") })} />
        </label>
      ) : null}
      {showTableTextAreas && selectedNode.rows ? (
        <label>
          Rows
          <textarea value={selectedNode.rows.join("\n")} onBlur={onNodeChangeEnd} onChange={(event) => groupedChange("rows", { rows: event.target.value.split("\n") })} />
        </label>
      ) : null}
      {!isMultiSelection && (selectedNode.kind === "icon" || selectedNode.kind === "iconText") ? (
        <IconPicker value={selectedNode.icon ?? "Plus"} onChange={(name) => onNodeChange({ icon: name })} />
      ) : null}
      <label className="checkbox-setting">
        <input type="checkbox" checked={Boolean(selectedNode.locked)} onChange={(event) => onNodeChange({ locked: event.target.checked })} />
        Locked
      </label>
    </div>
  );
}

function SettingsDialog({
  appAppearance,
  onAppearanceChange,
  onClose,
}: {
  appAppearance: MockupProject["appearance"];
  onAppearanceChange: (patch: Partial<MockupProject["appearance"]>) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="modal-scrim" role="presentation" onMouseDown={onClose}>
      <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}>
        <aside className="settings-dialog-sidebar">
          <div className="settings-dialog-title">
            <span className="dialog-icon">
              <Settings size={18} />
            </span>
            <div>
              <h2 id="settings-title">Settings</h2>
              <p>Moqira preferences</p>
            </div>
          </div>
          <button className="settings-nav-item is-active" type="button">
            <Settings size={15} />
            <span>Appearance</span>
          </button>
        </aside>
        <div className="settings-dialog-content">
          <div className="settings-dialog-header">
            <h2>Appearance</h2>
            <button className="icon-button" type="button" title="Close" onClick={onClose}>
              <X size={17} />
            </button>
          </div>
          <div className="settings-form">
            <div className="setting-row">
              <span>
                <strong>Theme</strong>
              </span>
              <select value={appAppearance.colorScheme} onChange={(event) => onAppearanceChange({ colorScheme: event.target.value as never })}>
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>
            <div className="setting-row">
              <span>
                <strong>Accent</strong>
              </span>
              <input type="color" value={appAppearance.accentColor} onChange={(event) => onAppearanceChange({ accentColor: event.target.value })} />
            </div>
            <div className="setting-row">
              <span>
                <strong>App font size</strong>
              </span>
              <GeometryNumberInput
                className="settings-font-size-field"
                min={12}
                max={18}
                value={appAppearance.appFontSize}
                onChange={(value) => onAppearanceChange({ appFontSize: value })}
              />
            </div>
            <div className="setting-row">
              <span>
                <strong>Accent titlebar</strong>
              </span>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={appAppearance.accentTitlebar}
                  onChange={(event) => onAppearanceChange({ accentTitlebar: event.target.checked })}
                />
                <span className="switch-track" />
              </label>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function ContextMenu({
  state,
  targetName,
  canPaste,
  onClose,
  onSelect,
  onCut,
  onCopy,
  onPaste,
  onDelete,
  onLayer,
}: {
  state: ContextMenuState;
  targetName: string;
  canPaste: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDelete: () => void;
  onLayer: (action: LayerAction) => void;
}) {
  const disabled = !state.targetId;
  const item = (label: string, action: () => void, isDisabled = false) => (
    <button
      type="button"
      disabled={isDisabled}
      onClick={() => {
        action();
        onClose();
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="context-scrim" onClick={onClose}>
      <div className="context-menu" style={{ left: state.x, top: state.y }} onClick={(event) => event.stopPropagation()}>
        <div className="context-menu-header">{targetName}</div>
        {state.stack.length > 1 ? (
          <div className="context-submenu">
            <button type="button" className="has-submenu">Select object<span>›</span></button>
            <div className="submenu-panel">
              {state.stack.map((node) => (
                <button key={node.id} type="button" onClick={() => onSelect(node.id)}>
                  {node.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {item("Cut", onCut, disabled)}
        {item("Copy", onCopy, disabled)}
        {item("Paste Here", onPaste, !canPaste)}
        {item("Delete", onDelete, disabled)}
        <hr />
        {item("Bring Forward", () => onLayer("forward"), disabled)}
        {item("Bring to Front", () => onLayer("front"), disabled)}
        {item("Send Backward", () => onLayer("backward"), disabled)}
        {item("Send to Back", () => onLayer("back"), disabled)}
      </div>
    </div>
  );
}

function WireframeContextMenu({
  state,
  canDelete,
  canDuplicate,
  canRename,
  onClose,
  onNew,
  onRename,
  onDuplicate,
  onDelete,
}: {
  state: WireframeContextMenuState;
  canDelete: boolean;
  canDuplicate: boolean;
  canRename: boolean;
  onClose: () => void;
  onNew: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="context-scrim" onClick={onClose}>
      <div className="context-menu" style={{ left: state.x, top: state.y }} onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          onClick={() => {
            onNew();
            onClose();
          }}
        >
          New Wireframe
        </button>
        <button
          type="button"
          disabled={!canRename}
          onClick={() => {
            onRename();
            onClose();
          }}
        >
          Rename Wireframe
        </button>
        <button
          type="button"
          disabled={!canDuplicate}
          onClick={() => {
            onDuplicate();
            onClose();
          }}
        >
          Duplicate Wireframe
        </button>
        <button
          type="button"
          disabled={!canDelete}
          onClick={() => {
            onDelete();
            onClose();
          }}
        >
          Delete Wireframe
        </button>
      </div>
    </div>
  );
}

function RenameWireframeDialog({
  state,
  wireframes,
  onChange,
  onCancel,
  onSave,
}: {
  state: RenameWireframeState;
  wireframes: Wireframe[];
  onChange: (draft: string) => void;
  onCancel: () => void;
  onSave: () => boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const trimmedName = state.draft.trim();
  const duplicate = wireframes.some((wireframe) => wireframe.id !== state.wireframeId && wireframe.name.trim().toLowerCase() === trimmedName.toLowerCase());
  const error = !trimmedName ? "Wireframe name is required." : duplicate ? "Another wireframe already uses that name." : "";

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [state.wireframeId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div className="modal-scrim" role="presentation" onMouseDown={onCancel}>
      <section className="rename-dialog" role="dialog" aria-modal="true" aria-labelledby="rename-wireframe-title" onMouseDown={(event) => event.stopPropagation()}>
        <h2 id="rename-wireframe-title">Rename Wireframe</h2>
        <label>
          Name
          <input
            ref={inputRef}
            value={state.draft}
            aria-invalid={Boolean(error)}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !error) {
                event.preventDefault();
                onSave();
              }
            }}
          />
        </label>
        {error ? <p className="dialog-error">{error}</p> : null}
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" className="primary" disabled={Boolean(error)} onClick={onSave}>Save</button>
        </div>
      </section>
    </div>
  );
}

function UnsavedChangesDialog({
  projectName,
  onSave,
  onDiscard,
  onCancel,
}: {
  projectName: string;
  onSave: () => void | Promise<void>;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-scrim" role="presentation">
      <div className="unsaved-dialog" role="dialog" aria-modal="true" aria-labelledby="unsaved-title">
        <h2 id="unsaved-title">Save changes?</h2>
        <p>
          {projectName} has unsaved changes. Save before closing?
        </p>
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="danger" onClick={onDiscard}>
            Discard
          </button>
          <button type="button" className="primary" onClick={onSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function IconPicker({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const Current = getLucideIcon(value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? lucideIconNames.filter((name) => name.toLowerCase().includes(q)) : lucideIconNames;
    return list.slice(0, 300);
  }, [query]);

  return (
    <div className="icon-picker">
      <label>
        Icon
        <button type="button" className="icon-picker-trigger" onClick={() => setOpen((v) => !v)}>
          <Current size={18} />
          <span>{value}</span>
          <ChevronDown size={14} />
        </button>
      </label>
      {open ? (
        <div className="icon-picker-popover" onMouseDown={(event) => event.stopPropagation()}>
          <div className="icon-picker-search">
            <Search size={14} />
            <input
              autoFocus
              type="search"
              placeholder="Search icons..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
          </div>
          <div className="icon-picker-grid">
            {filtered.map((name) => {
              const Icon = getLucideIcon(name);
              return (
                <button
                  key={name}
                  type="button"
                  className={name === value ? "icon-picker-tile is-active" : "icon-picker-tile"}
                  title={name}
                  onClick={() => {
                    onChange(name);
                    setOpen(false);
                  }}
                >
                  <Icon size={18} />
                </button>
              );
            })}
            {filtered.length === 0 ? <div className="icon-picker-empty">No matches</div> : null}
          </div>
          {query.trim() && lucideIconNames.filter((n) => n.toLowerCase().includes(query.trim().toLowerCase())).length > 300 ? (
            <div className="icon-picker-hint">Showing first 300 matches — refine your search.</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default App;
