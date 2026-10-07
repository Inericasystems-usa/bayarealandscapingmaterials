/** Escape a value for a CSV cell (quotes it when it contains "," or newline). */
export const csvCell = (v: unknown): string => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Minimal CSV parser (handles quoted fields, embedded commas/quotes/newlines). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { cur.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      cur.push(field); rows.push(cur); cur = []; field = "";
    } else field += c;
  }
  if (field !== "" || cur.length) { cur.push(field); rows.push(cur); }
  const header = (rows.shift() ?? []).map((h) => h.trim().toLowerCase());
  return rows
    .filter((r) => r.some((c) => c.trim() !== ""))
    .map((r) => {
      const o: Record<string, string> = {};
      header.forEach((h, i) => { o[h] = (r[i] ?? "").trim(); });
      return o;
    });
}

/** First non-empty value among the given (lowercased) column aliases. */
export function pick(rec: Record<string, string>, aliases: string[]): string {
  for (const a of aliases) {
    const v = rec[a];
    if (v != null && v.trim() !== "") return v.trim();
  }
  return "";
}
