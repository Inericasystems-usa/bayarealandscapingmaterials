# Brand assets

Brand kit colors and fonts are wired into the design system:

| Token | Hex | Brand name |
|---|---|---|
| `--color-moss-700` | `#1B4332` | Forest Green (primary) |
| `--color-clay-500` | `#4E342E` | Earth Brown |
| `--color-stone-500` | `#757575` | River Stone Grey |
| `--color-sky-300`  | `#A2D2FF` | Sky Blue (accent) |
| — | `#FFFFFF` | Pure White |

Fonts: **Montserrat** (headings / `--font-display`), **Open Sans** (body / `--font-sans`).

## What's here

- `logo-mark.svg` — the sprout mark (also rendered inline by `components/Logo.tsx`).

## Drop the illustration logos here

The detailed illustrative logo (San Francisco bridge + dump truck + waterfall +
material piles) was supplied as raster images. Save them in this folder with
these exact names and they'll be picked up by the hero / about sections:

| File name | Source variant |
|---|---|
| `logo-primary.png`      | Full-color logo on white |
| `logo-horizontal.png`   | Horizontal lockup on dark green |
| `logo-badge.png`        | Circular badge / emblem |
| `logo-white.png`        | White line-art on dark |

Optimize before committing (e.g. `pnpm dlx @squoosh/cli --webp auto *.png` or
squoosh.app) and prefer `.webp`/`.avif` for hero placements. Next.js `<Image>`
already serves AVIF/WebP automatically for files referenced from `/public`.
