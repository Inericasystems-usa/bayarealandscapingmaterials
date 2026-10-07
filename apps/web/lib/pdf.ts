import type { ReportSummary, CustomerStatement } from "./api-client";

/**
 * Client-side PDF export. jsPDF + autotable are dynamically imported so they're
 * code-split out of the main bundle and only fetched when the user exports.
 */

type Doc = import("jspdf").jsPDF;

const BRAND = "Bay Area Landscaping Materials";
const MOSS: [number, number, number] = [22, 101, 52];
const money = (n: number) =>
  `$${(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function load() {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  return { doc: new jsPDF({ unit: "pt", format: "letter" }), autoTable };
}

function header(doc: Doc, title: string, subtitle: string): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(31, 41, 55);
  doc.text(BRAND, 40, 48);
  doc.setFontSize(12);
  doc.setTextColor(...MOSS);
  doc.text(title, 40, 70);
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128);
    doc.text(subtitle, 40, 86);
  }
  return 102;
}

function footer(doc: Doc): void {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(156, 163, 175);
  doc.text(`Generated ${new Date().toLocaleString()}`, 40, doc.internal.pageSize.getHeight() - 28);
}

const finalY = (doc: Doc): number =>
  (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 102;

const slug = (s: string) => s.replace(/[^\dA-Za-z]+/g, "-").replace(/^-|-$/g, "");

export async function salesReportPdf(data: ReportSummary): Promise<void> {
  const { doc, autoTable } = await load();
  const z = data.z;
  const tableHead = { headStyles: { fillColor: MOSS }, styles: { fontSize: 9 }, theme: "striped" as const };

  let y = header(doc, "Sales Report", data.range ? `Period ${data.date}` : `Day ${data.date}`);
  autoTable(doc, {
    startY: y,
    head: [["Metric", "Value"]],
    body: [
      ["Transactions", String(z.count)],
      ["Gross subtotal", money(z.subtotal)],
      ["Cost of goods", money(z.cogs)],
      ["Gross profit", `${money(z.grossProfit)} (${((z.margin ?? 0) * 100).toFixed(1)}%)`],
      ["Tax collected", money(z.tax)],
      ["Total", money(z.total)],
      ["Average sale", money(z.avgSale)],
    ],
    ...tableHead,
  });
  y = finalY(doc) + 20;

  const payments = z.byPayment ?? {};
  if (Object.keys(payments).length) {
    autoTable(doc, {
      startY: y,
      head: [["Payment method", "Count", "Total"]],
      body: Object.entries(payments).map(([m, p]) => [m, String(p.count), money(p.total)]),
      ...tableHead,
    });
    y = finalY(doc) + 20;
  }

  if (data.topSellers.length) {
    autoTable(doc, {
      startY: y,
      head: [["Top seller", "Qty", "Revenue"]],
      body: data.topSellers.map((t) => [t.name, String(t.qty), money(t.revenue)]),
      ...tableHead,
    });
  }

  footer(doc);
  doc.save(`balm-sales-${slug(data.date)}.pdf`);
}

export async function customerStatementPdf(stmt: CustomerStatement): Promise<void> {
  const { doc, autoTable } = await load();
  const c = stmt.customer;
  const tableHead = { headStyles: { fillColor: MOSS }, styles: { fontSize: 9 }, theme: "striped" as const };

  let y = header(doc, "Account Statement", `${c.name} · ${c.number}`);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(31, 41, 55);
  doc.text(`Balance due: ${money(stmt.balance)}`, 40, y);
  y += 16;

  autoTable(doc, {
    startY: y,
    head: [["Invoice", "Date", "Total", "Paid", "Due"]],
    body: stmt.invoices.length
      ? stmt.invoices.map((i) => [i.number, new Date(i.date).toLocaleDateString(), money(i.total), i.paid ? "Yes" : "No", money(i.due)])
      : [["—", "", "", "", ""]],
    ...tableHead,
  });
  y = finalY(doc) + 20;

  if (stmt.payments.length) {
    autoTable(doc, {
      startY: y,
      head: [["Payment date", "Amount", "Applied to", "To credit"]],
      body: stmt.payments.map((p) => [
        new Date(p.createdAt).toLocaleDateString(),
        money(p.amount),
        p.applied.map((a) => a.number).join(", ") || "—",
        money(p.credited),
      ]),
      ...tableHead,
    });
  }

  footer(doc);
  doc.save(`balm-statement-${slug(c.number)}.pdf`);
}
