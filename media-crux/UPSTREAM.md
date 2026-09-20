# Upstream

This Crux runs two programs it does not modify.

## FFmpeg — https://ffmpeg.org

The build bundled with Crux Garden comes from [`ffmpeg-static`](https://github.com/eugeneware/ffmpeg-static), which packages an LGPL-2.1-or-later build of FFmpeg per platform. Where a machine has its own `ffmpeg` on the PATH, that one may be used instead; the bench says which it took. FFmpeg's source is at https://git.ffmpeg.org/ffmpeg.git and the corresponding source for the bundled build is at the ffmpeg-static release it came from.

## ImageMagick — https://imagemagick.org

Used from the machine it is installed on (`magick`, or `convert` for ImageMagick 6). Not redistributed with Crux Garden today; a build dropped at `resources/bin/<platform>-<arch>/magick` by packaging is picked up if one is there. ImageMagick is distributed under the [ImageMagick License](https://imagemagick.org/script/license.php), an Apache-2.0-style licence.

## What is Crux Garden's

The page, the recipe format, the log, the drop routes and the integration with Growth and the collaborator. Both programs are run through the app's audited native seam: the working directory is pinned to this Crux's folder, every path argument must resolve inside it, no protocols and no shell are involved, and ImageMagick is additionally run under memory, map and time limits.
