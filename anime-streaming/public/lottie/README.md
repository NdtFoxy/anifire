# Lottie animations

Drop `.json` exports here and reference them by path:

```tsx
import Lottie from "@/components/system/Lottie";

<Lottie
  src="/lottie/empty-list.json"
  className={styles.emptyArt}
  fallback={<Bookmark size={40} />}
/>
```

`ember-pulse.json` is the house animation used by the My List empty state — replace
it or add your own next to it.

## Getting files

LottieFiles (lottiefiles.com) exports two formats. Use **`.json`** (Lottie JSON).
`.lottie` is a zipped bundle and `lottie-web` cannot read it directly — if that is
all a pack ships, unzip it and take `animations/*.json`.

## What the player already handles

- The `lottie-web` engine (~250 KB) is imported on demand, so pages without an
  animation do not download it.
- Playback pauses while the animation is off screen.
- `prefers-reduced-motion` renders a still frame (`stillFrame`, default 0) instead
  of dropping the artwork.
- A missing or malformed file renders `fallback`, never an error.

## Sizing

The player renders an inline SVG that fills its container, so give the wrapper a
size — `width`/`aspect-ratio` in CSS. Nothing inside the JSON needs editing.

## Weight

Keep files under ~100 KB. Anything heavier is usually an embedded raster or an
unoptimised path set; run it through LottieFiles' optimiser first. Images embedded
as base64 (`assets[].p` starting with `data:`) also defeat the lazy loading here,
because they arrive inside the JSON.
