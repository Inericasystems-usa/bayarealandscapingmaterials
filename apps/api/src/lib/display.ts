import { WebSocketServer, WebSocket } from "ws";

/**
 * Customer-display relay (Flint parity: a local WebSocket on :3001 keyed by a
 * `ws=<channel>` id). The register connects as a publisher and pushes live cart
 * state; the customer-facing screen connects as a subscriber and renders it.
 * Pure in-memory relay — last state is cached per channel so a display that
 * connects mid-sale immediately shows the current cart.
 */
interface Channel {
  displays: Set<WebSocket>;
  last: string | null;
}

const channels = new Map<string, Channel>();

function channel(id: string): Channel {
  let c = channels.get(id);
  if (!c) {
    c = { displays: new Set(), last: null };
    channels.set(id, c);
  }
  return c;
}

export function startDisplayServer(port: number, log: (msg: string) => void): WebSocketServer {
  const wss = new WebSocketServer({ port });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const channelId = url.searchParams.get("channel") || url.searchParams.get("ws") || "MAIN";
    const role = url.searchParams.get("role") || "display";
    const c = channel(channelId);

    if (role === "register") {
      // Publisher: fan messages out to every display on this channel.
      ws.on("message", (data) => {
        const msg = data.toString();
        c.last = msg;
        for (const d of c.displays) if (d.readyState === WebSocket.OPEN) d.send(msg);
      });
    } else {
      // Subscriber (customer screen): replay the latest state immediately.
      c.displays.add(ws);
      if (c.last) ws.send(c.last);
      ws.on("close", () => c.displays.delete(ws));
    }
  });

  wss.on("error", (err) => log(`display socket error: ${(err as Error).message}`));
  log(`customer display socket on ws://localhost:${port}`);
  return wss;
}
