"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Link2, Loader2, CheckCheck } from "lucide-react";
import {
  api,
  type OfflineConversionRow,
  type OfflineConversionsMeta,
} from "@/lib/api-client";

const money = (n: number) =>
  `$${(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Google Ads offline conversion import — the revenue half of the loop.
 *
 * Lists delivered/invoiced orders matched back to the ad click that produced the
 * lead, at their real invoiced value excluding tax. The workflow is deliberately
 * three explicit steps:
 *
 *   1. Review what qualifies (this list).
 *   2. Download the CSV and upload it in Google Ads (Goals → Conversions →
 *      Uploads). Downloading marks nothing.
 *   3. Once Google reports the upload as accepted, press "Mark uploaded" — that
 *      sets `conversion_uploaded_at` and permanently excludes those leads, so
 *      the same conversion can never be sent twice.
 */
export function OfflineConversions({ from, to }: { from?: string; to?: string }) {
  const [rows, setRows] = useState<OfflineConversionRow[]>([]);
  const [meta, setMeta] = useState<OfflineConversionsMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .offlineConversions({ ...(from ? { from } : {}), ...(to ? { to } : {}) })
      .then((res) => {
        setRows(res.data);
        setMeta(res.meta);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [from, to]);

  useEffect(load, [load]);

  const onDownload = useCallback(() => {
    setNote(null);
    void api.exportOfflineConversionsCsv(from, to).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : "Export failed");
    });
  }, [from, to]);

  const onMarkUploaded = useCallback(async () => {
    if (rows.length === 0 || busy) return;
    if (
      !window.confirm(
        `Mark ${rows.length} conversion${rows.length === 1 ? "" : "s"} as uploaded to Google Ads?\n\n` +
          "Do this only after Google has accepted the file. Marked conversions are never exported again.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.markOfflineConversionsUploaded(rows.map((r) => r.leadId));
      setNote(`Marked ${res.marked} uploaded${res.skipped ? ` · ${res.skipped} already were` : ""}.`);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to mark uploaded");
    } finally {
      setBusy(false);
    }
  }, [rows, busy, load]);

  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link2 className="h-5 w-5 text-[var(--color-text-brand)]" strokeWidth={1.75} aria-hidden />
        <h2 className="font-display text-lg font-bold text-[var(--color-text-primary)]">
          Google Ads offline conversions
        </h2>
        <span className="text-xs text-[var(--color-text-muted)]">
          {meta ? `${meta.conversionName} · ${meta.timeZone}` : ""}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onDownload}
            disabled={rows.length === 0}
            className="flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-moss-100)] px-3 py-1.5 text-sm font-medium text-[var(--color-moss-700)] transition hover:brightness-95 disabled:opacity-50"
          >
            <Download className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            CSV
          </button>
          <button
            type="button"
            onClick={() => void onMarkUploaded()}
            disabled={rows.length === 0 || busy}
            className="flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-moss-100)] px-3 py-1.5 text-sm font-medium text-[var(--color-moss-700)] transition hover:brightness-95 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} aria-hidden />
            ) : (
              <CheckCheck className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            )}
            Mark uploaded
          </button>
        </div>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-muted)]">
        Leads whose order actually reached delivered/complete, valued at the real invoiced total
        excluding tax. Download the CSV, upload it in Google Ads, then mark it uploaded — marked
        conversions are never exported again.
      </p>

      {error ? <p className="mt-3 text-sm text-[var(--color-danger)]">{error}</p> : null}
      {note ? <p className="mt-3 text-sm text-[var(--color-text-brand)]">{note}</p> : null}

      {loading ? (
        <p className="mt-4 text-sm text-[var(--color-text-muted)]">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--color-text-muted)]">
          Nothing pending — no lead in this range has invoiced revenue waiting to be uploaded.
        </p>
      ) : (
        <>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
                  <th className="py-1.5 pr-3 font-semibold">Order</th>
                  <th className="py-1.5 pr-3 font-semibold">Conversion time</th>
                  <th className="py-1.5 pr-3 font-semibold">Click</th>
                  <th className="py-1.5 text-right font-semibold">Value (ex. tax)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.leadId} className="border-t border-[var(--color-border)]">
                    <td className="py-1.5 pr-3 font-medium text-[var(--color-text-primary)]">
                      {r.orderNumber}
                    </td>
                    <td className="py-1.5 pr-3 text-[var(--color-text-secondary)]">
                      {r.conversionTime}
                    </td>
                    <td className="py-1.5 pr-3 font-mono text-xs text-[var(--color-text-muted)]">
                      {r.clickIdType}:{r.clickId.slice(0, 12)}…
                    </td>
                    <td className="py-1.5 text-right font-medium text-[var(--color-text-primary)]">
                      {money(r.value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
            {rows.length} pending · {money(meta?.totalValue ?? 0)} total
          </p>
        </>
      )}
    </section>
  );
}
