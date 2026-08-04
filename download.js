import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');
const STATE_FILE = path.join(__dirname, '.download-state.json');

const inputFile = process.argv.slice(2).find(arg => !arg.startsWith('--'));
if (!inputFile) {
  console.error('Usage: node download.js <filename> [--imageonly] [--videoonly] [--appendonly]\n  e.g. node download.js 2ffc7fb8-8a97-45c4-94ff-c27499aba925_9b0ac515-3fe9-460c-bac8-7aa79a8f7753.json');
  process.exit(1);
}
const IMAGE_ONLY = process.argv.includes('--imageonly');
const VIDEO_ONLY = process.argv.includes('--videoonly');
const APPEND_ONLY = process.argv.includes('--appendonly');
const OUTPUT_FILE = path.join(__dirname, 'output', inputFile);

function getArtistIdFromFilename(filename) {
  const base = filename.replace(/\.json$/i, '');
  const [artistId] = base.split('_');
  return artistId || base;
}

function sanitizeFilename(name) {
  return name
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}

function downloadVideo(url, outputPath) {
  try {
    execSync(`yt-dlp -o "${outputPath}.%(ext)s" "${url}"`, { stdio: 'inherit' });
    return true;
  } catch (e) {
    console.error(`  ✗ Video download failed: ${e.message}`);
    return false;
  }
}

function downloadImage(url, outputPath) {
  try {
    execSync(`curl -sL -o "${outputPath}" "${url}"`, { stdio: 'inherit' });
    return true;
  } catch (e) {
    console.error(`  ✗ Image download failed: ${e.message}`);
    return false;
  }
}

function loadDownloadState() {
  if (!fs.existsSync(STATE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveDownloadState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function main() {
  if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

  const posts = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
  const state = loadDownloadState();
  const artistId = getArtistIdFromFilename(inputFile);
  const fileState = state?.[artistId] || state?.[inputFile] || {};
  const rawDownloadedIds = fileState.downloadedIds;
  // Backward compatible read:
  // - new format: string[]
  // - old format: { [id]: true }
  const downloadedIdSet = Array.isArray(rawDownloadedIds)
    ? new Set(rawDownloadedIds.map(id => String(id)))
    : rawDownloadedIds && typeof rawDownloadedIds === 'object'
      ? new Set(Object.keys(rawDownloadedIds))
      : new Set();
  const legacyTotal = Number(fileState.totalPosts || 0);

  let targetPosts = posts;
  if (APPEND_ONLY) {
    if (downloadedIdSet.size > 0) {
      targetPosts = posts.filter(p => !downloadedIdSet.has(String(p.id || '')));
      console.log(`Append-only mode (id-based): total=${posts.length}, downloaded=${downloadedIdSet.size}, new=${targetPosts.length}`);
    } else if (legacyTotal > 0) {
      const start = Math.max(0, Math.min(legacyTotal, posts.length));
      targetPosts = posts.slice(start);
      console.log(`Append-only mode (legacy fallback): total=${posts.length}, previousCount=${legacyTotal}, new=${targetPosts.length}`);
      console.log('  Note: current state has no downloadedIds yet, using old totalPosts fallback for this run.');
    } else {
      console.log(`Append-only mode (id-based): total=${posts.length}, downloaded=0, new=${posts.length}`);
      console.log('  Note: no prior download state found for this file, so all entries are treated as new this run.');
    }
  }

  const withMedia = targetPosts.filter(p => p.videoUrl || p.imageUrls);
  const newlyDownloadedIds = new Set();

  console.log(`Found ${withMedia.length} posts with media.\n`);

  for (let i = 0; i < withMedia.length; i++) {
    const post = withMedia[i];
    let postSuccess = true;
    const date = post.published_at.slice(0, 10);
    const title = sanitizeFilename(post.title);
    const baseName = `${date}_${title}`;

    console.log(`[${i + 1}/${withMedia.length}] ${baseName}`);

    // Download videos
    if (post.videoUrl && !IMAGE_ONLY) {
      const urls = Array.isArray(post.videoUrl) ? post.videoUrl : [post.videoUrl];
      for (let vi = 0; vi < urls.length; vi++) {
        const suffix = urls.length > 1 ? `_${vi + 1}` : '';
        const outputPath = path.join(DOWNLOAD_DIR, `${baseName}${suffix}`);
        const ok = downloadVideo(urls[vi], outputPath);
        if (!ok) postSuccess = false;
      }
    }

    // Download images
    if (post.imageUrls && post.imageUrls.length > 0 && !VIDEO_ONLY) {
      const folderPath = path.join(DOWNLOAD_DIR, baseName);
      if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

      for (const img of post.imageUrls) {
        const imgTitle = sanitizeFilename(img.title || '');
        // Use image title as filename, fallback to URL basename
        const urlBasename = path.basename(new URL(img.url).pathname);
        const imgFilename = imgTitle ? `${imgTitle}${path.extname(urlBasename) || '.jpg'}` : urlBasename;
        const imgPath = path.join(folderPath, imgFilename);

        console.log(`  📷 ${imgFilename}`);
        const ok = downloadImage(img.url, imgPath);
        if (!ok) postSuccess = false;
      }
    }

    if (postSuccess && post.id) {
      newlyDownloadedIds.add(String(post.id));
    }
  }

  const nextDownloadedIdSet = new Set(downloadedIdSet);
  for (const id of newlyDownloadedIds) {
    nextDownloadedIdSet.add(id);
  }
  const nextDownloadedIds = [...nextDownloadedIdSet];

  state[artistId] = {
    downloadedIds: nextDownloadedIds,
    updatedAt: new Date().toISOString(),
  };
  if (state[inputFile] && inputFile !== artistId) {
    delete state[inputFile];
  }
  saveDownloadState(state);

  console.log('\n✅ All done!');
}

main();
