/*
 * The product's name, in the three forms it is spelled: the store's (the manifest's name), the everyday one (titles, the
 * export's README, the policy pages, the store art and the film) and the short one (the popup's heading, the badge's
 * tooltip). Code takes them from here; HTML, Markdown and the scripts spell them out, and repoRules.test.ts holds every
 * spelling in the repo to one of these, so a rename starts here and the test lists what is left.
 */
export const PRODUCT_NAME = 'Maccabi Health Records Takeout';
export const STORE_NAME = PRODUCT_NAME + ' - Ready for AI';
export const SHORT_NAME = 'Health Records Takeout';
