// Image filtering rules for bwithu.app post pages
// Edit this file to adjust which images are collected from post detail pages.

/**
 * Filter function run inside Puppeteer's page.evaluate().
 * Receives a list of raw image objects and returns the filtered list.
 *
 * Each image object has: { url, alt, title, width }
 */
export function filterImages(images) {
  return images.filter(img => {
    console.log(`Checking image: img.width=${img.width} alt="${img.alt}" url=${img.url}`);
    // Skip tiny images (icons, avatars in UI)
    if (img.width <= 100) return false;

    // Skip non-http sources
    if (!img.url.startsWith('http')) return false;

    // Skip profile avatars (e.g. ...-profile.jpg)
    if (/-profile\.\w+$/.test(img.url)) return false;

    // Skip video thumbnails
    if (img.alt === 'video thumbnail') return false;

    return true;
  });
}

/**
 * The evaluate function to run inside Puppeteer.
 * Returns raw image data from the page DOM, including Flutter's Shadow DOM.
 */
export function collectRawImages() {
  const results = [];

  // Collect from regular DOM
  document.querySelectorAll('img').forEach(img => {
    if (img.src) results.push({ url: img.src, alt: img.getAttribute('alt') || '', title: img.getAttribute('title') || '', width: img.naturalWidth || img.width });
  });

  // Collect from Flutter's Shadow DOM (flt-glass-pane > shadowRoot)
  const glassPane = document.querySelector('flt-glass-pane');
  if (glassPane && glassPane.shadowRoot) {
    glassPane.shadowRoot.querySelectorAll('img').forEach(img => {
      if (img.src) results.push({ url: img.src, alt: img.getAttribute('alt') || '', title: img.getAttribute('title') || '', width: img.naturalWidth || img.width || parseInt(img.style.width) || 0 });
    });
  }

  return results;
}
