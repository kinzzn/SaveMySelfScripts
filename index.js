import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { filterImages, collectRawImages } from './imageFilter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INCREMENTAL = process.argv.includes('--incremental');

// ============ CONFIG ============
const GRAPHQL_URL = 'https://api.bwithu.app/v1/graphql';
const BASE_URL = 'https://service.bwithu.app';

// Parse ARTIST_ID and TAG_ID from input URL
const urlArg = process.argv.find(arg => arg.startsWith('http'));
if (!urlArg) {
  console.error('Usage: node index.js <list-url> [--incremental]\n  e.g. node index.js "https://service.bwithu.app/posts?a=xxx&t=yyy"');
  process.exit(1);
}
const parsedUrl = new URL(urlArg);
const ARTIST_ID = parsedUrl.searchParams.get('a');
const TAG_ID = parsedUrl.searchParams.get('t');
if (!ARTIST_ID || !TAG_ID) {
  console.error('Error: URL must contain both "a" (artist_id) and "t" (tag_id) parameters.');
  process.exit(1);
}

const OUTPUT_DIR = path.join(__dirname, 'output');
const OUTPUT_FILE = path.join(OUTPUT_DIR, `${ARTIST_ID}_${TAG_ID}.json`);

// Load credentials from auth.json
const AUTH_FILE = path.join(__dirname, 'auth.json');
if (!fs.existsSync(AUTH_FILE)) {
  console.error('Missing auth.json. See README.md for how to create it.');
  process.exit(1);
}
const auth = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
const COOKIES = auth.cookies;
const LOCAL_STORAGE = auth.localStorage;
const SESSION_STORAGE = auth.sessionStorage;

// ============ HELPERS ============

async function fetchAllPosts(page) {
  const BATCH_SIZE = 10;
  let offset = 0;
  let allPosts = [];

  while (true) {
    const query = `
      query GetPosts($artist_id: uuid!, $tag_id: uuid!, $limit: Int!, $offset: Int!) {
        posts(
          where: {
            artist_id: {_eq: $artist_id},
            post_tags: {tag_id: {_eq: $tag_id}}
          },
          order_by: {published_at: desc},
          limit: $limit,
          offset: $offset
        ) {
          id
          title
          title_en
          published_at
          thumbnail_url
          post_type
          post_tags {
            tag { title }
          }
        }
        posts_aggregate(
          where: {
            artist_id: {_eq: $artist_id},
            post_tags: {tag_id: {_eq: $tag_id}}
          }
        ) {
          aggregate { count }
        }
      }
    `;

    const res = await page.evaluate(async (url, query, variables, cookie) => {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ query, variables }),
      });
      return r.json();
    }, GRAPHQL_URL, query, {
      artist_id: ARTIST_ID,
      tag_id: TAG_ID,
      limit: BATCH_SIZE,
      offset,
    }, COOKIES.map(c => `${c.name}=${c.value}`).join('; '));

    const posts = res?.data?.posts || [];
    allPosts = allPosts.concat(posts);
    const total = res?.data?.posts_aggregate?.aggregate?.count || 0;

    console.log(`  Fetched ${allPosts.length}/${total} posts`);

    if (allPosts.length >= total || posts.length === 0) break;
    offset += BATCH_SIZE;
  }

  return allPosts;
}

async function getMediaFromPost(page, postId, postType) {
  const TYPE_PATH_MAP = { movie: 'movies', blog: 'notes' };
  const typePath = TYPE_PATH_MAP[postType] || `${postType}s`;
  const postUrl = `${BASE_URL}/${typePath}/${postId}?a=${ARTIST_ID}&from=/posts?a=${ARTIST_ID}&t=${TAG_ID}`;
  console.log(`  Opening: ${postUrl}`);

  await page.goto(postUrl, { waitUntil: 'networkidle2', timeout: 60000 });

  // Wait for initial content (check both regular DOM and Flutter Shadow DOM)
  for (let i = 0; i < 20; i++) {
    const hasContent = await page.evaluate(() => {
      const gp = document.querySelector('flt-glass-pane');
      const sr = gp && gp.shadowRoot;
      if (sr) {
        return sr.querySelector('iframe[src*="player.vimeo.com"]') || sr.querySelector('img');
      }
      return document.querySelector('iframe[src*="player.vimeo.com"]') || document.querySelector('img');
    });
    if (hasContent) break;
    await new Promise(r => setTimeout(r, 1000));
  }

  // Collect all Vimeo iframe URLs (from Shadow DOM)
  const videoUrls = await page.evaluate(() => {
    const results = [];
    // Check regular DOM
    document.querySelectorAll('iframe[src*="player.vimeo.com"]').forEach(f => results.push(f.src));
    // Check Flutter Shadow DOM
    const gp = document.querySelector('flt-glass-pane');
    if (gp && gp.shadowRoot) {
      gp.shadowRoot.querySelectorAll('iframe[src*="player.vimeo.com"]').forEach(f => results.push(f.src));
    }
    return results;
  });

  // Scroll and collect images using mouse wheel (Flutter Web internal scroll)
  const seenUrls = new Set();
  const allRawImages = [];
  let noNewCount = 0;

  while (true) {
    await new Promise(r => setTimeout(r, 10000));
    const currentImages = await page.evaluate(collectRawImages);
    const newImages = currentImages.filter(img => !seenUrls.has(img.url));
    newImages.forEach(img => seenUrls.add(img.url));
    allRawImages.push(...newImages);

    if (newImages.length > 0 && newImages.every(img => /-profile\.\w+$/.test(img.url))) break;

    if (newImages.length === 0) {
      noNewCount++;
      if (noNewCount >= 3) break;
    } else {
      noNewCount = 0;
    }

    await page.mouse.move(160, 284);
    await page.mouse.wheel({ deltaY: 500 });
  }

  // Deduplicate and filter
  const uniqueMap = new Map();
  allRawImages.forEach(img => { if (!uniqueMap.has(img.url)) uniqueMap.set(img.url, img); });
  const imageUrls = filterImages([...uniqueMap.values()]).map(img => ({
    url: img.url,
    title: img.title || img.alt || '',
  }));

  return { videoUrls, imageUrls };
}

// ============ MAIN ============

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log('Launching browser...');
  const browser = await puppeteer.launch({ headless: false, defaultViewport: null, args: ['--window-size=320,568'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 320, height: 568 });

  // Set cookies
  await page.setCookie(...COOKIES);

  // Navigate to set localStorage/sessionStorage
  const LIST_URL = `${BASE_URL}/posts?a=${ARTIST_ID}&t=${TAG_ID}`;
  await page.goto(LIST_URL, { waitUntil: 'networkidle2' });
  await page.evaluate((ls, ss) => {
    for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v);
    for (const [k, v] of Object.entries(ss)) sessionStorage.setItem(k, v);
  }, LOCAL_STORAGE, SESSION_STORAGE);

  // Reload to apply auth
  await page.reload({ waitUntil: 'networkidle2' });

  console.log('Fetching post list via GraphQL...');
  const posts = await fetchAllPosts(page);
  console.log(`Found ${posts.length} posts total.\n`);

  // For each post, open detail page and grab Vimeo URL
  // In incremental mode, load existing results and skip already-processed posts
  let results = [];
  const existingIds = new Set();
  if (INCREMENTAL && fs.existsSync(OUTPUT_FILE)) {
    results = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
    results.forEach(p => existingIds.add(p.id));
    console.log(`Incremental mode: ${existingIds.size} posts already in output, skipping.\n`);
  } else {
    console.log('Full mode: starting fresh.\n');
  }

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    console.log(`[${i + 1}/${posts.length}] ${post.title}`);

    // Skip posts tagged with NEWS/INFORMATION
    const tags = (post.post_tags || []).map(pt => pt.tag?.title || '');
    const SKIP_TAGS = ['news', 'information'];

    if (existingIds.has(post.id)) {
      console.log(`  ⏭ Already processed, skipping.`);
      continue;
    }

    const matchedSkip = tags.find(t => SKIP_TAGS.includes(t.toLowerCase()));
    if (matchedSkip) {
      console.log(`  ⏭ Skipped (${matchedSkip} tag)`);
      results.push({ ...post, videoUrl: null, skipped: matchedSkip });
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
      continue;
    }

    try {
      const { videoUrls, imageUrls } = await getMediaFromPost(page, post.id, post.post_type);
      if (videoUrls.length > 0) {
        console.log(`  ✓ ${videoUrls.length} video(s)`);
      } else {
        console.log(`  ✗ No Vimeo iframe found`);
      }
      if (imageUrls.length > 0) {
        console.log(`  ✓ ${imageUrls.length} image(s)`);
      }

      results.push({
        ...post,
        videoUrl: videoUrls.length === 1 ? videoUrls[0] : videoUrls.length > 1 ? videoUrls : null,
        imageUrls: imageUrls.length > 0 ? imageUrls : null,
      });
    } catch (e) {
      console.error(`  ✗ Error processing post: ${e.message}`);
      results.push({ ...post, videoUrl: null, imageUrls: null, error: e.message });
    }

    // Save incrementally
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));

    await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`\n✅ Done! Output saved to output/${ARTIST_ID}_${TAG_ID}.json (${results.length} posts)`);
  await browser.close();
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
