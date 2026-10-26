/* The page the listing images are drawn on: scripts/store-listing.mjs puts each one's markup in it. It holds the
   layouts in store/design/listing.css and nothing else, and says it is ready for scripts/stage.mjs. */
import '../design/listing.css';

document.documentElement.dataset.ready = '1';
