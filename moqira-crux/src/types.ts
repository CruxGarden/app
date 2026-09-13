export type ComponentKind =
  | "accordion"
  | "alertBox"
  | "alertBoxAndroid"
  | "appBar"
  | "arrow"
  | "breadcrumbs"
  | "browser"
  | "rectangle"
  | "button"
  | "tabs"
  | "buttonBar"
  | "calendar"
  | "callout"
  | "chartBar"
  | "chartColumn"
  | "chartLine"
  | "chartPie"
  | "checkbox"
  | "checkboxList"
  | "circleButton"
  | "colorPicker"
  | "comboBox"
  | "coverFlow"
  | "dataGrid"
  | "dateChooser"
  | "datePicker"
  | "fieldSet"
  | "hCurlyBrace"
  | "hRule"
  | "hScrollBar"
  | "hSlider"
  | "hSplitter"
  | "helpButton"
  | "icon"
  | "iconText"
  | "image"
  | "iosKeyboard"
  | "iosMenu"
  | "iosPicker"
  | "ipad"
  | "iphone"
  | "link"
  | "linkBar"
  | "list"
  | "listIcon"
  | "menu"
  | "menuBar"
  | "modalScreen"
  | "multilineButton"
  | "numericStepper"
  | "onOffSwitch"
  | "playback"
  | "pointyButton"
  | "popover"
  | "progressBar"
  | "progressBarIndeterminate"
  | "radioButton"
  | "radioButtonGroup"
  | "redX"
  | "scratchOut"
  | "searchBox"
  | "searchBoxVoice"
  | "shape"
  | "siteMap"
  | "smartphone"
  | "squigglyLine"
  | "squigglyParagraph"
  | "stickyNote"
  | "streetMap"
  | "tabBar"
  | "tagCloud"
  | "textArea"
  | "textInput"
  | "textLabel"
  | "textParagraph"
  | "textSubtitle"
  | "textTitle"
  | "timePicker"
  | "toolbar"
  | "tooltip"
  | "treePane"
  | "vCurlyBrace"
  | "vRule"
  | "vScrollBar"
  | "vSlider"
  | "vSplitter"
  | "vTabs"
  | "videoPlayer"
  | "volumeSlider"
  | "webcam"
  | "window"
  | "dropdown"
  | "textbox"
  | "text";

export type CanvasNode = {
  id: string;
  kind: ComponentKind;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  fill?: string;
  stroke?: string;
  textColor?: string;
  fontSize?: number;
  locked?: boolean;
  disabled?: boolean;
  checked?: boolean;
  options?: string[];
  activeIndex?: number;
  showBorder?: boolean;
  showScrollbar?: boolean;
  opacity?: number;
  tabPlacement?: "top" | "bottom";
  tabAlignment?: "left" | "center" | "right";
  textAlign?: "left" | "center" | "right";
  textBold?: boolean;
  textItalic?: boolean;
  textUnderline?: boolean;
  textStrikethrough?: boolean;
  icon?: string;
  value?: string | number;
  orientation?: "horizontal" | "vertical";
  variant?: string;
  placeholder?: string;
  arrowLine?: "curved" | "straight";
  arrowHeadStart?: boolean;
  arrowHeadEnd?: boolean;
  arrowStrokeStyle?: "solid" | "dashed" | "dotted";
  arrowLabelPosition?: number;
  arrowStart?: CanvasPoint;
  arrowEnd?: CanvasPoint;
  arrowControl?: CanvasPoint;
  columns?: string[];
  rows?: string[];
  imageDataUrl?: string;
  imageMimeType?: string;
  imageNaturalWidth?: number;
  imageNaturalHeight?: number;
  links?: Record<string, CanvasLink>;
};

export type CanvasPoint = {
  x: number;
  y: number;
};

export type CanvasLink =
  | { kind: "wireframe"; wireframeId: string }
  | { kind: "url"; url: string }
  | { kind: "back" };

export type Wireframe = {
  id: string;
  name: string;
  background?: "white" | "black";
  showGrid?: boolean;
  nodes: CanvasNode[];
};

export type MockupProject = {
  schemaVersion: 1;
  name: string;
  wireframes: Wireframe[];
  activeWireframeId: string;
  appearance: ProjectAppearance;
};

export type ProjectAppearance = {
  colorScheme: "system" | "light" | "dark";
  accentColor: string;
  appFontFamily: string;
  appFontSize: number;
  accentTitlebar: boolean;
};

export type ProjectFileState = {
  path: string | null;
  project: MockupProject;
  dirty: boolean;
};

export type ComponentDefinition = {
  kind: ComponentKind;
  label: string;
  icon: string;
  category?: string | string[];
  width: number;
  height: number;
  defaults?: Partial<CanvasNode>;
};
