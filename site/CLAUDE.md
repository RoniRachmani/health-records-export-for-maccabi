# site/

Moved out of the root `CLAUDE.md`; it loads when working on files here. The root still holds the landing page's
house rules (no script, no fetched font, the one GoatCounter request).

- **The landing page's motion is CSS, and it ends where the still page is.** The hero plays once as the page opens, from a clean slate to the finished dashboard, and stops there; the rest plays as it comes
  into view, on scroll timelines (`animation-timeline: view()`), so a picture's progress is its place on the screen.
  Every animation moves only opacity, transform, clip-path or colour; its last frame is exactly the page with no motion,
  which is what `prefers-reduced-motion` (under which nothing moves) and a browser without scroll timelines (each
  picture sits under `@supports`) both show. A picture that can be on the first screen at load would sit half-played
  on a scroll timeline, so on those screens it plays once as the page opens instead. Never put `overflow: hidden` (or
  auto) on anything around a scroll-timeline picture: it becomes the scroll container the timeline follows, which
  never scrolls, so the picture just stands finished; `overflow: clip` clips the same. A picture near the foot of the
  page measures its range in pixels of scroll, not in shares of the screen: on a tall screen there isn't that much
  page left below it. `npm run site-check` checks all of this at five sizes (and is the Pages workflow's gate); look
  at a change with its `frames` mode, since the check only says where the motion ends, not how it gets there.
- **One rule per selector in each media query.** `site.css` is kept in its review rounds, but a selector's own rule is
  where it first appears: change that rule rather than restate it further down. A tidy-up that should change nothing
  on screen is proved with
  `npm run site-check -- styles save` before it and `npm run site-check -- styles` after: every element's computed
  style, in every state of the page and the popup and in every store image, must come out the same.
