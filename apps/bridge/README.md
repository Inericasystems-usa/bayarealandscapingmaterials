# BALM Hardware Bridge

Browsers can't drive USB/serial thermal printers or cash drawers, so this tiny
local service runs on the **counter PC** and the POS calls it over HTTP.

## Run

```bash
cd apps/bridge
pnpm install                 # installs node-thermal-printer
# point it at your printer:
#   PRINTER_INTERFACE=tcp://192.168.1.50   (network)
#   PRINTER_INTERFACE=printer:EPSON_TM_T20 (named OS printer)
#   PRINTER_INTERFACE=//./COM3             (serial)
PRINTER_INTERFACE=tcp://192.168.1.50 pnpm start
# → http://localhost:9110
```

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | bridge + driver + terminal status |
| POST | `/kick` | pop the cash drawer (ESC/POS pulse via the printer) |
| POST | `/print` | print a receipt `{ store, address, number, lines[], total, kick }` |
| GET | `/pay/status` | payment-terminal provider + mode |
| POST | `/pay/sale` | run a card sale `{ amount, reference? }` → `{ approved, authCode, cardBrand, last4, entryMode, reference }` |
| POST | `/pay/void` | void a prior sale `{ reference }` |

## How the POS uses it

`apps/web/lib/hardware.ts` posts to `NEXT_PUBLIC_BRIDGE_URL` (default
`http://localhost:9110`). When the bridge isn't running the POS falls back to
**browser printing** (`window.print`, 80mm receipt) and a **simulated** drawer
kick, so the register works with no hardware. Cash drawers kick automatically on
cash sales when the bridge is online. The register's **Terminal** payment method
calls `/pay/sale`; if the bridge is offline it shows an error and the cashier can
pick another method.

---

## Payment terminal — Ingenico Axium DX8000 (Elavon)

A payment terminal can't take a card by itself — it's driven by the
**semi-integration middleware** your processor (**Elavon**) loaded onto the
device. The bridge isolates that behind one driver (`terminal.js`) so the POS
flow is identical regardless, and runs in **simulated** mode until real
credentials are wired.

### Config (env vars)

```bash
TERMINAL_PROVIDER=sim          # sim | datacap | elavon   (default: sim)
TERMINAL_HOST=192.168.1.60     # DX8000 IP on the counter LAN (for LAN/DC-Direct)
TERMINAL_PORT=                 # device port if applicable
TERMINAL_ID=                   # Pad / Lane / Terminal ID from Elavon
TERMINAL_MERCHANT_ID=          # Datacap MerchantID
TERMINAL_OPERATOR=POS          # OperatorID shown on Datacap reports
TERMINAL_ENDPOINT=             # gateway URL (Datacap DC Direct / NETePay Hosted)
TERMINAL_SECRET=               # API key / token from the processor
```

- **`sim`** approves every sale after ~1.5 s with fake card metadata — use it to
  build and demo end-to-end (default).
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

> Card data never touches our servers or the bridge response beyond masked
> `last4` + non-sensitive metadata — the terminal + Elavon handle the PAN, which
> keeps PCI scope low (SAQ-A/P2PE territory).

> Not part of the default `pnpm install` (excluded in `pnpm-workspace.yaml`) so
> its native printer dep is only installed where hardware is attached. The
> terminal driver itself has no native deps.
