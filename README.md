# SaveMyselfScripts

Scrape video/image URLs from bwithu.app posts and download via yt-dlp.

## Setup

```bash
npm install
```

Requires [yt-dlp](https://github.com/yt-dlp/yt-dlp) installed globally for downloading.

## Credentials (auth.json)

Login credentials are stored in `auth.json`. The scraper reads cookies, localStorage, and sessionStorage from this file.

### How to update credentials

When your session expires, refresh `auth.json` with new values:

1. Open Chrome, go to `https://service.bwithu.app` and log in
2. Open DevTools (F12)
3. **Cookies**: Go to `Application > Cookies > https://service.bwithu.app`, copy the values for:
   - `ch-session-*` (the most important one, this is your login session)
   - `ch-veil-id`
   - `_ga`, `_ga_*` (optional, for analytics)
4. **localStorage**: Go to `Application > Local Storage > https://service.bwithu.app`, copy all `Channel.*` and `FlutterSecureStorage*` entries
5. **sessionStorage**: Go to `Application > Session Storage > https://service.bwithu.app`, copy all `Channel.draft_*` entries
6. Update the corresponding values in `auth.json`

`auth.json` structure:

```json
{
  "cookies": [
    { "name": "ch-session-130170", "value": "...", "domain": ".bwithu.app", "path": "/" },
    { "name": "ch-veil-id", "value": "...", "domain": ".bwithu.app", "path": "/" }
  ],
  "localStorage": {
    "FlutterSecureStorage": "...",
    "FlutterSecureStorage.loginInput": "...",
    "FlutterSecureStorage.loginOutput": "..."
  },
  "sessionStorage": {
    "Channel.draft_command": "...",
    "Channel.draft_form_value": "...",
    "Channel.draft_message": "..."
  }
}
```

## Usage

### 1. Scrape post list and extract Vimeo URLs

```bash
# Full mode (overwrite existing output)
node index.js "https://service.bwithu.app/posts?a=<ARTIST_ID>&t=<TAG_ID>"

# Incremental mode (skip already-processed posts, append new ones)
node index.js "https://service.bwithu.app/posts?a=<ARTIST_ID>&t=<TAG_ID>" --incremental
```

Output is saved to `output/<ARTIST_ID>_<TAG_ID>.json`.

### 2. Test image filtering on a single page

Use `testImages.js` to preview which images will be collected (and which will be rejected) before running a full scrape:

```bash
node testImages.js "<post-url>"
```

Example:

```bash
node testImages.js "https://service.bwithu.app/movies/05b43bc1-3478-4b9d-9e2d-b8cdd123eba3?a=2ffc7fb8-8a97-45c4-94ff-c27499aba925&from=/posts?a=2ffc7fb8-8a97-45c4-94ff-c27499aba925&t=7a0e2244-9200-4e8f-b671-2baee2ff77ff"
```

Output shows three sections:
- **RAW IMAGES** — all `<img>` elements found on the page
- **FILTERED IMAGES** — images that pass the filter (these get saved)
- **REJECTED** — images excluded by the filter rules

Filter rules are in `imageFilter.js`. Current rules:
- Exclude images with width <= 100px
- Exclude profile avatars (`*-profile.jpg`)
- Exclude video thumbnails (`alt="video thumbnail"`)

### 3. Download videos and images

```bash
node download.js <filename> [--imageonly] [--videoonly]
```

`<filename>` is the JSON file inside `output/`, e.g.:

```bash
node download.js 2ffc7fb8-8a97-45c4-94ff-c27499aba925_9b0ac515-3fe9-460c-bac8-7aa79a8f7753.json
node download.js 2ffc7fb8-8a97-45c4-94ff-c27499aba925_9b0ac515-3fe9-460c-bac8-7aa79a8f7753.json --imageonly
node download.js 2ffc7fb8-8a97-45c4-94ff-c27499aba925_9b0ac515-3fe9-460c-bac8-7aa79a8f7753.json --videoonly
```

Downloads are saved to `downloads/`:
- Videos: `yyyy-mm-dd_title.mp4` (multiple videos per post get `_1`, `_2` suffix)
- Images: `yyyy-mm-dd_title/` folder, each image named by its original title

## Project Structure

```
savemyselfscripts/
├── auth.json       # Login credentials (cookies, localStorage, sessionStorage)
├── index.js        # Scraper: GraphQL + Puppeteer -> output JSON
├── imageFilter.js  # Image filtering rules (edit to adjust which images are collected)
├── testImages.js   # Test image filtering on a single post page
├── download.js     # Downloader: yt-dlp for videos, curl for images
├── package.json
├── output/         # Scraped JSON files
└── downloads/      # Downloaded media
```

## Notes

- Browser launches in visible mode (`headless: false`) for debugging. Change to `true` in `index.js` once stable.
- Posts tagged with `NEWS` or `INFORMATION` (case-insensitive) are automatically skipped.
- `ch-session-*` cookie expires in ~30 days. When scraping fails with auth errors, update `auth.json`.
- Incremental mode matches by post ID, so re-running only processes new posts.
- Add `auth.json` to `.gitignore` to avoid committing credentials.

## Changelog / Test References

- **2026-05-19**: Image collection verified working with Flutter Web Shadow DOM. Test command:
  ```bash
  node testImages.js "https://service.bwithu.app/notes/f037c375-bf85-4488-aa23-534c3cb402d4?a=2ffc7fb8-8a97-45c4-94ff-c27499aba925&from=/posts?a=2ffc7fb8-8a97-45c4-94ff-c27499aba925&t=f223fa3f-2260-429e-83ea-63e49528a4fe"
  ```
  Key findings: Flutter renders `<img>` inside `<flt-glass-pane>` Shadow DOM. Scroll uses `page.mouse.wheel()` since Flutter uses internal scroll containers, not `window.scrollBy`.
