---
title: "Preview and Share"
description: "Private while you work. Public when you choose."
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
