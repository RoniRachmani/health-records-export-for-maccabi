# Commands

```sh
# Develop
npm test                        # tests
npm run typecheck               # types
npm run dev                     # dev build, rebuilds on change → dist-dev/
npm run live                    # test export on your account (never orders, no ZIP)

# Ship
npm run release:zip             # clean, test, build, release ZIP
npm run release                 # all of that, plus store images and video

# Store images and video
npm run store-assets            # approved listing images, poster and previews → store/assets/
npm run store-assets -- start open  # render only named shots
node scripts/check-store-assets.mjs # verify eight PNGs, manifest and upload ZIP
npm run store-video             # the video (or part of it: -- 8 12)
npm run store-video -- --remux  # new soundtrack only, fast
```

`npm run store-assets` generates the approved design at the canonical `store/assets/` paths.
Open `store/assets/review.html` to inspect it; `store/assets/store-artwork.zip` (gitignored: written by each render, and kept as the *Store images* workflow's artifact) contains the eight upload PNGs,
and `store-artwork.json` records their dimensions and SHA-256 hashes. The release command and *Store images*
workflow use this renderer too. Named shots include `icon`, `poster`, `og-site` and `social`.

The [artwork guide](../store/redesign/README.md) covers prerequisites, source files and verification.
`store/redesign/mock-review.html` remains the historical **Original → First redesign → Latest revision** comparison;
its latest column links to the canonical images. Updating listing images alone does not require a new extension package.

Before pushing: `npm run release:zip`.

The full list, with every option, is in [CLAUDE.md](../CLAUDE.md#commands) and [CONTRIBUTING.md](../CONTRIBUTING.md).
