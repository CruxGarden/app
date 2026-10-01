---
title: 'Artifacts and Project Folders'
description: 'Your files, in the workspace and on disk.'
sidebar:
  order: 2
---

## One creation, real files

**Artifacts** is the files panel. On desktop, each Crux has a **Project Folder**: the real files behind your creation. Editing through the app, an external editor, or an agent changes that same working folder.

Use the Builder for structured content such as a home page’s name or a documentation page’s title. Use the file editor when you want to work directly with source.

## Choose the right tool

A Crux Tool provides an editor suited to its document: notes, drawings, music, and more. **Native export** creates a result for another application. A private **Crux archive** preserves the project. **Share** publishes supported public content. These are different actions.

Before deleting or replacing files, mark a version or export a private archive of important work.

## Site projects

Astro sites keep their editable source in Artifacts and Growth. Generated `dist`, `.astro`, and `node_modules` directories do not belong in history. Preview runs the site locally; Share builds the public output.

Avoid placing API keys, private certificates, or unrelated personal files in a site’s public directory. Anything you include in the public output may be downloaded by visitors.

## Work in another editor

Open the Project Folder in your preferred editor. Save a small change, return to Crux Garden, and confirm the file and preview update. If they do not, check that you are editing the current Crux’s folder, not an exported copy.

## Reuse files in another Crux

Select one or more files or folders in **Artifacts**, then choose **Copy selected to another Crux…**. You can also right-click a selection and choose **Copy to another Crux…**. Choose a receiving Crux in the same Garden and, optionally, a folder inside it.

The app saves current edits first and keeps the original files. Copies keep their source paths beneath the receiving folder. For an Astro website, copy images into `public` to use them on the page. If a destination already exists, choose a different folder; copying never replaces it.

The copies are independent: changing the original later does not change the receiving Crux. No AI or account is needed.
