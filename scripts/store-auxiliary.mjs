// The video poster and landing-page preview retain their dedicated renderers.
export const AUXILIARY_IMAGES = [
  // Not a store field: the README's poster, drawn by the video's own page at the size it plays.
  { file: 'video-poster.png', shot: 'poster', page: '/store/src/video.html?poster', width: 1920, height: 1080 },
  // Not a store field either, and not committed: the landing page's link preview, which .github/workflows/pages.yml
  // renders on each deploy (with Roboto installed) and publishes as og-site.png. It is a photograph of the page's own
  // hero, so the two cannot drift apart.
  // The page is restyled for the picture: only its name and its dashboard, centred, as the finished dashboard and
  // not a moment of its animation. Its og:title, the headline, is printed under the picture by whatever shows it.
  {
    file: 'og-site-1200x630.png', shot: 'og-site', page: '/site/index.html', width: 1200, height: 630, scale: 1,
    prepare: `document.head.insertAdjacentHTML('beforeend', '<style>' +
      'body > :not(.hero), .hero-text > :not(.eyebrow), .he-slip, .asked, .scene { display: none !important; }' +
      'html, body { width: 1200px; height: 630px; margin: 0; padding: 0; max-width: none; overflow: hidden; background: linear-gradient(135deg, #e6f0ff 0%, #f3f0fb 50%, #fde9ef 100%); }' +
      '.hero { display: flex !important; flex-direction: column; align-items: center; justify-content: center; gap: 22px; width: 1200px; height: 630px; margin: 0 !important; padding: 0 !important; max-width: none !important; }' +
      '.hero-text, .dash-stage { margin: 0 !important; padding: 0 !important; width: auto !important; min-height: 0 !important; }' +
      '.eyebrow { margin: 0 !important; }' +
      // A definite width: .dash is a size container, so in this column it would shrink to its padding.
      '.dash-stage { width: 760px !important; zoom: 0.93; }' +
      '.anim, .anim * { animation: none !important; }' +
      '</style>')`,
  },
];
