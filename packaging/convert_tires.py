#!/usr/bin/env python3
"""Convert R&S Tires products.json (228 tires) into the Inerica POS seed format,
carrying BOTH retail and wholesale prices. Output is a drop-in seed-products.ts.

Run:  python convert_tires.py <products.json> <out.ts>
"""
import json, re, sys

CATEGORY_LABEL = {
    "commercial": "Commercial Truck",
    "used": "Used Tires",
    "passenger": "Passenger",
    "suv-truck": "SUV & Light Truck",
}

def slug(*parts):
    s = "-".join(str(p) for p in parts if p)
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s or "tire"

def money(v):
    try:
        return f"${float(v):.2f} each"
    except (TypeError, ValueError):
        return ""

def main():
    src, out = sys.argv[1], sys.argv[2]
    with open(src, "r", encoding="utf-8") as f:
        tires = json.load(f)

    seen, items = {}, []
    for t in tires:
        brand = (t.get("brand") or "").strip()
        name = (t.get("name") or "").strip()
        size = (t.get("size") or "").strip()
        base = slug(brand, name, size)
        n = seen.get(base, 0) + 1
        seen[base] = n
        pid = base if n == 1 else f"{base}-{n}"

        display = " ".join(p for p in [brand, name] if p) or name or "Tire"
        cat = CATEGORY_LABEL.get(t.get("category"), (t.get("category") or "Tires").title())
        retail = money(t.get("price"))
        whole = money(t.get("wholesale_price"))

        item = {
            "id": pid,
            "name": display,
            "category": cat,
            "subcategory": size or (t.get("diameter") or "").upper(),
            "description": (t.get("description") or f"{display} tire.").strip(),
            "price": retail,
            "image": "",
        }
        if whole:
            item["wholesale"] = whole
        items.append(item)

    # Emit a TypeScript module identical in shape to the landscaping seed.
    def ts(v):
        return json.dumps(v, ensure_ascii=False)

    lines = [
        "// AUTO-GENERATED for R&S Tire Sales by scripts/convert_tires.py — do not edit by hand.",
        "// 228 tires with retail (`price`) + `wholesale` pricing, sold Each.",
        "export interface Product {",
        "  id: string;",
        "  name: string;",
        "  category: string;",
        "  subcategory: string;",
        "  description: string;",
        "  price: string;",
        "  image: string;",
        "  bulk?: string;",
        "  bag?: string;",
        "  wholesale?: string;",
        "}",
        "",
        "export const products: Product[] = [",
    ]
    for it in items:
        parts = [f"id: {ts(it['id'])}", f"name: {ts(it['name'])}", f"category: {ts(it['category'])}",
                 f"subcategory: {ts(it['subcategory'])}", f"description: {ts(it['description'])}",
                 f"price: {ts(it['price'])}", f"image: {ts(it['image'])}"]
        if "wholesale" in it:
            parts.append(f"wholesale: {ts(it['wholesale'])}")
        lines.append("  { " + ", ".join(parts) + " },")
    lines.append("];")

    with open(out, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    cats = {}
    for it in items:
        cats[it["category"]] = cats.get(it["category"], 0) + 1
    print(f"wrote {len(items)} tires -> {out}")
    print("categories:", cats)
    print("with wholesale price:", sum(1 for it in items if "wholesale" in it))

if __name__ == "__main__":
    main()
