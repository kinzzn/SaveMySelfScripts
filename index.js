import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_FILE = path.join(__dirname, `${ARTIST_ID}_${TAG_ID}.json`);

// ============ CONFIG ============
const GRAPHQL_URL = 'https://api.bwithu.app/v1/graphql';
const BASE_URL = 'https://service.bwithu.app';
const ARTIST_ID = '2ffc7fb8-8a97-45c4-94ff-c27499aba925';
const TAG_ID = '9b0ac515-3fe9-460c-bac8-7aa79a8f7753';// streaming '7a0e2244-9200-4e8f-b671-2baee2ff77ff';


const COOKIES = [
  { name: '_ga', value: 'GA1.1.1028807587.1779082388', domain: '.bwithu.app', path: '/' },
  { name: '_ga_9YDJETWEK1', value: 'GS2.1.s1779082387$o1$g1$t1779085376$j60$l0$h0', domain: '.bwithu.app', path: '/' },
  { name: 'ch-session-130170', value: 'eyJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzZXMiLCJleHAiOjE3ODE2NzczNzQsImlhdCI6MTc3OTA4NTM3NCwia2V5IjoiMTMwMTcwLTY2OTNiOGIxYmIyMjMyNzQxYjg0In0.3mHfLWI6fE6P_L9sMn3ACREVHW8kHrrOjbCoBeKTthI', domain: '.bwithu.app', path: '/' },
  { name: 'ch-veil-id', value: '38aecb37-716b-43cb-ab13-bab8720a63aa', domain: '.bwithu.app', path: '/' },
];

const LOCAL_STORAGE = {
  'Channel.ch-veil-id': '38aecb37-716b-43cb-ab13-bab8720a63aa',
  'Channel.last_seen_tab_id_': 'c1b8235a-d194-4a15-aa2e-bca8999748a2',
  'Channel.last_seen_tab_id_130170': 'c1b8235a-d194-4a15-aa2e-bca8999748a2',
  'Channel.notification_sound_': 'true',
  'Channel.notification_sound_130170': 'true',
  'Channel.plugin_info.485b949d-69ea-4e2a-a60e-ab5982716225': '{"channelId":"130170"}',
  'FlutterSecureStorage': 'D4J5fliksS6ghKeCDvqzHwpiO8Djf7NIhDHCbbMVAyU=',
  'FlutterSecureStorage.loginInput': '3n2scO0fsKD5CGrA.2xWKjBhhTcRHruSpBwjThXMjHLajbWOk6gWVlfzrw4GIJPUKEg1MCbjYA8uqvgG5Di90ec9WcGAWBDWNNsAD72tEiVbnueVspYqmuAWNUd0=',
  'FlutterSecureStorage.loginOutput': 'jlFjhY+Uvu08jMGL.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',
};

const SESSION_STORAGE = {
  'Channel.draft_command': '{"userId":"6693b8b1bb2232741b84","messages":{}}',
  'Channel.draft_form_value': '{"id":"6693b8b1bb2232741b84","forms":{}}',
  'Channel.draft_message': '{"userId":"6693b8b1bb2232741b84","messages":{}}',
};

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
            post_type: {_eq: "movie"},
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
          post_tags {
            tag { title }
          }
        }
        posts_aggregate(
          where: {
            artist_id: {_eq: $artist_id},
            post_type: {_eq: "movie"},
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

async function getMediaFromPost(page, postId) {
  const postUrl = `${BASE_URL}/movies/${postId}?a=${ARTIST_ID}&from=/posts?a=${ARTIST_ID}&t=${TAG_ID}`;
  console.log(`  Opening: ${postUrl}`);

  await page.goto(postUrl, { waitUntil: 'networkidle2', timeout: 30000 });

  // Wait for content to load
  for (let i = 0; i < 20; i++) {
    const hasContent = await page.evaluate(() => {
      return document.querySelector('iframe[src*="player.vimeo.com"]') ||
             document.querySelector('img');
    });
    if (hasContent) break;
    await new Promise(r => setTimeout(r, 1000));
  }

  // Collect all Vimeo iframe URLs
  const videoUrls = await page.evaluate(() => {
    const iframes = document.querySelectorAll('iframe[src*="player.vimeo.com"]');
    return [...iframes].map(f => f.src);
  });

  // Collect all images (exclude icons/tiny images)
  const imageUrls = await page.evaluate(() => {
    const imgs = document.querySelectorAll('img');
    return [...imgs]
      .filter(img => img.naturalWidth > 100 && img.src.startsWith('http'))
      .map(img => ({ url: img.src, title: img.getAttribute('title') || img.getAttribute('alt') || '' }));
  });

  return { videoUrls, imageUrls };
}

// ============ MAIN ============

async function main() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

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
  const results = [];

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    console.log(`[${i + 1}/${posts.length}] ${post.title}`);

    // Skip posts tagged with NEWS
    const tags = (post.post_tags || []).map(pt => pt.tag?.title || '');
    if (tags.some(t => t.toLowerCase() === 'news')) {
      console.log(`  ⏭ Skipped (NEWS tag)`);
      results.push({ ...post, videoUrl: null, skipped: 'NEWS' });
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
      continue;
    }

    const { videoUrls, imageUrls } = await getMediaFromPost(page, post.id);
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

    // Save incrementally
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));

    await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`\n✅ Done! Output saved to ${ARTIST_ID}_${TAG_ID}.json (${results.length} posts)`);
  await browser.close();
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
