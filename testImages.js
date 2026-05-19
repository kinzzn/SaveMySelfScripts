// Standalone script to test image filtering on a single post page.
// Usage: node testImages.js <post-url>
// e.g.   node testImages.js "https://service.bwithu.app/movies/05b43bc1-...?a=...&from=..."

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { filterImages, collectRawImages } from './imageFilter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = path.join(__dirname, 'auth.json');

const postUrl = process.argv[2];
if (!postUrl) {
  console.error('Usage: node testImages.js <post-url>');
  process.exit(1);
}

const auth = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));

async function main() {
  const browser = await puppeteer.launch({ headless: false, defaultViewport: null, args: ['--window-size=320,568'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 320, height: 568 });

  await page.setCookie(...auth.cookies);
  await page.goto(postUrl.split('/movies/')[0] || 'https://service.bwithu.app', { waitUntil: 'networkidle2' });
  await page.evaluate((ls, ss) => {
    for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v);
    for (const [k, v] of Object.entries(ss)) sessionStorage.setItem(k, v);
  }, auth.localStorage, auth.sessionStorage);

  console.log(`Opening: ${postUrl}`);
  await page.goto(postUrl, { waitUntil: 'networkidle2', timeout: 60000 });

  // Scroll through the page, collecting images at each position
  // Flutter Web uses an internal scroll container, so we simulate mouse wheel events
  // Wait 10s per scroll position for lazy-loaded content
  // Stop when all newly visible images are profile avatars
  const allRawImages = [];
  const seenUrls = new Set();
  let scrollPosition = 0;
  let noNewCount = 0;

  while (true) {
    console.log(`\n--- Scroll position: ${scrollPosition} ---`);
    await new Promise(r => setTimeout(r, 10000));

    const currentImages = await page.evaluate(collectRawImages);
    const newImages = currentImages.filter(img => !seenUrls.has(img.url));
    newImages.forEach(img => seenUrls.add(img.url));

    console.log(`  Found ${currentImages.length} images total, ${newImages.length} new`);
    newImages.forEach((img, i) => {
      console.log(`    [new] width=${img.width} alt="${img.alt}" url=${img.url}`);
    });

    allRawImages.push(...newImages);

    // Check if all new images are profile avatars — if so, we've hit the comments-only zone
    if (newImages.length > 0 && newImages.every(img => /-profile\.\w+$/.test(img.url))) {
      console.log(`\n  All new images are profile avatars. Stopping scroll.`);
      break;
    }

    // If no new images found for 2 consecutive scrolls, stop
    if (newImages.length === 0) {
      noNewCount++;
      if (noNewCount >= 3) {
        console.log(`\n  No new images for 3 scrolls. Stopping.`);
        break;
      }
    } else {
      noNewCount = 0;
    }

    // Simulate mouse wheel scroll (works with Flutter Web's internal scroll container)
    await page.mouse.move(160, 284); // center of viewport
    await page.mouse.wheel({ deltaY: 500 });

    scrollPosition++;
  }

  // Deduplicate
  const uniqueMap = new Map();
  allRawImages.forEach(img => { if (!uniqueMap.has(img.url)) uniqueMap.set(img.url, img); });
  const rawImages = [...uniqueMap.values()];

  console.log(`\n--- RAW IMAGES (${rawImages.length} unique) ---`);
  rawImages.forEach((img, i) => {
    console.log(`  [${i}] width=${img.width} alt="${img.alt}" url=${img.url}`);
  });

  // Apply filter
  const filtered = filterImages(rawImages);
  console.log(`\n--- FILTERED IMAGES (${filtered.length}) ---`);
  filtered.forEach((img, i) => {
    console.log(`  [${i}] alt="${img.alt}" title="${img.title}" url=${img.url}`);
  });

  // Show rejected
  const rejectedUrls = new Set(rawImages.map(i => i.url));
  filtered.forEach(i => rejectedUrls.delete(i.url));
  console.log(`\n--- REJECTED (${rejectedUrls.size}) ---`);
  [...rejectedUrls].forEach(url => console.log(`  ${url}`));

  await browser.close();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
