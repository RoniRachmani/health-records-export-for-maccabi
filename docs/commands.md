# Commands

```sh
# Develop
npm test                        # tests
npm run typecheck               # types
npm run dev                     # dev build, rebuilds on change → dist-dev/
npm run live                    # test export on your account (stops before ordering)

# Ship
npm run release:zip             # clean, test, build, release ZIP
npm run release                 # all of that, plus store images and video

# Store images and video
npm run store-assets            # all images (or add a name: -- marquee)
npm run store-video             # the video (or part of it: -- 8 12)
npm run store-video -- --remux  # new soundtrack only, fast
```

Before pushing: `npm run release:zip`.

The full list, with every option, is in [CLAUDE.md](../CLAUDE.md#commands) and the README's *Development* section.
