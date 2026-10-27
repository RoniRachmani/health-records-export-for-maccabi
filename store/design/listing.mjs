// Approved Chrome Web Store artwork. No browser or account access when importing this module.
import { DOC, FOLDER, MARK } from './glyphs.mjs';

const mark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><g transform="translate(14 14) scale(4.3)">${MARK}</g></svg>`;
const promoSheet = `<rect width="108" height="150" rx="12" fill="#c4e5f8"/><path d="M22 38h64M22 58h46" fill="none" stroke="#83b3e5" stroke-width="7" stroke-linecap="round"/>`;
const simplePromo = `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="280" viewBox="0 0 440 280"><rect width="440" height="280" fill="#f1f9fe"/><g transform="translate(83 67) rotate(-13 54 75)">${promoSheet}</g><g transform="translate(249 67) rotate(13 54 75)">${promoSheet}</g><g transform="translate(112 28) scale(9)">${MARK}</g></svg>`;

const illustration = simplePromo.replace('<rect width="440" height="280" fill="#f1f9fe"/>', '')
  .replace('viewBox="0 0 440 280"', 'viewBox="64 36 312 196"');
const values = {
  '{{mark}}': mark,
  '{{document}}': DOC,
  '{{folder}}': FOLDER,
  '{{promo}}': simplePromo,
  '{{illustration}}': 'data:image/svg+xml;base64,' + Buffer.from(illustration).toString('base64'),
};
function fill(template) {
  for (const [key, value] of Object.entries(values)) template = template.replaceAll(key, value);
  return template;
}

const templates = [
  {
    "file": "screenshot-1-ask.png",
    "shot": "ask",
    "width": 1280,
    "height": 800,
    "html": "<div class=\"listing-brand\">{{mark}}<span>Maccabi Health Records Takeout</span><i class=\"unofficial-chip\">Unofficial</i></div><div class=\"hero-copy\"><h1>Your whole<br>Maccabi history.<br><em>Ready to ask.</em></h1><p class=\"listing-subline\">Open the folder in an AI assistant.<br>Ask about the years, not just one result.</p><div class=\"tags\"><span>Full medical file</span><span>JSON + PDFs</span><span>One ZIP</span></div></div><div class=\"hero-art\"><img src=\"{{illustration}}\"></div><div class=\"floating-answer\"><div class=\"example-label\">Example after export · Synthetic records</div><h3>“What stands out in my records?”</h3><div class=\"answer-summary\"><span class=\"spark\">✳</span><div><p>Your medical file records a penicillin rash<br>in March 2011.</p><div class=\"listing-source\">{{document}}<span>medical-file.pdf · page 14</span></div></div></div></div>"
  },
  {
    "file": "screenshot-2-whole.png",
    "shot": "whole",
    "width": 1280,
    "height": 800,
    "html": "<div class=\"listing-brand\">{{mark}}<span>Maccabi Health Records Takeout</span><i class=\"unofficial-chip\">Unofficial</i></div><div class=\"section-copy\"><h1>Years of records.<br><em>One place.</em></h1><p>Your full medical file and the records<br>Maccabi Online makes available.</p></div><div class=\"archive-window\"><div class=\"window-bar\"><span class=\"dots\">● ● ●</span><strong>maccabi-export</strong><span>Illustrative export folder</span></div><div class=\"file-row\">{{document}}<strong>README.md</strong><span>A guide to your export</span><small>MD</small></div><div class=\"file-row\">{{document}}<strong>medical-file.pdf</strong><span>Your full medical file</span><small>PDF</small></div><div class=\"file-row\">{{folder}}<strong>test-results</strong><span>Results and lab histories</span><small>JSON · PDF</small></div><div class=\"file-row\">{{folder}}<strong>visit-summaries</strong><span>Visits from the last 12 months</span><small>JSON · PDF</small></div><div class=\"file-row\">{{folder}}<strong>medications-and-prescriptions</strong><span>Prescriptions and purchases</span><small>JSON · PDF</small></div><div class=\"file-row\">{{folder}}<strong>referrals</strong><span>Referrals and their documents</span><small>JSON · PDF</small></div><div class=\"file-row\">{{folder}}<strong>vaccinations</strong><span>Records and vaccination booklet</span><small>JSON · PDF</small></div><div class=\"more-files\">+ letters, approvals, uploads, hospital stays and more</div></div><div class=\"bottom-note\"><strong>Original files. Organised folders.</strong><span>Keep a copy. Share with a doctor. Add your own documents.</span></div>"
  },
  {
    "file": "screenshot-3-advice.png",
    "shot": "advice",
    "width": 1280,
    "height": 800,
    "html": "<div class=\"listing-brand\">{{mark}}<span>Maccabi Health Records Takeout</span><i class=\"unofficial-chip\">Unofficial</i></div><div class=\"ask-copy\"><h1>Better questions.<br><em>A fuller picture.</em></h1><p>Let your assistant read across tests,<br>visits, prescriptions and letters.</p><div class=\"question\">What changed over the years?</div><div class=\"question\">What should I ask my doctor?</div><div class=\"question\">Did the treatment help?</div><div class=\"fine-note\">You choose which assistant reads your folder.</div></div><div class=\"insight\"><div class=\"example-label\">Example after export · Synthetic records</div><div class=\"bubble\">Did my vitamin D improve?</div><div class=\"response\"><span class=\"spark\">✳</span><h3>It rose, then fell again.</h3><p>The three results in your history:</p><div class=\"result-history\"><div><strong>11</strong><span>Nov 2023</span></div><span class=\"result-arrow\">↗</span><div><strong>24</strong><span>May 2024</span></div><span class=\"result-arrow\">↘</span><div><strong>17</strong><span>Jan 2026</span></div></div><div class=\"listing-source\">{{document}}<span>test-results/ · vitamin D lab history</span></div></div><div class=\"insight-bottom\">Bring the results to your doctor to discuss what changed.</div></div>"
  },
  {
    "file": "screenshot-4-start.png",
    "shot": "start",
    "width": 1280,
    "height": 800,
    "html": "<div class=\"listing-brand\">{{mark}}<span>Maccabi Health Records Takeout</span><i class=\"unofficial-chip\">Unofficial</i></div><div class=\"start-copy\"><h1>Log in.<br>Click Start.<br><em>Keep the ZIP.</em></h1><p>The extension collects each section<br>using your signed-in session.</p><ol><li><b>1</b>Log in to Maccabi Online.</li><li><b>2</b>Open the extension and start.</li><li><b>3</b>Keep the tab open and in front.</li></ol><div class=\"fine-note\">Usually a few minutes; up to 20.<br>Orders your medical file. Maccabi will text you.</div></div><div class=\"popup-stage\"><div class=\"browser-label\">Your signed-in tab <span>↘</span></div><div id=\"real-popup\"></div><div class=\"under-popup\">Export in progress · Demo account</div></div>",
    "popupState": "running"
  },
  {
    "file": "screenshot-5-open.png",
    "shot": "open",
    "width": 1280,
    "height": 800,
    "html": "<div class=\"listing-brand\">{{mark}}<span>Maccabi Health Records Takeout</span><i class=\"unofficial-chip\">Unofficial</i></div><div class=\"open-copy\"><h1>Your history.<br><em>Yours to explore.</em></h1><p>Unzip your download, then open the folder<br>in an assistant that supports local files.</p><div class=\"steps\"><div><b>01</b><strong>Unzip</strong><span>Keep the folder<br>on your computer.</span></div><div><b>02</b><strong>Open</strong><span>Choose the folder<br>in your desktop assistant.</span></div><div><b>03</b><strong>Ask</strong><span>Explore your history.<br>Ask what matters.</span></div></div></div><div class=\"popup-stage done\"><div class=\"browser-label\">EXPORT COMPLETE <span>✓</span></div><div id=\"real-popup\"></div><div class=\"under-popup\">Extension preview · Synthetic export</div></div>",
    "popupState": "done"
  },
  {
    "file": "promo-small-440x280.png",
    "shot": "promo",
    "width": 440,
    "height": 280,
    "html": "{{promo}}"
  },
  {
    "file": "promo-marquee-1400x560.png",
    "shot": "marquee",
    "width": 1400,
    "height": 560,
    "html": "<div class=\"listing-brand\">{{mark}}<span>Maccabi Health Records Takeout</span><i class=\"unofficial-chip\">Unofficial</i></div><div class=\"mq-copy\"><h1>Your whole history.<br><em>Now in your hands.</em></h1><p>From Maccabi Online to one folder on your computer.</p></div><div class=\"mq-art\"><img src=\"{{illustration}}\"></div>"
  },
  {
    "file": "icon-128.png",
    "shot": "icon",
    "width": 128,
    "height": 128,
    "html": "{{mark}}"
  }
];

export const LISTING_IMAGES = templates.map(image => ({ ...image, html: fill(image.html) }));
export const BROWSER_HTML = fill("<div class=\"browser-tabs\"><span class=\"browser-dots\"><i></i><i></i><i></i></span><span class=\"browser-tab\">Member portal</span><span>+</span></div><div class=\"browser-controls\"><span>‹</span><span>›</span><span>↻</span><div class=\"browser-address\"><span>▦</span>online.maccabi4u.co.il</div><div class=\"browser-extension\">{{mark}}</div><span>⋮</span></div><div class=\"browser-page\"><div class=\"page-masthead\"></div><div class=\"page-sidebar\"><i></i><i></i><i></i><i></i><i></i></div><div class=\"page-cards\"><div><i></i><i></i><i></i></div><div><i></i><i></i><i></i></div><div><i></i><i></i><i></i></div></div></div>");
