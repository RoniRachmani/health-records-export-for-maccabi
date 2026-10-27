// Capture an approved listing layout on store/src/listing.html, using the real popup with synthetic Chrome APIs.
import { BROWSER_HTML } from '../store/design/listing.mjs';

export async function renderListingImage(stage, image) {
  const page = await openListingImage(stage, image);
  try {
    return await page.screenshot();
  } finally {
    await page.close();
  }
}

/** The listing layout laid out and still, as it is photographed; the caller closes the page. */
export async function openListingImage(stage, image) {
  const page = await stage.open('/store/src/listing.html', image.width, image.height);
  try {
    await page.evaluate(`(async () => {
      document.body.className = ${JSON.stringify(image.className || image.shot)};
      if (${JSON.stringify(image.css || '')}) {
        const style = document.createElement('style');
        style.textContent = ${JSON.stringify(image.css || '')};
        document.head.append(style);
      }
      const design = document.createElement('main');
      design.id = 'design';
      design.innerHTML = ${JSON.stringify(image.html)};
      document.body.append(design);
      const target = document.querySelector('#real-popup');
      if (target) {
        target.parentElement.insertAdjacentHTML('afterbegin', ${JSON.stringify(BROWSER_HTML)});
        const frame = document.createElement('iframe');
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Popup frame did not load')), 10000);
          frame.onload = () => { clearTimeout(timer); resolve(); };
          frame.src = '/src/extension/popup/popup.html?state=' + ${JSON.stringify(image.popupState || 'ready')};
          target.append(frame);
        });
        let ready = false;
        for (let attempt = 0; attempt < 200; attempt++) {
          if (frame.contentDocument?.querySelector('#view > :not(.loading)')) { ready = true; break; }
          await new Promise(resolve => setTimeout(resolve, 25));
        }
        if (!ready) throw new Error('Popup did not render its synthetic state');
        await frame.contentDocument.fonts.ready;
        const width = frame.contentDocument.body.offsetWidth;
        const height = frame.contentDocument.documentElement.scrollHeight;
        const scale = Math.min(450 / width, ${image.popupState === 'running' ? 492 : 480} / height);
        frame.style.width = width + 'px';
        frame.style.height = height + 'px';
        frame.style.transform = 'scale(' + scale + ')';
        target.style.height = (height * scale) + 'px';
        frame.style.marginLeft = (450 - width * scale) + 'px';
      }
      document.body.offsetHeight; // lay the markup out, so the faces it uses start loading before the wait
      await document.fonts.ready;
      await Promise.all([...document.images].map(image => image.decode()));
    })()`);
    // Freeze the progress sheen and pulse using the popup's existing accessibility styles.
    await page.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
    await page.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    if (image.shot === 'icon') {
      await page.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    }
    return page;
  } catch (e) {
    await page.close();
    throw e;
  }
}
