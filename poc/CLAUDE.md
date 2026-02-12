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

### Local Docker (Web)

Docker files in `docker/` can still be used for local development:

```bash
npm run docker:app
# Access at http://localhost:8080
```

## CI/CD

### GitHub Actions

**Workflow:** `.github/workflows/deploy-web.yml`

On push to main, the app is built and deployed to AWS S3:

- Runs `npm run build:web` (Expo web export)
- Syncs `dist/` to S3 with cache headers:
  - Static assets: 1-year immutable cache
  - HTML/JSON: no-cache (must-revalidate)
- Optionally invalidates CloudFront cache

**Required GitHub secrets:**
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`
- `AWS_S3_BUCKET_NAME`

**Optional GitHub variable:**
- `AWS_CLOUDFRONT_DISTRIBUTION_ID` — for CDN cache invalidation

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
