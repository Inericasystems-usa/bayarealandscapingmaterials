#!/usr/bin/env bash
# ============================================================================
# Build a self-contained, OFFLINE Inerica POS installer (folder + zip).
#
#   packaging/build-installer.sh balm     # Bay Area Landscaping Materials
#   packaging/build-installer.sh rs       # R&S Tire Sales (tire catalog build)
#
# Output: dist/InericaPOS-<PROFILE>-offline.zip  — unzip, run the .bat, done.
# Requires: node, pnpm-installed monorepo deps (esbuild), python (rs only),
#           Windows PowerShell (for Compress-Archive). Run from git-bash.
#
# The "rs" build temporarily swaps 4 source files (tire seed, R&S settings,
# R&S branding) and ALWAYS git-restores them on exit (even on error).
# ============================================================================
set -euo pipefail

PROFILE="${1:-}"
case "$PROFILE" in
  balm|rs) ;;
  *) echo "usage: $0 <balm|rs>"; exit 1 ;;
esac

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKG="$REPO/packaging"
OUT="$REPO/dist"
WORK="$(mktemp -d)"
NODE_EXE="$(command -v node)"
ESBUILD="$(ls "$REPO"/node_modules/.pnpm/esbuild@*/node_modules/esbuild/bin/esbuild 2>/dev/null | head -1)"
[ -n "$ESBUILD" ] || { echo "esbuild not found — run 'pnpm install' in the repo first"; exit 1; }

if [ "$PROFILE" = "balm" ]; then
  LABEL="Inerica POS - BALM"; ZIP="InericaPOS-BALM-offline.zip"; LAUNCH="$PKG/launchers/balm"
else
  LABEL="R&S Tire Sales POS"; ZIP="InericaPOS-RS-TireSales-offline.zip"; LAUNCH="$PKG/launchers/rs"
fi
DELIV="$WORK/$LABEL"
mkdir -p "$DELIV/api" "$DELIV/node" "$DELIV/web" "$OUT"

# --- RS: swap source (restore on any exit) --------------------------------
SWAPPED=()
cleanup() {
  for f in "${SWAPPED[@]:-}"; do [ -n "$f" ] && git -C "$REPO" checkout -- "$f" 2>/dev/null || true; done
  rm -rf "$WORK"
}
trap cleanup EXIT
if [ "$PROFILE" = "rs" ]; then
  echo "▸ applying R&S source (tire catalog + branding + settings)"
  python "$PKG/convert_tires.py" "$REPO/../R&STires/data/products.json" "$REPO/apps/api/src/data/seed-products.ts"
  SWAPPED+=("apps/api/src/data/seed-products.ts")
  cp "$PKG/rs-brand/company.ts" "$REPO/apps/web/lib/company.ts";      SWAPPED+=("apps/web/lib/company.ts")
  cp "$PKG/rs-brand/Logo.tsx"   "$REPO/apps/web/components/Logo.tsx"; SWAPPED+=("apps/web/components/Logo.tsx")
  node "$PKG/patch-rs-settings.mjs" "$REPO/apps/api/src/modules/settings.ts"; SWAPPED+=("apps/api/src/modules/settings.ts")
fi

# --- API: single-file esbuild bundle (no node_modules) --------------------
echo "▸ bundling API"
BANNER="import{createRequire as ___cr}from'module';const require=___cr(import.meta.url);import{fileURLToPath as ___f}from'url';import{dirname as ___d}from'path';const __filename=___f(import.meta.url);const __dirname=___d(__filename);"
node "$ESBUILD" "$REPO/apps/api/src/server.ts" --bundle --platform=node --format=esm --target=node20 \
  --outfile="$DELIV/api/server.mjs" --external:pg-native --external:pino-pretty --banner:js="$BANNER"

# --- WEB: isolated npm build (flat node_modules, no pnpm symlinks) ---------
echo "▸ building web (isolated npm build)"
ISO="$WORK/web-iso"; mkdir -p "$ISO/vendor"
for f in app components lib public next.config.ts tsconfig.json postcss.config.mjs tailwind.config.ts middleware.ts next-env.d.ts package.json; do
  cp -r "$REPO/apps/web/$f" "$ISO/"
done
for p in ui lib-domain shared-types config-typescript; do
  cp -r "$REPO/packages/$p" "$ISO/vendor/$p"; rm -rf "$ISO/vendor/$p/node_modules"
done
node "$PKG/stage-web-deps.mjs" "$ISO"
find "$ISO/vendor" -type f \( -name "vitest.config.ts" -o -name "*.test.ts" -o -name "*.spec.ts" -o -name "eslint.config.*" \) -delete
find "$ISO/vendor" -type d -name coverage -exec rm -rf {} + 2>/dev/null || true
( cd "$ISO" && npm install --no-audit --no-fund --loglevel=error \
    && NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_POS_EDITION=owned node node_modules/next/dist/bin/next build >/dev/null )

# assemble + trim web (drop build cache + dev deps; JS config so no TS at runtime)
for f in .next node_modules public package.json middleware.ts postcss.config.mjs tailwind.config.ts next-env.d.ts tsconfig.json; do
  cp -r "$ISO/$f" "$DELIV/web/"
done
cp "$PKG/next.config.mjs" "$DELIV/web/next.config.mjs"
rm -rf "$DELIV/web/.next/cache"
( cd "$DELIV/web" && npm prune --omit=dev --no-audit --no-fund --loglevel=error >/dev/null )
# replace the file: @balm junctions with real copies (npm leaves broken links)
rm -rf "$DELIV/web/node_modules/@balm"; mkdir -p "$DELIV/web/node_modules/@balm"
for p in ui lib-domain shared-types; do cp -rL "$ISO/vendor/$p" "$DELIV/web/node_modules/@balm/$p"; done

# --- runtime + launcher ---------------------------------------------------
cp "$NODE_EXE" "$DELIV/node/node.exe"
cp "$LAUNCH"/* "$DELIV/"

# --- zip ------------------------------------------------------------------
# PowerShell's Compress-Archive needs Windows paths, not git-bash (/d/…) paths.
echo "▸ zipping"
WIN_DELIV="$(cygpath -w "$DELIV")"
WIN_ZIP="$(cygpath -w "$OUT/$ZIP")"
powershell -NoProfile -Command "if(Test-Path -LiteralPath '$WIN_ZIP'){Remove-Item -LiteralPath '$WIN_ZIP' -Force}; Compress-Archive -Path '$WIN_DELIV' -DestinationPath '$WIN_ZIP' -CompressionLevel Optimal"

SIZE=$(( $(stat -c %s "$OUT/$ZIP") / 1048576 ))
echo "✓ built $PROFILE: dist/$ZIP (${SIZE} MB)"
