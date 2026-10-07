# BALM POS — Desktop App (Electron)

A thin native wrapper around the POS web app, packaged as a Windows installer.

## Run in dev

```bash
cd apps/desktop
pnpm install          # installs electron + electron-builder (~250 MB, one-time)
# point it at your running web app (default http://localhost:3000/pos)
pnpm start
```

## Build the Windows installer (.exe)

```bash
cd apps/desktop
pnpm install
# optional: target production instead of localhost
#   set BALM_POS_URL in main.js or via env at runtime
pnpm build:win        # NSIS installer  ->  ../web/public/downloads/BALM-POS-Setup.exe
pnpm build:portable   # single portable .exe (no install)
```

`electron-builder` downloads platform tooling on first run and produces the
signed-installer-ready artifact at `apps/web/public/downloads/BALM-POS-Setup.exe`,
which the public **/download** page links to automatically.

> The icon comes from `build/icon.png` (512×512). For code signing, add a
> certificate per electron-builder's `win.certificateFile` docs.

## What it does

`main.js` opens a 1440×900 window loading `BALM_POS_URL` (default
`http://localhost:3000/pos`). External links open in the system browser. Set
`BALM_POS_URL=https://bayarealandscapingmaterials.com/pos` to ship against prod.
