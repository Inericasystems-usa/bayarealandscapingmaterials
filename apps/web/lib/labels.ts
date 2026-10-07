import type { Settings } from "@/lib/api-client";

/**
 * Print product shelf labels with a scannable Code128 barcode. jsbarcode is
 * dynamically imported so it's code-split out of the main bundle. Labels print
 * via the browser print pipeline (works with any printer / label printer).
 */
export interface LabelItem {
  name: string;
  price: string;
  sku: string;
}

const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!);

export async function printLabels(items: LabelItem[], settings: Settings | null): Promise<void> {
  if (items.length === 0) return;
  const { default: JsBarcode } = await import("jsbarcode");
  const store = settings?.storeName ?? "Bay Area Landscaping Materials";

  const barcode = (value: string): string => {
    if (!value) return "";
    const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    try {
      JsBarcode(el, value, { format: "CODE128", width: 1.5, height: 34, displayValue: false, margin: 0 });
    } catch {
      return "";
    }
    return el.outerHTML;
  };

  const cards = items
    .map(
      (it) => `<div class="label">
        <div class="store">${esc(store)}</div>
        <div class="name">${esc(it.name)}</div>
        <div class="price">${esc(it.price)}</div>
        <div class="bc">${barcode(it.sku)}</div>
        <div class="sku">${esc(it.sku)}</div>
      </div>`,
    )
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Labels</title><style>
    @page { margin: 8mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; }
    .sheet { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5mm; }
    .label { border: 1px solid #d0d0d0; border-radius: 4px; padding: 6px 8px; min-height: 34mm; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; page-break-inside: avoid; }
    .store { font-size: 8px; color: #666; text-transform: uppercase; letter-spacing: .04em; }
    .name { font-size: 11px; font-weight: 700; margin: 2px 0; line-height: 1.15; }
    .price { font-size: 13px; font-weight: 800; color: #14532d; margin-bottom: 3px; }
    .bc svg { display: block; max-width: 100%; }
    .sku { font-size: 9px; font-family: 'Courier New', monospace; letter-spacing: .05em; margin-top: 1px; }
  </style></head><body>
    <div class="sheet">${cards}</div>
  </body></html>`;

  const w = window.open("", "_blank", "width=820,height=920");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 350);
}
