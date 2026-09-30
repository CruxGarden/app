#!/usr/bin/env python3
"""Build a matched FFmpeg/ffprobe pair and carry its exact source with it.

No host codec libraries, floating downloads or nonfree options. Run on the target
architecture with Python 3.12+, a C/C++ toolchain, make, CMake, pkg-config, git
and (on x86) nasm. Windows builds run inside an MSYS2 development shell.
"""

import argparse
import hashlib
import io
import json
import os
import platform
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
SOURCES = HERE / "ffmpeg-sources.json"
SOURCE_BYTES = SOURCES.read_bytes()
RECIPE_BYTES = Path(__file__).read_bytes()
SPECS = json.loads(SOURCE_BYTES)
TARGET_OS = (
    "darwin"
    if sys.platform == "darwin"
    else ("win32" if os.environ.get("MSYSTEM") else "linux")
)
ARCH = {"aarch64": "arm64", "arm64": "arm64", "AMD64": "x64", "x86_64": "x64"}.get(
    platform.machine()
)


def digest(file):
    with open(file, "rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def recipe_digest():
    return hashlib.sha256(SOURCE_BYTES + RECIPE_BYTES).hexdigest()


def run(args, cwd, env=None):
    print("+", *map(str, args), flush=True)
    try:
        subprocess.run(list(map(str, args)), cwd=cwd, env=env, check=True)
    except subprocess.CalledProcessError:
        # Configure failures otherwise disappear when the private build directory
        # is cleaned. Keep the relevant compiler diagnostics in the build log.
        config_log = Path(cwd) / "ffbuild" / "config.log"
        if config_log.exists():
            print(
                "\n".join(config_log.read_text(errors="replace").splitlines()[-80:]),
                flush=True,
            )
        raise


def download_sources(cache):
    cache.mkdir(parents=True, exist_ok=True)
    for name, spec in SPECS.items():
        destination = cache / spec["archive"]
        if destination.exists() and digest(destination) == spec["sha256"]:
            continue
        # The archive endpoint for AOM is unavailable; git still serves the
        # release commit. Verify both the commit and the generated archive.
        with tempfile.TemporaryDirectory(prefix="crux-source-") as scratch:
            scratch = Path(scratch)
            incoming = scratch / spec["archive"]
            if "revision" in spec:
                checkout = scratch / "checkout"
                run(
                    [
                        "git",
                        "clone",
                        "--depth",
                        "1",
                        "--branch",
                        spec["tag"],
                        spec["url"],
                        checkout,
                    ],
                    scratch,
                )
                revision = subprocess.check_output(
                    ["git", "rev-parse", "HEAD"], cwd=checkout, text=True
                ).strip()
                if revision != spec["revision"]:
                    raise RuntimeError(
                        f"{name}: release tag moved; review the source lock"
                    )
                run(
                    [
                        "git",
                        "archive",
                        "--format=tar.gz",
                        f"--prefix={name}/",
                        "HEAD",
                        "-o",
                        incoming,
                    ],
                    checkout,
                )
            else:
                with (
                    urllib.request.urlopen(spec["url"], timeout=60) as response,
                    incoming.open("wb") as output,
                ):
                    total = 0
                    while chunk := response.read(1024 * 1024):
                        total += len(chunk)
                        if total > 100 * 1024 * 1024:
                            raise RuntimeError(f"{name}: source exceeds 100 MiB")
                        output.write(chunk)
            if digest(incoming) != spec["sha256"]:
                raise RuntimeError(
                    f"{name}: source checksum mismatch; nothing was built"
                )
            shutil.copyfile(incoming, destination)


def extract(source, target):
    target.mkdir(parents=True)
    with tarfile.open(source) as archive:
        members = archive.getmembers()
        prefix = members[0].name.split("/")[0] + "/"
        for member in members:
            member.name = member.name.removeprefix(prefix)
            if member.name:
                archive.extract(member, target, filter="data")


def build(work, cache, jobs):
    prefix = work / "prefix"
    prefix.mkdir()
    source = work / "source"
    for name, spec in SPECS.items():
        extract(cache / spec["archive"], source / name)
    flags = "-O2" + (
        f" -arch {platform.machine()} -mmacosx-version-min=13.0"
        if TARGET_OS == "darwin"
        else ""
    )
    env = {
        **os.environ,
        "CFLAGS": flags,
        "CXXFLAGS": flags,
        "CPPFLAGS": f"-I{prefix}/include",
        "LDFLAGS": f"-L{prefix}/lib",
        "PKG_CONFIG_LIBDIR": f"{prefix}/lib/pkgconfig",
        "PKG_CONFIG_PATH": "",
    }
    if TARGET_OS == "darwin":
        env["MACOSX_DEPLOYMENT_TARGET"] = "13.0"
        env["LDFLAGS"] += f" -arch {platform.machine()} -mmacosx-version-min=13.0"
    # Do not inherit a host's alternative CMake library search tree.
    env.pop("CMAKE_PREFIX_PATH", None)
    if TARGET_OS == "win32":
        env["LDFLAGS"] += " -static"

    def make(name, options):
        cwd = source / name
        run(["./configure", f"--prefix={prefix}", *options], cwd, env)
        run(["make", f"-j{jobs}"], cwd, env)
        run(["make", "install"], cwd, env)

    def cmake(name, options, directory="."):
        cwd = source / name
        args = [
            "cmake",
            "-S",
            directory,
            "-B",
            "crux-build",
            f"-DCMAKE_INSTALL_PREFIX={prefix}",
            f"-DCMAKE_PREFIX_PATH={prefix}",
            "-DCMAKE_INSTALL_LIBDIR=lib",
            "-DCMAKE_BUILD_TYPE=Release",
            "-DBUILD_SHARED_LIBS=OFF",
            "-DCMAKE_POSITION_INDEPENDENT_CODE=ON",
            "-DCMAKE_POLICY_VERSION_MINIMUM=3.5",
        ]
        if TARGET_OS == "darwin":
            args.extend(
                [
                    "-DCMAKE_OSX_DEPLOYMENT_TARGET=13.0",
                    f"-DCMAKE_OSX_ARCHITECTURES={platform.machine()}",
                    f"-DCMAKE_APPLE_SILICON_PROCESSOR={platform.machine()}",
                ]
            )
        if TARGET_OS == "win32":
            args.extend(["-G", "MSYS Makefiles"])
        run([*args, *options], cwd, env)
        run(["cmake", "--build", "crux-build", "-j", jobs], cwd, env)
        run(["cmake", "--install", "crux-build"], cwd, env)

    static = ["--disable-shared", "--enable-static"]
    make("zlib", ["--static"])
    make(
        "x264", ["--enable-static", "--enable-pic", "--disable-cli", "--disable-opencl"]
    )
    make("lame", [*static, "--disable-frontend", "--disable-decoder"])
    make("libogg", static)
    # Vorbis 1.3.7's CMake install omits its private math dependency from
    # pkg-config on Linux; declare it without modifying upstream sources.
    cmake("libvorbis", ["-DVORBIS_LIBS=-lm"] if TARGET_OS == "linux" else [])
    cmake(
        "opus",
        [
            "-DOPUS_BUILD_TESTING=OFF",
            "-DOPUS_BUILD_PROGRAMS=OFF",
            "-DOPUS_INSTALL_PKG_CONFIG_MODULE=ON",
        ],
    )
    cmake(
        "webp",
        [
            f"-DWEBP_BUILD_{item}=OFF"
            for item in [
                "ANIM_UTILS",
                "CWEBP",
                "DWEBP",
                "GIF2WEBP",
                "IMG2WEBP",
                "VWEBP",
                "WEBPINFO",
                "WEBPMUX",
                "EXTRAS",
            ]
        ],
    )
    make(
        "libvpx",
        [
            *static,
            "--disable-examples",
            "--disable-tools",
            "--disable-unit-tests",
            "--disable-docs",
            "--enable-pic",
        ],
    )
    cmake(
        "x265",
        ["-DENABLE_SHARED=OFF", "-DENABLE_CLI=OFF", "-DENABLE_ASSEMBLY=OFF"],
        "source",
    )
    cmake(
        "aom",
        [f"-DENABLE_{item}=OFF" for item in ["TESTS", "EXAMPLES", "TOOLS", "DOCS"]],
    )
    make(
        "ffmpeg",
        [
            *static,
            "--disable-autodetect",
            "--enable-gpl",
            "--enable-version3",
            "--disable-nonfree",
            "--disable-doc",
            "--disable-ffplay",
            "--disable-debug",
            "--pkg-config-flags=--static",
            # MinGW's x265 pkg-config metadata can omit the C++ runtime.
            # FFmpeg links with the C driver; place this after codec archives.
            *(["--extra-libs=-lstdc++"] if TARGET_OS == "win32" else []),
            "--enable-zlib",
            *[
                f"--enable-lib{name}"
                for name in [
                    "x264",
                    "x265",
                    "mp3lame",
                    "vpx",
                    "webp",
                    "opus",
                    "vorbis",
                    "aom",
                ]
            ],
        ],
    )
    return prefix, source


def assemble(prefix, source, cache, output):
    output.mkdir(parents=True)
    files = {}
    for name in ["ffmpeg", "ffprobe"]:
        filename = name + (".exe" if TARGET_OS == "win32" else "")
        binary = prefix / "bin" / filename
        version = subprocess.check_output([binary, "-version"], text=True)
        license_text = subprocess.check_output(
            [binary, "-L"], text=True, stderr=subprocess.DEVNULL
        )
        if (
            "--enable-nonfree" in version
            or "not legally redistributable" in license_text
        ):
            raise RuntimeError(f"{name}: nonfree binary must never be packaged")
        if (
            not version.startswith(f"{name} version {SPECS['ffmpeg']['version']} ")
            or "GNU General Public License" not in license_text
        ):
            raise RuntimeError(f"{name}: unexpected version or license")
        if TARGET_OS == "darwin":
            links = subprocess.check_output(["otool", "-L", binary], text=True)
            for line in links.splitlines()[1:]:
                if not line.strip().startswith(("/usr/lib/", "/System/Library/")):
                    raise RuntimeError(f"{name}: non-system dynamic dependency: {line}")
        shutil.copy2(binary, output / filename)
        files[filename] = digest(output / filename)
        (output / f"{name}-version.txt").write_text(version)
        (output / f"{name}-license.txt").write_text(license_text)
    # The binary and its corresponding source travel together, including every
    # codec dependency, the exact build recipe, lock and original license files.
    with tarfile.open(output / "corresponding-source.tar.gz", "w:gz") as archive:
        for spec in SPECS.values():
            archive.add(cache / spec["archive"], arcname=spec["archive"])
        # Preserve the actual recipe loaded by this process, even if someone
        # edits the checkout during a long build. Staging will reject that old
        # recipe until it is rebuilt against the changed checkout.
        for name, contents in [
            (SOURCES.name, SOURCE_BYTES),
            (Path(__file__).name, RECIPE_BYTES),
        ]:
            entry = tarfile.TarInfo(name)
            entry.size = len(contents)
            archive.addfile(entry, io.BytesIO(contents))
    shutil.copyfile(source / "ffmpeg" / "COPYING.GPLv3", output / "COPYING.GPLv3")
    notice = "FFmpeg and ffprobe " + SPECS["ffmpeg"]["version"] + "\n\n"
    notice += "Separate executables built from unmodified upstream sources, GPL-3.0-or-later.\n"
    notice += (
        "Exact sources, codec licenses and build recipe: corresponding-source.tar.gz.\n"
    )
    notice += "Extract that archive; run python3 build-ffmpeg.py --cache . --output ./output on the target architecture.\n\n"
    notice += "\n".join(
        f"{name} {spec['version']}: {spec['license']} — {spec['url']}"
        for name, spec in SPECS.items()
    )
    (output / "NOTICE.txt").write_text(notice + "\n")
    for file in output.iterdir():
        if file.is_file():
            files[file.name] = digest(file)
    (output / "receipt.json").write_text(
        json.dumps(
            {
                "platform": TARGET_OS,
                "arch": ARCH,
                "version": SPECS["ffmpeg"]["version"],
                "recipe": recipe_digest(),
                "files": files,
            },
            indent=2,
        )
        + "\n"
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--cache", type=Path, default=HERE.parent / ".native-tools" / "sources"
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=HERE.parent / ".native-tools" / f"{TARGET_OS}-{ARCH}",
    )
    parser.add_argument("--jobs", type=int, default=min(os.cpu_count() or 2, 8))
    args = parser.parse_args()
    if sys.platform not in ("darwin", "linux", "msys", "cygwin") and not os.environ.get(
        "MSYSTEM"
    ):
        parser.error("Windows source builds require an MSYS2 UCRT64 shell")
    if ARCH not in ("arm64", "x64") or not 1 <= args.jobs <= 64:
        parser.error("Use a supported native architecture and 1–64 build jobs")
    cache, output = args.cache.resolve(), args.output.resolve()
    if output.exists():
        parser.error(
            f"Output already exists: {output}. Use a fresh --output directory."
        )
    download_sources(cache)
    with tempfile.TemporaryDirectory(prefix="crux-ffmpeg-build-") as scratch:
        prefix, source = build(Path(scratch), cache, args.jobs)
        # No half-built output can be admitted by staging: receipt is written last.
        assemble(prefix, source, cache, output)
    print(f"Built {output}")


if __name__ == "__main__":
    main()
