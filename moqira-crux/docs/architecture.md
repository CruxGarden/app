# Mockups Architecture

Mockups is a small Balsamiq-style wireframing app built with React, Vite, and Tauri.

## Frontend

The editor uses normal React DOM elements positioned on a large scrollable canvas. This keeps text editing, selection, drag interactions, context menus, and properties controls straightforward.

The main state lives in `src/App.tsx` while the durable project schema lives in `src/types.ts`.

## Project Format

Each project file is JSON:

```json
{
  "schemaVersion": 1,
  "name": "New Project",
  "activeWireframeId": "wireframe-id",
  "appearance": {},
  "wireframes": [
    {
      "id": "wireframe-id",
      "name": "Wireframe 1",
      "nodes": []
    }
  ]
}
```

The `wireframes[].nodes` array is also the layer stack. Later entries render above earlier entries.

## Backend

The Tauri backend intentionally stays small. It reads and writes project files and asks the OS to reveal a project in the file manager.
