# BALM Hardware Bridge

Browsers can't drive USB/serial thermal printers or cash drawers, so this tiny
local service runs on the **counter PC** and the POS calls it over HTTP.

## Run

```bash
cd apps/bridge
pnpm install                 # installs node-thermal-printer
pnpm run pair                # once per PC: creates BRIDGE_TOKEN in apps/bridge/.env, prints the pairing link
# settings for this PC go in apps/bridge/.env (gitignored), one NAME=value per line:
#   PRINTER_INTERFACE=tcp://192.168.1.50   (network)
#   PRINTER_INTERFACE=printer:EPSON_TM_T20 (named OS printer)
#   PRINTER_INTERFACE=//./COM3             (serial)
#   BRIDGE_ALLOWED_ORIGINS=https://bayarealandscapingmaterials.com
pnpm start
# → http://localhost:9110
```

The bridge refuses to start without `BRIDGE_TOKEN` (at least 32 characters;
there is no default) and only binds a loopback address (`BRIDGE_HOST`,
default `127.0.0.1`). Variables set in the real environment win over the file.

## Access and pairing

Every page open in a browser on the counter PC can send requests to
`localhost`, so the bridge decides who may use it instead of trusting CORS:

- **Host**: only `localhost`, `127.0.0.1` or `[::1]` (stops DNS rebinding).
- **Origin**: browser calls must come from an origin listed in
  `BRIDGE_ALLOWED_ORIGINS` (comma-separated, exact; default
  `https://bayarealandscapingmaterials.com`, the canonical host staff use for
  /pos). Add `http://localhost:3000` only on an offline install that serves the
  POS from the same PC. Anything else gets 403.
- **Token**: every endpoint except `/health` needs header `x-bridge-token`
  with this PC's `BRIDGE_TOKEN`; otherwise 401.

The token is never built into the website (anything `NEXT_PUBLIC_*` is public).
Pair each counter PC once:

1. `pnpm run pair` (creates the token on first run, then prints the link again).
2. `pnpm start` (restart it if it was already running).
3. In the browser the register uses on this PC, sign in to the POS, then open
   the printed link, `https://bayarealandscapingmaterials.com/pos#bridge-token=<token>`.
   The POS checks the token with the bridge, keeps it in that browser's
   localStorage only and reloads without it. The register's Terminal tender
   then shows the Ingenico DX8000 status instead of "Hardware bridge offline".
   The part after `#` is never sent to the web server. Do not send the link by
   email or chat. Keep that browser profile for the register only: the public
   pages of the same site load Google tags, and any script on the site's pages
   in that profile could use the token.
4. Chrome may ask to allow the site to reach devices on the local network:
   allow it on the counter PC.

For the desktop app, start it once with the link instead:
`set "INERICA_POS_URL=<link>" && "Inerica POS.exe"`.

To rotate the token: delete the `BRIDGE_TOKEN` line from `apps/bridge/.env`,
run `pnpm run pair`, restart the bridge and open the new link.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | liveness, driver and terminal mode (no token needed) |
| POST | `/kick` | pop the cash drawer (ESC/POS pulse via the printer) |
| POST | `/print` | print a receipt `{ store, address, number, lines[], total, kick }` |
| GET | `/pay/status` | payment-terminal provider + mode |
| POST | `/pay/sale` | run a card sale `{ amount, reference? }` → `{ approved, authCode, cardBrand, last4, entryMode, reference }` |
| POST | `/pay/void` | void a prior sale `{ reference }` |

## How the POS uses it

`apps/web/lib/hardware.ts` posts to `NEXT_PUBLIC_BRIDGE_URL` (default
`http://localhost:9110`; it must stay in the POS Content-Security-Policy
`connect-src`) with the token from pairing. When the bridge isn't running the
POS falls back to **browser printing** (`window.print`, 80mm receipt) and a **simulated** drawer
kick, so the register works with no hardware. Cash drawers kick automatically on
cash sales when the bridge is online. The register's **Terminal** payment method
calls `/pay/sale`; if the bridge is offline it shows an error and the cashier can
pick another method.

---

## Payment terminal — Ingenico Axium DX8000 (Elavon)

A payment terminal can't take a card by itself — it's driven by the
**semi-integration middleware** your processor (**Elavon**) loaded onto the
device. The bridge isolates that behind one driver (`terminal.js`) so the POS
flow is identical regardless. With no `TERMINAL_PROVIDER` the Terminal tender
is declined; nothing is approved until a provider is configured.

### Config (apps/bridge/.env)

```bash
TERMINAL_PROVIDER=datacap      # datacap | elavon | sim (demos only)   (no default)
TERMINAL_HOST=192.168.1.60     # DX8000 IP on the counter LAN (for LAN/DC-Direct)
TERMINAL_PORT=                 # device port if applicable
TERMINAL_ID=                   # Pad / Lane / Terminal ID from Elavon
TERMINAL_MERCHANT_ID=          # Datacap MerchantID
TERMINAL_OPERATOR=POS          # OperatorID shown on Datacap reports
TERMINAL_ENDPOINT=             # gateway URL (Datacap DC Direct / NETePay Hosted), https
TERMINAL_SECRET=               # API key / token from the processor
```

- `TERMINAL_ENDPOINT` must be https. Plain http is accepted only for a device
  IP on the store LAN, and never together with `TERMINAL_SECRET`.
- Gateway errors reach the browser as `gateway error (<status>)` only; the raw
  reply is logged on this PC with anything shaped like a card number masked.
- **`sim`** approves every sale after ~1.5 s with fake card metadata — use it to
  build and demo end-to-end. Never on a live register: the POS records it as
  `elavon_sim` and no card is charged.
- **`datacap`** is **pre-built** to Datacap's DC Direct JSON contract (the most
  common Elavon semi-integration). Set `TERMINAL_PROVIDER=datacap`,
  `TERMINAL_ENDPOINT`, `TERMINAL_ID`, `TERMINAL_MERCHANT_ID`, and (if required)
  `TERMINAL_SECRET`, and it works. If your account is on the classic NETePay
  Hosted **XML** interface, swap the request/parse in `terminal.js` (one function)
  for the XML command set — noted inline.
- **`elavon`** (Elavon-direct, non-Datacap) is a stub — wire it if that's your path.

### Going live with Elavon

The DX8000 you received from Elavon is provisioned by them; to integrate
(semi-integration, a.k.a. "ECR/POS integration") you need a few things **from
Elavon** — the device alone isn't enough:

1. **Confirm the integration method.** Elavon-provisioned Axium devices are
   typically integrated via **Datacap** (NETePay Hosted / DC Direct) or Elavon's
   own semi-integration. Ask your Elavon rep / ISO: *"What semi-integration
   interface is this DX8000 loaded with, and is it LAN (device IP) or cloud?"*
2. **Get credentials + the cert spec:** Terminal/Pad/Lane ID, gateway endpoint or
   device IP, API key/token, and the integration guide (request/response spec).
3. **Implement `realSale()` / `realVoid()`** in `terminal.js` against that spec
   (HTTPS to the gateway, or TCP/XML to the device on the LAN), set
   `TERMINAL_PROVIDER` accordingly, and fill the env vars above.
4. Elavon usually requires a brief **integration certification** before going
   live on production.

### How to confirm what you have (device in hand)

- On the DX8000 (Android): open **Settings → Apps** and look for the payment app
  — `Datacap`/`NETePay`/`dsiEMVAndroid`, `triPOS`, or an Elavon-branded app
  (Engage/Commerce). That tells you the middleware.
- The terminal's **idle/home screen** and **printed test receipt** show the
  acquirer (Elavon) and often the gateway/ISO.
- The packing slip / merchant welcome kit lists your **MID** and the integration
  product.
- Simplest: call the **number on your Elavon merchant statement** and ask for the
  *semi-integration / ECR integration* details for that terminal.

> Card data never reaches the POS, the bridge or the servers — only the
> approval, auth code, card brand, last 4 digits and the processor's
> transaction token. The PAN, track data, CVV and PIN stay inside the PCI PTS
> terminal and at Elavon/Datacap.
>
> Merchant SAQ: **P2PE** if Elavon confirms the DX8000 is deployed under a
> PCI-listed P2PE solution; otherwise **B-IP** when the terminal is isolated on
> the network and integrated through the processor's cloud; otherwise **C** when
> the POS talks to the terminal over the store LAN (DC Direct to the device IP),
> which puts this PC, the bridge and the POS in scope. SAQ A and A-EP are for
> card-not-present e-commerce and never cover a counter terminal.

> Not part of the default `pnpm install` (excluded in `pnpm-workspace.yaml`) so
> its native printer dep is only installed where hardware is attached. The
> terminal driver itself has no native deps.
