import type { Order, Settings } from "@/lib/api-client";

/**
 * Build + print an 80mm thermal receipt via the browser print pipeline (works
 * with any installed printer, including thermal). For direct ESC/POS to the
 * printer + cash-drawer kick without a print dialog, the local hardware bridge
 * (apps/bridge) is used instead — see api.kickDrawer / printViaBridge.
 */
const money = (n: number) => `$${(n ?? 0).toFixed(2)}`;
const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!);

export function buildReceiptHtml(order: Order, settings: Settings | null, phone: string): string {
  const a = settings?.address;
  const addr = a ? `${a.street}, ${a.city}, ${a.state} ${a.postalCode}` : "400 W Gertrude Ave, Richmond, CA 94801";
  const store = settings?.storeName ?? "Bay Area Landscaping Materials";
  const when = new Date(order.createdAt).toLocaleString();
  const reviewUrl = "https://www.google.com/maps/search/Bay+Area+Landscaping+Materials+Richmond+CA";
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(reviewUrl)}`;
  // Logo is stored as a same-origin relative URL; the print window has no base,
  // so make it absolute against the current origin.
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const logoSrc = settings?.logoUrl ? (settings.logoUrl.startsWith("http") ? settings.logoUrl : origin + settings.logoUrl) : "";
  const footer = settings?.receiptFooter || "Thank you for your business!";

  const lines = order.lines
    .map(
      (l) =>
        `<tr><td>${esc(l.name)}<br><span class="muted">${l.qty} × ${esc(l.unitLabel)}</span></td><td class="r">${money(l.lineTotal)}</td></tr>`,
    )
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>${order.number}</title><style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; }
    body { width: 280px; margin: 0 auto; padding: 10px 8px; font: 12px/1.45 'Courier New', monospace; color: #000; }
    .c { text-align: center; } .r { text-align: right; } .b { font-weight: bold; }
    .lg { font-size: 15px; } .muted { color: #444; font-size: 11px; }
    hr { border: 0; border-top: 1px dashed #000; margin: 7px 0; }
    table { width: 100%; border-collapse: collapse; }
    td { vertical-align: top; padding: 1px 0; }
    img { margin-top: 4px; }
  </style></head><body>
    ${logoSrc ? `<div class="c"><img src="${logoSrc}" style="max-width:180px;max-height:70px;object-fit:contain" alt="logo"></div>` : ""}
    <div class="c b lg">${esc(store)}</div>
    <div class="c muted">${esc(addr)}</div>
    <div class="c muted">${esc(phone)}</div>
    <hr>
    <div class="b">${order.number}</div>
    <div class="muted">${when}</div>
    <div class="muted">Customer: ${esc(order.customerName)}</div>
    <div class="muted">Type: ${order.type} · ${order.location}</div>
    <hr>
    <table>${lines}</table>
    <hr>
    <table>
      <tr><td>Subtotal</td><td class="r">${money(order.subtotal)}</td></tr>
      ${order.discount && order.discount > 0 ? `<tr><td>Discount</td><td class="r">-${money(order.discount)}</td></tr>` : ""}
      <tr><td>Tax (${(order.taxRate * 100).toFixed(2)}%)</td><td class="r">${money(order.tax)}</td></tr>
      <tr class="b lg"><td>TOTAL</td><td class="r">${money(order.total)}</td></tr>
      <tr><td>Paid (${order.paymentMethod})</td><td class="r">${money(order.paid ? order.total : 0)}</td></tr>
      ${order.due > 0 ? `<tr class="b"><td>Balance Due</td><td class="r">${money(order.due)}</td></tr>` : ""}
    </table>
    <hr>
    <div class="c">${esc(footer).replace(/\n/g, "<br>")}</div>
    <div class="c"><img src="${qr}" width="110" height="110" alt="Review QR"></div>
    <div class="c muted">Scan to review us on Google</div>
    <div class="c muted" style="margin-top:6px">${order.number}</div>
  </body></html>`;
}

export function printReceipt(order: Order, settings: Settings | null, phone: string): void {
  const html = buildReceiptHtml(order, settings, phone);
  const w = window.open("", "_blank", "width=320,height=600");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  // Give the QR image a moment to load, then print.
  setTimeout(() => {
    w.print();
  }, 350);
}
