import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');

const inputFile = process.argv[2];
if (!inputFile) {
  console.error('Usage: node download.js <filename>\n  e.g. node download.js 2ffc7fb8-8a97-45c4-94ff-c27499aba925_9b0ac515-3fe9-460c-bac8-7aa79a8f7753.json');
  process.exit(1);
}
const OUTPUT_FILE = path.join(__dirname, 'output', inputFile);

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
  } catch (e) {
    console.error(`  ✗ Video download failed: ${e.message}`);
  }
}

function downloadImage(url, outputPath) {
  try {
    execSync(`curl -sL -o "${outputPath}" "${url}"`, { stdio: 'inherit' });
  } catch (e) {
    console.error(`  ✗ Image download failed: ${e.message}`);
  }
}

async function main() {
  if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

  const posts = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
  const withMedia = posts.filter(p => p.videoUrl || p.imageUrls);

  console.log(`Found ${withMedia.length} posts with media.\n`);

  for (let i = 0; i < withMedia.length; i++) {
    const post = withMedia[i];
    const date = post.published_at.slice(0, 10);
    const title = sanitizeFilename(post.title);
    const baseName = `${date}_${title}`;

    console.log(`[${i + 1}/${withMedia.length}] ${baseName}`);

    // Download videos
    if (post.videoUrl) {
      const urls = Array.isArray(post.videoUrl) ? post.videoUrl : [post.videoUrl];
      for (let vi = 0; vi < urls.length; vi++) {
        const suffix = urls.length > 1 ? `_${vi + 1}` : '';
        const outputPath = path.join(DOWNLOAD_DIR, `${baseName}${suffix}`);
        downloadVideo(urls[vi], outputPath);
      }
    }

    // Download images
    if (post.imageUrls && post.imageUrls.length > 0) {
      const folderPath = path.join(DOWNLOAD_DIR, baseName);
      if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

      for (const img of post.imageUrls) {
        const imgTitle = sanitizeFilename(img.title || '');
        // Use image title as filename, fallback to URL basename
        const urlBasename = path.basename(new URL(img.url).pathname);
        const imgFilename = imgTitle ? `${imgTitle}${path.extname(urlBasename) || '.jpg'}` : urlBasename;
        const imgPath = path.join(folderPath, imgFilename);

        console.log(`  📷 ${imgFilename}`);
        downloadImage(img.url, imgPath);
      }
    }
  }

  console.log('\n✅ All done!');
}

main();
