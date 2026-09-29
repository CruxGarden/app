# Media Tools

A bench with the real tools. FFmpeg, ImageMagick and Pandoc run as their own programs inside this Crux's folder — no upload, no service, no shell — and everything they make lands in `exports/` as an Artifact with its own history.

## What is here

| Folder                                      | Holds                                                            |
| ------------------------------------------- | ---------------------------------------------------------------- |
| `video/`, `audio/`, `images/`, `documents/` | your sources; files dropped on the Crux land in the right one    |
| `exports/`                                  | what the bench makes                                             |
| `data/project.json`                         | your own recipes                                                 |
| `log.md`                                    | every run, in order: the recipe, the arguments, how long it took |

## The interface

The page lists what the Crux holds, says what each file actually is (ffprobe for audio and video, ImageMagick for pictures), and offers the recipes that fit it. Pick a file, pick a recipe, press Run: the arguments are shown before and after, the progress bar follows a long encode, and the output appears in the list.

**Tools** at the top says which binaries this machine has and where each came from — bundled with the app, beside it, installed at your request, or from your system. FFmpeg, ffprobe, Pandoc and Typst ship with Crux Garden. ImageMagick is the machine's own: its build is not portable enough to carry, so the chip offers to **Install** it where there is an official download (Linux, Windows) and drives Homebrew on macOS. You can also ignore it — the picture recipes go through ffmpeg when ImageMagick is absent, and only the favicon needs it.

## What it ships with

**Video** — to MP4 with faststart so it streams, to WebM, to GIF at 480 wide, a smaller 720 copy, the first ten seconds, frames at two a second, a poster frame, a silent copy, or the audio pulled out.

**Audio** — to M4A or MP3, the loudness evened out to −16 LUFS, or folded to mono.

**Pictures** — to JPEG, PNG or WebP, resized to 1200 wide, a square 512 thumbnail, flattened onto white, grey, or a four-size `favicon.ico`.

**Documents** — Markdown, Word, a standalone HTML page, EPUB or plain text, in any direction between them, and **PDF**.

PDF deserves a word. Pandoc converts between document formats itself, but a PDF is a laid-out page rather than a document, so it hands that job to a typesetting engine — and its default is a LaTeX install of several gigabytes. Crux Garden uses neither. If the machine has **Typst** (one 43 MB binary) it typesets properly: real page breaks, page numbers, a table of contents. Otherwise Pandoc writes a page and Crux Garden prints it with the browser it already ships. That printing happens with JavaScript off and every request blocked unless it is a file inside this Crux, so a document you were sent cannot phone home or report that you opened it.

## Recipes

A recipe is a line in `data/project.json`:

```json
{
  "id": "to-mp4",
  "name": "To MP4",
  "tool": "ffmpeg",
  "accepts": [".webm", ".mov", ".mkv", ".avi"],
  "out": "exports/{name}.mp4",
  "args": ["-y", "-i", "{in}", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "{out}"]
}
```

`{in}` is the file you picked, `{out}` the output path, `{name}` its name without the extension. `tool` is `ffmpeg`, `magick`, `pandoc`, or `pdf` for the document-to-PDF route. Add one by hand or ask the collaborator: _"add a recipe that makes a 512-pixel square thumbnail"_.

Native tools accept reviewed conversion options. FFmpeg supports the built-in media recipes, numeric scale/fps, trimming and audio/video conversion; arbitrary filters, playlists and devices are refused. ImageMagick accepts raster conversion and inspection, including the built-in picture recipes; SVG/PDF, delegates, indirect file lists and arbitrary subcommands are refused. Picture conversions use the first frame. Custom recipes use the same rules, and a refused option is reported before execution.

## Document command limits

Pandoc accepts local input/output paths, built-in formats, standalone output, tables of contents, numbering, metadata and layout options. Filters, custom readers/writers, defaults files, external resource paths and PDF-engine options are refused. Conversion runs with Pandoc's sandbox, so documents cannot include arbitrary files; some image-embedding conversions may be unavailable. Use **PDF** or `make_pdf` for a PDF.

Typst receives a temporary copy of the Project Folder with no symlinks, hidden files or dependency folders, capped at 10,000 entries and 64 MB. Large projects and unsupported documents use the browser printer. Local images retain their relative paths. Temporary files are private and removed after conversion, and a failed conversion preserves an existing PDF.

## Asking the collaborator

It has the same tools you do: `probe_media` to read a file, `run_ffmpeg`, `run_magick` and `run_pandoc` for anything the recipes do not cover, `make_pdf` for a PDF of something written, `media_tools` to check what this machine has, and `install_media_tool` when something is missing. Ask for what you want — _"trim the first four seconds off the interview and normalise the audio"_ — and the run is recorded in the log like any other.
