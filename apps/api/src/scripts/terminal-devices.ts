import { isEncryptionConfigured } from "../lib/encryption.js";
import { pairTerminalDevice, revokeTerminalDevice, terminalDevices } from "../lib/terminal-signature.js";
import { isMain, runScript } from "./cli.js";

/**
 * Pairs counter-PC bridges with the API so their card-terminal results are
 * accepted (lib/terminal-signature.ts). Run on the server, never in a browser:
 *
 *   pnpm --filter @balm/api terminal:devices pair "Counter 1"
 *   pnpm --filter @balm/api terminal:devices list
 *   pnpm --filter @balm/api terminal:devices revoke tdev_ab12cd34
 *
 * `pair` prints the device id and its signing secret once. Both go in that
 * counter PC's apps/bridge/.env and nowhere else (apps/bridge/README.md).
 */

const USAGE = 'usage: terminal:devices pair "<name>" | list | revoke <device id>';

export async function terminalDevicesCommand(args: string[], out: (line: string) => void = console.log): Promise<void> {
  const [command, ...rest] = args.filter((a) => a !== "--");
  if (command === "pair") {
    const name = rest.join(" ").trim();
    if (!name) throw new Error(USAGE);
    if (!isEncryptionConfigured()) throw new Error("DATA_ENCRYPTION_KEY is not set: the signing secret would be stored as plaintext");
    const { device, secret } = await pairTerminalDevice(name);
    out(`Paired "${device.name}" as ${device.id}.`);
    out("Add these two lines to apps/bridge/.env on that counter PC, then restart the bridge.");
    out("They are shown this once; keep them off email and chat:");
    out(`TERMINAL_DEVICE_ID=${device.id}`);
    out(`TERMINAL_SIGNING_SECRET=${secret}`);
    return;
  }
  if (command === "list") {
    const rows = await terminalDevices.all();
    if (!rows.length) out("No paired terminal bridges.");
    for (const d of rows)
      out(`${d.id}  ${d.active ? "active " : "revoked"}  ${d.name}  last used ${d.lastUsedAt ?? "never"}`);
    return;
  }
  if (command === "revoke") {
    const id = rest[0];
    if (!id) throw new Error(USAGE);
    const device = await revokeTerminalDevice(id);
    if (!device) throw new Error(`no paired bridge ${id}`);
    out(`Revoked ${device.id} (${device.name}): its terminal results are refused from now on.`);
    return;
  }
  throw new Error(USAGE);
}

if (isMain(import.meta.url)) {
  void runScript((args) => terminalDevicesCommand(args));
}
