const iconProps = {
  width: 14,
  height: 14,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function FolderIcon() {
  return (
    <svg {...iconProps}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function FolderOpenIcon() {
  return (
    <svg {...iconProps}>
      <path d="M5 19a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4l2 3h9a2 2 0 0 1 2 2v1" />
      <path d="M5 19h15.2a1 1 0 0 0 .98-.8l1.82-8A1 1 0 0 0 22.02 9H8.78a1 1 0 0 0-.98.8L6 18" />
    </svg>
  );
}

function HtmlIcon() {
  return (
    <svg {...iconProps}>
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

function CssIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 4h16v16H4z" />
      <path d="M8 8h3v3H8zM13 13h3v3h-3z" />
    </svg>
  );
}

function JsIcon() {
  return (
    <svg {...iconProps}>
      <path d="M8 18c0-2 1-3 3-3s3 1 3 3" />
      <path d="M17 12v3c0 1.5-1 2-2 2" />
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  );
}

function JsonIcon() {
  return (
    <svg {...iconProps}>
      <path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1" />
      <path d="M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1" />
    </svg>
  );
}

function MarkdownIcon() {
  return (
    <svg {...iconProps}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M6 8v8l2-2 2 2V8" />
      <path d="M18 12l-2-2v4" />
      <path d="M14 14l2-2" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg {...iconProps}>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function PythonIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 2C9 2 7 3 7 5.5V8h5v1H6.5C4 9 2 11 2 13.5S4 18 6.5 18H8v-2.5C8 13 10 11 12.5 11H17c2 0 3-1 3-3V5.5C20 3 18 2 15 2h-3z" />
      <circle cx="9.5" cy="5" r="1" fill="currentColor" />
      <path d="M12 22c3 0 5-1 5-3.5V16h-5v-1h5.5c2.5 0 4.5-2 4.5-4.5S20 6 17.5 6H16v2.5C16 11 14 13 11.5 13H7c-2 0-3 1-3 3v2.5C4 21 6 22 9 22h3z" />
      <circle cx="14.5" cy="19" r="1" fill="currentColor" />
    </svg>
  );
}

function DefaultFileIcon() {
  return (
    <svg {...iconProps}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function SvgIcon() {
  return (
    <svg {...iconProps}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M7 17L11 7" />
      <circle cx="16" cy="12" r="3" />
    </svg>
  );
}

const EXT_ICON_MAP: Record<string, () => React.ReactNode> = {
  html: HtmlIcon,
  htm: HtmlIcon,
  css: CssIcon,
  js: JsIcon,
  jsx: JsIcon,
  ts: JsIcon,
  tsx: JsIcon,
  mjs: JsIcon,
  json: JsonIcon,
  md: MarkdownIcon,
  mdx: MarkdownIcon,
  svg: SvgIcon,
  png: ImageIcon,
  jpg: ImageIcon,
  jpeg: ImageIcon,
  gif: ImageIcon,
  webp: ImageIcon,
  bmp: ImageIcon,
  ico: ImageIcon,
  py: PythonIcon,
};

export function getFileIcon(filename: string): React.ReactNode {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const Icon = EXT_ICON_MAP[ext] || DefaultFileIcon;
  return <Icon />;
}

export function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width={10}
      height={10}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
