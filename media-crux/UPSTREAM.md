# Upstream

This Crux offers recipes for separate native programs. Use **About this tool** and the tool chips to see what is available on this machine.

## FFmpeg and ffprobe — https://ffmpeg.org

Crux Garden builds a matched FFmpeg/ffprobe 9.0.2 pair from pinned upstream sources. These executables include GPL codecs and are **GPL-3.0-or-later**, not LGPL. Nonfree features are disabled. The desktop bundle includes `bin/NOTICE.txt`, the license text, version/configuration output, pre-signing build checksums and `bin/corresponding-source.tar.gz`: the exact unmodified FFmpeg and codec sources plus the build recipe. See `electron/scripts/ffmpeg-sources.json` in the application repository for each dependency's version, source and license.

FFmpeg and ffprobe run as separate programs. The Garden page, recipes and integration are MIT-licensed. When the app uses a person's system installation instead, that build has its own configuration and licensing. The bench reports its origin.

## ImageMagick — https://imagemagick.org

Used from the machine it is installed on (`magick`, or `convert` for ImageMagick 6); not bundled. ImageMagick uses the [ImageMagick License](https://imagemagick.org/script/license.php). The app can install it when requested.

## Pandoc and Typst

[Pandoc](https://pandoc.org) is GPL-2.0-or-later. [Typst](https://typst.app) is Apache-2.0. The app detects these separate programs for document conversion and PDF layout; their availability depends on the installation. If Typst is absent, Make PDF can use the app's browser PDF engine. Do not assume Pandoc itself typesets PDFs.

## Garden's integration

The app admits reviewed conversion options and local inputs; arbitrary filters, playlists, scripts and indirect file references are refused. Raster conversion uses a private copy and controlled ImageMagick configuration. Typst compiles a bounded copy of the Project Folder. Processes run without a shell and have time/output limits. These checks are application policy, not an operating-system sandbox for native decoder defects or concurrent filesystem replacement. Typst package downloads remain a separate release-hardening item.
