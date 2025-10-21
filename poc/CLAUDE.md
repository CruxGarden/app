# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CruxGarden is a React Native mobile application built with Expo. The project uses Expo Router for file-based routing and supports iOS, Android, and web platforms. The app uses React 19 and React Native's new architecture (newArchEnabled: true) with the React Compiler experimental feature enabled.

## Development Commands

### Starting the Development Server

```bash
npm start
# Runs on port 8080 by default (expo start -p 8080)
```

### Linting

```bash
npm run lint
# Runs expo lint with the configured eslint-config-expo flat config
```

### Reset Project

```bash
npm run reset-project
# Moves starter code to app-example directory and creates blank app directory
```

### Docker Deployment (Web)

```bash
# Build and run with npm script
npm run docker:app

# Or with docker-compose directly
docker-compose -f docker/docker-compose.yml up --build

# Or build and run manually
docker build -f docker/Dockerfile -t crux-garden-app .
docker run -p 8080:80 crux-garden-app

# Access at http://localhost:8080
```

All Docker files are located in the `docker/` directory. The Docker setup uses a multi-stage build that:

1. Builds the Expo web app using `expo export --platform web`
2. Serves the static output with nginx
3. Includes caching, gzip compression, and client-side routing support

## CI/CD

### GitHub Actions

The project uses GitHub Actions to automatically build Docker images on pushes to main, pull requests, and releases.

**Workflow:** `.github/workflows/docker-build.yml`

- Builds multi-platform Docker images (linux/amd64, linux/arm64)
- Pushes to GitHub Container Registry (ghcr.io) on main branch and releases
- Uses Docker layer caching for faster builds
- Generates artifact attestations for build provenance (security)
- Automatic tagging:
  - `latest` for main branch
  - Semver tags for releases (e.g., `v1.2.3`, `v1.2`, `v1`)
  - Branch name and commit SHA

**Accessing built images:**

```bash
docker pull ghcr.io/[username]/crux-garden-app:latest
```

Images are published to GitHub Packages and require authentication with GitHub token.

## Architecture

### Routing

- Uses Expo Router (v6) for file-based routing
- Typed routes are enabled (experiments.typedRoutes: true)
- Root layout is in `app/_layout.tsx` using Stack navigation
- Entry point is `app/index.tsx`

### Configuration

- Path alias `@/*` maps to root directory (configured in tsconfig.json)
- TypeScript strict mode is enabled
- Expo's new architecture is enabled with React Compiler support
- URL scheme: `cruxgarden://`

### Platforms

- iOS: Supports tablets
- Android: Uses edge-to-edge mode, adaptive icons with monochrome support
- Web: Static output with Metro bundler

### Key Dependencies

- Navigation: @react-navigation/native, @react-navigation/bottom-tabs
- HTTP client: axios
- Animations: react-native-reanimated, react-native-gesture-handler
- UI: expo-symbols, @expo/vector-icons

### Experimental Features

- React Compiler is enabled (experiments.reactCompiler: true)
- Typed routes (experiments.typedRoutes: true)

## Project Structure Notes

The `app-example` directory contains the original Expo starter template with example components, hooks, constants, and scripts that can be referenced when building new features.
