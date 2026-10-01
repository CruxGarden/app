---
title: 'Preview and Share'
description: 'Private while you work. Public when you choose.'
sidebar:
  order: 4
---

## Preview stays local

Preview lets you inspect a creation without publishing it. For a Site Crux, the first run may download build dependencies. A failed preview or build should show a useful error; fix it before publishing.

## Review the public result

Before Share, check your text, images, links, and mobile layout. Remove private details. Consider the conversation and source information exposed by **How was this made?**, as well as the visible site.

Use a separate visitor browser after publishing to verify what someone else actually sees.

## Publish a site

Open **Share**, connect your account if needed, and follow the publication controls. A Site Crux is built before its public output is uploaded. A failed build does not count as a successful publication.

The published address is separate from the local preview. Changes on disk are not automatically proof that the public site has updated; publish the new result and inspect the live link.

## Keep a private copy

A public site contains the publishable output, not everything in your Garden. Export a private archive for recovery and continued editing.

## Unshare

Use the app’s Unshare action when you want to remove public access. Wait for confirmation. If it reports failure, the site may still be available; retry or investigate before assuming it is private.

## Authentication in published Cruxes

Published Cruxes can use the embedded library’s authentication and permitted Store/Function APIs. Login itself is unmetered; Store and Function work counts toward the publisher’s API usage. Visitor credentials are scoped to the published Crux and approved origin. See [CLI and API](../../reference/cli-api/) for the distinction from account administration.

## Share and install tools and Moods

Explore and public Garden pages distinguish **Creations**, **Tools**, and **Moods**. A tool installs an editor you can use to create your own Cruxes. A Mood installs a look and sound for your Garden. Neither requires AI.

Open a tool or Mood's public link to install it in an open Garden, or download its file for later. In the app, choose **Add Crux → Import Crux, tool or Mood** and select the file:

- **`.cruxtool`** installs a reusable editor. It then appears in Add Crux.
- **`.cruxmood`** imports a Mood to your library; preview it before keeping it for your Garden.
- **`.crux`** imports a private project archive for continued editing.

To make your own tool, choose **Make a tool** in Add Crux. The starter includes an editor, a manifest and instructions. Review its files before exporting or publishing; other people receive the editor package you share. Downloaded tools cannot add native host commands or AI adapters to the app.

Publishing and making a listing discoverable are separate controls. Enable **Discoverable** when you want a publication to appear in Explore. Verify the shared link in a visitor browser and try installing it in a separate Garden.
