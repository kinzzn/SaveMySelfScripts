# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A Puppeteer-based scraper for bwithu.app that extracts Vimeo video URLs and images from posts, then downloads them via yt-dlp/curl. The target site uses Flutter Web, rendering content inside `<flt-glass-pane>` Shadow DOM.

## Commands

```bash
# Install dependencies
npm install

# Scrape posts (requires auth.json with valid session)
node index.js "<url-with-a-and-t-params>" [--incremental]

# Test image filtering on a single post
node testImages.js "<post-url>"

# Download media from scraped JSON
node download.js <output-filename.json>
```

## Architecture

- **index.js** — Main scraper. Takes a URL with `a` (artist_id) and `t` (tag_id) params. Uses GraphQL to fetch post list, then opens each post with Puppeteer to extract Vimeo iframes and images. Saves results incrementally to `output/`.
- **imageFilter.js** — Exported filter functions (`filterImages`, `collectRawImages`) used by both index.js and testImages.js. `collectRawImages` runs inside `page.evaluate()` to gather images from both regular DOM and Flutter's Shadow DOM.
- **download.js** — Reads a scraped JSON from `output/`, downloads videos with yt-dlp and images with curl to `downloads/`.
- **testImages.js** — Debug tool to preview image collection/filtering on a single post page.
- **auth.json** — Credentials file (cookies, localStorage, sessionStorage). Not committed. Session expires ~30 days.

## Key Technical Details

- ESM modules (`"type": "module"` in package.json)
- Flutter Web pages require scrolling via `page.mouse.wheel()` (not `window.scrollBy`)
- Images are inside `flt-glass-pane` Shadow DOM — must query `glassPane.shadowRoot`
- Posts tagged NEWS/INFORMATION are auto-skipped
- External dependency: `yt-dlp` must be installed globally for downloads
