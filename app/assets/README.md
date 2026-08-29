# App icon and splash sources

The launcher icon and splash screen are generated from the SVGs in this folder.
Edit the SVG, regenerate, commit both.

## The mark

The lungs are the app's own `LungsIcon` from `src/components/icons.tsx`, at the
same proportions, so the launcher icon and the interface are the same drawing
rather than two things that resemble each other. White on `#0F766E` — the
`--color-primary` token and the PWA manifest's `theme_color`, so the icon, the
web app's browser chrome and the Android system chrome all agree.

| File | What it becomes |
| --- | --- |
| `icon-foreground.svg` | `mipmap-*/ic_launcher_foreground.png` — the adaptive icon's foreground layer |
| `icon-background.svg` | Reference only; the layer ships as `@color/ic_launcher_background` |
| `icon-legacy.svg` | `mipmap-*/ic_launcher.png` — pre-adaptive launchers |
| `icon-round.svg` | `mipmap-*/ic_launcher_round.png` |
| `splash-mark.svg` | Centred on `#0B1220` in every `drawable*/splash.png` |

## The safe zone, which is the easy thing to get wrong

An adaptive icon is a 108dp layer of which the launcher may crop the outer
~25%: only the central 72dp is safe, and a round mask keeps only a 66dp circle.
`icon-foreground.svg` places the mark so its furthest stroke edge sits at radius
35.2 of 54 — inside the 72dp safe zone, with the whole mark clear of a circular
mask. If you rescale it, check the corner radius rather than the bounding box:
the lungs are widest at the bottom, so the box overstates how far the ink
actually reaches.

Verify by eye after any change. Render the foreground over the teal background
inside a `border-radius: 50%` container and confirm nothing touches the edge.

## Regenerating

`@capacitor/assets` is the documented route and needs a dev-dependency install.
This project's `node_modules` is shared between concurrent agents and a
mid-flight install corrupts it for everyone, so the PNGs here were rasterised
with headless Chrome instead — no install, same output, and the exact pixel
dimensions are asserted rather than assumed.

Either route is fine. If you use the tool:

```
npm i -D @capacitor/assets      # coordinate first — shared node_modules
npx @capacitor/assets generate --android
```

It expects a single `icon.png` and `splash.png` at 1024px rather than the layer
set above, so exporting those from these SVGs is the first step.

If you rasterise by hand, the sizes are:

- adaptive foreground, 108dp: mdpi 108, hdpi 162, xhdpi 216, xxhdpi 324, xxxhdpi 432
- legacy and round, 48dp: mdpi 48, hdpi 72, xhdpi 96, xxhdpi 144, xxxhdpi 192
- splashes: regenerate each `drawable*/splash.png` at whatever size it already is

The foreground must be transparent outside the mark; the background layer is a
colour resource, not a PNG.
