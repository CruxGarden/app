/* eslint-disable react-refresh/only-export-components */
import { extensionOf } from '@/lib/artifact-path';
import audioIcon from 'material-icon-theme/icons/audio.svg?url';
import cIcon from 'material-icon-theme/icons/c.svg?url';
import consoleIcon from 'material-icon-theme/icons/console.svg?url';
import cppIcon from 'material-icon-theme/icons/cpp.svg?url';
import csharpIcon from 'material-icon-theme/icons/csharp.svg?url';
import cssIcon from 'material-icon-theme/icons/css.svg?url';
import dartIcon from 'material-icon-theme/icons/dart.svg?url';
import databaseIcon from 'material-icon-theme/icons/database.svg?url';
import fileIcon from 'material-icon-theme/icons/file.svg?url';
import folderIconUrl from 'material-icon-theme/icons/folder.svg?url';
import folderOpenIconUrl from 'material-icon-theme/icons/folder-open.svg?url';
import goIcon from 'material-icon-theme/icons/go.svg?url';
import htmlIcon from 'material-icon-theme/icons/html.svg?url';
import imageIcon from 'material-icon-theme/icons/image.svg?url';
import javaIcon from 'material-icon-theme/icons/java.svg?url';
import javascriptIcon from 'material-icon-theme/icons/javascript.svg?url';
import jsonIcon from 'material-icon-theme/icons/json.svg?url';
import kotlinIcon from 'material-icon-theme/icons/kotlin.svg?url';
import lessIcon from 'material-icon-theme/icons/less.svg?url';
import luaIcon from 'material-icon-theme/icons/lua.svg?url';
import markdownIcon from 'material-icon-theme/icons/markdown.svg?url';
import pdfIcon from 'material-icon-theme/icons/pdf.svg?url';
import phpIcon from 'material-icon-theme/icons/php.svg?url';
import pythonIcon from 'material-icon-theme/icons/python.svg?url';
import reactTsIcon from 'material-icon-theme/icons/react_ts.svg?url';
import rubyIcon from 'material-icon-theme/icons/ruby.svg?url';
import rustIcon from 'material-icon-theme/icons/rust.svg?url';
import sassIcon from 'material-icon-theme/icons/sass.svg?url';
import svgIcon from 'material-icon-theme/icons/svg.svg?url';
import swiftIcon from 'material-icon-theme/icons/swift.svg?url';
import tomlIcon from 'material-icon-theme/icons/toml.svg?url';
import typescriptIcon from 'material-icon-theme/icons/typescript.svg?url';
import videoIcon from 'material-icon-theme/icons/video.svg?url';
import xmlIcon from 'material-icon-theme/icons/xml.svg?url';
import yamlIcon from 'material-icon-theme/icons/yaml.svg?url';
import zipIcon from 'material-icon-theme/icons/zip.svg?url';

const EXT_ICON_MAP: Record<string, string> = {
  // Web
  html: htmlIcon, htm: htmlIcon,
  css: cssIcon,
  scss: sassIcon, sass: sassIcon,
  less: lessIcon,
  // JS / TS
  js: javascriptIcon, jsx: javascriptIcon, mjs: javascriptIcon,
  ts: typescriptIcon,
  tsx: reactTsIcon,
  // Data
  json: jsonIcon, jsonc: jsonIcon,
  yaml: yamlIcon, yml: yamlIcon,
  toml: tomlIcon,
  xml: xmlIcon,
  // Docs
  md: markdownIcon, mdx: markdownIcon,
  pdf: pdfIcon,
  // Images
  png: imageIcon, jpg: imageIcon, jpeg: imageIcon,
  gif: imageIcon, webp: imageIcon, bmp: imageIcon, ico: imageIcon,
  svg: svgIcon,
  // Media
  mp4: videoIcon, mov: videoIcon, webm: videoIcon, avi: videoIcon, mkv: videoIcon,
  mp3: audioIcon, wav: audioIcon, ogg: audioIcon, flac: audioIcon,
  // Languages
  py: pythonIcon,
  go: goIcon,
  rs: rustIcon,
  rb: rubyIcon,
  php: phpIcon,
  java: javaIcon,
  kt: kotlinIcon,
  swift: swiftIcon,
  dart: dartIcon,
  c: cIcon,
  cpp: cppIcon,
  cs: csharpIcon,
  lua: luaIcon,
  // Shell
  sh: consoleIcon, bash: consoleIcon, zsh: consoleIcon, fish: consoleIcon,
  // Data / DB
  sql: databaseIcon, sqlite: databaseIcon, csv: databaseIcon,
  // Archives
  zip: zipIcon, tar: zipIcon, gz: zipIcon, rar: zipIcon, '7z': zipIcon,
};

function MaterialIcon({ src, label }: { src: string; label: string }) {
  return (
    <img
      src={src}
      alt={label}
      width={16}
      height={16}
      style={{ display: 'inline-block', flexShrink: 0 }}
    />
  );
}

export function FolderIcon() {
  return <MaterialIcon src={folderIconUrl} label="folder" />;
}

export function FolderOpenIcon() {
  return <MaterialIcon src={folderOpenIconUrl} label="folder open" />;
}

export function getFileIcon(filename: string): React.ReactNode {
  const ext = extensionOf(filename);
  const src = EXT_ICON_MAP[ext] ?? fileIcon;
  return <MaterialIcon src={src} label={ext} />;
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
