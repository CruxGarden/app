---
title: 'Preview and Share'
description: 'Private while you work. Public when you choose.'
sidebar:
  order: 4
---

## Your first notebook website

1. In setup, choose **Writing and notes**, then **Create & open**. Keep Advanced Mode off for a simpler workspace.
2. Choose **Write in my note** in the walkthrough and type your own text. Change the title above the note if you like. Wait for **Saved** below.
3. Choose **Next: choose public notes**, then **Choose notes to share**. Check only the notes you want visitors to read. Unchecked notes stay private. Give the public edition a title and choose **Done choosing**. This does not put anything online.
4. Choose **Next: publish**, then **Open Share**. Use **Preview as a visitor** to review the public result. Choose **Back to editing** to return to the notebook and change the selection if needed.
5. Choose **Share selected content**. Connect your account if asked; your plan and storage limits apply. Choose whether to make a separate backup of the editable project and history.
6. Wait for **Up to date**, then choose **Copy link** or **View published Crux**. Send that link to your visitors.

Later edits remain on your computer until you choose **Update shared content**. If a step fails, your local notes remain available; read the message, correct the problem and retry. Do not assume the website changed until sharing succeeds.

## Help at your own pace

The walkthrough remembers your step. **Hide tips** folds it away; click its title to reopen it. **All steps and more help** lets you revisit a step and open this guide. The question mark beside each panel’s name explains what that panel does.

Normal mode puts secondary controls in named sections. Advanced Mode expands those controls across the app; it does not turn AI on or publish anything. Change it in **Settings → Getting started** whenever you like.

## Preview stays local

Preview lets you inspect a creation without publishing it. For a Site Crux, the first run may download build dependencies. A failed preview or build should show a useful error; fix it before publishing.

## Test locally first (optional)

For websites and declared static editions, Share → **Test locally first** → **Publish to local test Garden** saves a separate built website copy. No account is needed. Open the test website or browse **Local test Garden** from Home. Changes to your project do not appear there until you choose **Update local test copy**.

This is a staging area on **this computer only**, available while Crux Garden is running. Test copies survive app restart; their local addresses may change. These are not internet links. Each website has its own origin, separate from the Garden index and your app.

Hosted visitor accounts, Functions and form submissions are not available. The test server blocks cross-origin API requests and form submission, but external images/fonts may still connect to the internet. Verify hosted features separately before treating a site as ready. The Notes visitor preview also builds its selected public notes on this local test server. Other specialized creation tools continue to use their own preview/export flows.

Removing a local test copy leaves your editable project and live website unchanged. Test copies are not backups and are not included in project or Garden archives. Each test copy supports up to 5,000 files and 100 MB.

## Review the public result

Before Share, check your text, images, links, and mobile layout. Remove private details. Consider the conversation and source information exposed by **How was this made?**, as well as the visible site.

Use a separate visitor browser after publishing to verify what someone else actually sees.

## Publish to crux.garden

Open **Share**, connect your account if needed, and follow the publication controls. A Site Crux is built before its public output is uploaded. A failed build does not count as a successful publication.

The published address is separate from the local preview. Changes on disk are not automatically proof that the public site has updated; publish the new result and inspect the live link.

## Keep a private copy

A public site contains the publishable output, not everything in your Garden. Export a private archive for recovery and continued editing.

## Unshare

Use the app’s Unshare action when you want to remove public access. Wait for confirmation. If it reports failure, the site may still be available; retry or investigate before assuming it is private.

## Authentication in published Cruxes

Published Cruxes can use the embedded library’s authentication and permitted Store/Function APIs. Login itself is unmetered; Store and Function work counts toward the publisher’s API usage. Visitor credentials are scoped to the published Crux and approved origin. See [CLI and API](../../reference/cli-api/) for the distinction from account administration.

## Share and install tools and Moods

Explore and creator profiles distinguish **Creations**, **Tools**, and **Moods**. A tool installs an editor you can use to create your own Cruxes. A Mood installs a look and sound for your Garden. Neither requires AI.

On a tool or Mood’s published page, choose **Open in Garden** to review and install it in the desktop app, or download its file for later. In the app, choose **Add Crux → Import Crux, tool or Mood** and select the file:

- **`.cruxtool`** installs a reusable editor. It then appears in Add Crux.
- **`.cruxmood`** imports a Mood to your library; preview it before keeping it for your Garden.
- **`.crux`** imports a private project archive for continued editing.

To make your own tool, choose **Make a tool** in Add Crux. The starter includes an editor, a manifest and instructions. Review its files before exporting or publishing; other people receive the editor package you share. Downloaded tools cannot add native host commands or AI adapters to the app.

Publishing and making a listing discoverable are separate controls. Enable **Discoverable** when you want a publication to appear in Explore. Verify the shared link in a visitor browser and try installing it in a separate Garden.

## Open a downloaded package

With the desktop app installed, open a `.crux`, `.cruxtool`, or `.cruxmood` file from your file manager. Select or create a Garden, then review the package name and destination before choosing **Import package**. Cancel leaves your Garden unchanged. You can also use **Add Crux → Import Crux, tool or Mood** if your operating system has not associated the file with Crux Garden.

Tool downloads in Explore show received bytes and a **Cancel** button. If a connection stalls or a package is damaged, retry from the listing. Canceling an update keeps the previously installed tool and your existing projects.

In the Mood library, **Unshare** removes public access while keeping your local Mood. **Delete locally** removes your library copy; it does not take down a public listing. Unshare first if you want both removed.

## Close a hosted account

In **Settings → Account**, expand **Close hosted account…**. The app first checks that your server supports the cleanup workflow. Export any hosted Store data you want to keep, read the consequences, type the requested phrase and confirm the account and server.

Closure stops subscriptions, removes public sites and custom-domain routes, and removes hosted backups before closing access. Your local Garden, files, history and installed tools stay on this device. Copies other people downloaded remain theirs; database, operational and billing records may be retained. CDN removal may take time.

If closure reports a failure, some cleanup may already have happened. Retry to finish. Disconnecting an account only removes this device's connection and is a separate action.
