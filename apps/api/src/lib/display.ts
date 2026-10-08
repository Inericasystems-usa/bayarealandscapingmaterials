import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import { config, isAllowedOrigin } from "../config.js";
import { SESSION_COOKIE, userForToken } from "../modules/users.js";
import { can } from "./permissions.js";

/**
 * Customer-display relay (Flint parity: a local WebSocket on :3001 keyed by a
 * `ws=<channel>` id). The register connects as a publisher and pushes live cart
 * state; the customer-facing screen connects as a subscriber and renders it.
 * Pure in-memory relay — last state is cached per channel so a display that
 * connects mid-sale immediately shows the current cart.
 *
 * Carts show customer names and totals, so only signed-in staff may connect:
 * the upgrade must carry a live session (the browser's session cookie, or the
 * session token as ?token=) from an allowed origin, and publishing as the
 * register needs register access.
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

// The session token an upgrade request presents: ?token= or the session cookie.
function sessionToken(req: IncomingMessage, url: URL): string | null {
  const fromQuery = url.searchParams.get("token");
  if (fromQuery) return fromQuery;
  for (const pair of (req.headers.cookie ?? "").split(";")) {
    const eq = pair.indexOf("=");
    if (eq > 0 && pair.slice(0, eq).trim() === SESSION_COOKIE) return pair.slice(eq + 1).trim();
  }
  return null;
}

export function startDisplayServer(port: number, log: (msg: string) => void): WebSocketServer {
  const wss = new WebSocketServer({
    port,
    host: config.HOST,
    verifyClient: ({ origin, req }, done) => {
      if (origin && !isAllowedOrigin(origin)) return done(false, 403);
      const url = new URL(req.url ?? "/", "http://localhost");
      userForToken(sessionToken(req, url)).then(
        (user) => {
          if (!user) return done(false, 401);
          if (url.searchParams.get("role") === "register" && !can(user, "register")) return done(false, 403);
          done(true);
        },
        () => done(false, 500),
      );
    },
  });

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
  log(`customer display socket on ws://${config.HOST}:${port} (staff sessions only)`);
  return wss;
}
