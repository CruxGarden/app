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

**Tools** at the top says which binaries this machine has and where each came from — bundled with the app, beside it, or from your system. FFmpeg and ffprobe ship with Crux Garden. ImageMagick and Pandoc are usually the system's (`brew install imagemagick pandoc`, `apt install imagemagick pandoc`, imagemagick.org, pandoc.org); if one is missing, its recipes say so instead of failing halfway.

## What it ships with

**Video** — to MP4 with faststart so it streams, to WebM, to GIF at 480 wide, a smaller 720 copy, the first ten seconds, frames at two a second, a poster frame, a silent copy, or the audio pulled out.

**Audio** — to M4A or MP3, the loudness evened out to −16 LUFS, or folded to mono.

**Pictures** — to JPEG, PNG or WebP, resized to 1200 wide, a square 512 thumbnail, flattened onto white, grey, or a four-size `favicon.ico`.

**Documents** — Markdown, Word, a standalone HTML page, EPUB or plain text, in any direction between them.

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

`{in}` is the file you picked, `{out}` the output path, `{name}` its name without the extension. `tool` is `ffmpeg`, `magick` or `pandoc`. Add one by hand or ask the collaborator: _"add a recipe that makes a 512-pixel square thumbnail"_.

## Asking the collaborator

It has the same tools you do: `probe_media` to read a file, `run_ffmpeg`, `run_magick` and `run_pandoc` for anything the recipes do not cover, `media_tools` to check what this machine has. Ask for what you want — _"trim the first four seconds off the interview and normalise the audio"_ — and the run is recorded in the log like any other.
