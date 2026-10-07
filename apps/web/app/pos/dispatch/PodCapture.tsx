"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { X, Camera, Eraser, MapPin, Check, Trash2 } from "lucide-react";
import { Button } from "@balm/ui";
import { api, type Delivery } from "@/lib/api-client";
import { toast } from "@/lib/toast";

/** On-glass signature pad — pointer events cover mouse + touch (tablet). */
function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
  }, []);

  const coords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  };
  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true;
    ref.current!.setPointerCapture(e.pointerId);
    const ctx = ref.current!.getContext("2d")!;
    const { x, y } = coords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = ref.current!.getContext("2d")!;
    const { x, y } = coords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    dirty.current = true;
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (dirty.current) onChange(ref.current!.toDataURL("image/png"));
  };
  const clear = () => {
    const c = ref.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    dirty.current = false;
    onChange(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Signature
        </span>
        <button type="button" onClick={clear} className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]">
          <Eraser className="h-3.5 w-3.5" aria-hidden /> Clear
        </button>
      </div>
      <canvas
        ref={ref}
        width={520}
        height={180}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="mt-1 w-full touch-none rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-white"
      />
    </div>
  );
}

// Downscale + compress a picked image to keep the payload small.
function fileToDataUrl(file: File, maxPx = 1024, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("no canvas"));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error("bad image"));
    img.src = URL.createObjectURL(file);
  });
}

export function PodCapture({
  delivery,
  onClose,
  onSaved,
}: {
  delivery: Delivery;
  onClose: () => void;
  onSaved: (d: Delivery) => void;
}) {
  const [receivedBy, setReceivedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const addPhotos = useCallback(async (files: FileList | null) => {
    if (!files) return;
    const room = 6 - photos.length;
    const picked = Array.from(files).slice(0, Math.max(0, room));
    try {
      const urls = await Promise.all(picked.map((f) => fileToDataUrl(f)));
      setPhotos((p) => [...p, ...urls].slice(0, 6));
    } catch {
      toast("Couldn't read one of the photos.", "error");
    }
  }, [photos.length]);

  const tagLocation = () => {
    if (!navigator.geolocation) return toast("Geolocation unavailable.", "error");
    navigator.geolocation.getCurrentPosition(
      (p) => setGeo({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => toast("Couldn't get location.", "error"),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  async function save() {
    if (!signature && photos.length === 0 && !receivedBy.trim()) {
      return toast("Add a signature, a photo, or who received it.", "error");
    }
    setSaving(true);
    try {
      const updated = await api.capturePod(delivery.id, {
        receivedBy: receivedBy.trim(),
        notes: notes.trim(),
        signature,
        photos,
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
        markDelivered: true,
      });
      toast(`POD captured — ${delivery.code} marked delivered.`, "success");
      onSaved(updated);
      onClose();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
          <div>
            <h2 className="font-display text-lg font-bold text-[var(--color-text-primary)]">Proof of Delivery</h2>
            <p className="text-xs text-[var(--color-text-muted)]">
              {delivery.code} · {delivery.customer}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-auto p-5">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Received by</span>
            <input
              value={receivedBy}
              onChange={(e) => setReceivedBy(e.target.value)}
              placeholder="Name of person who accepted delivery"
              className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-moss-500)]"
            />
          </label>

          <SignaturePad onChange={setSignature} />

          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                Photos ({photos.length}/6)
              </span>
              <label className="flex cursor-pointer items-center gap-1 text-xs text-[var(--color-text-brand)] hover:underline">
                <Camera className="h-3.5 w-3.5" aria-hidden /> Add
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  className="hidden"
                  onChange={(e) => void addPhotos(e.target.files)}
                />
              </label>
            </div>
            {photos.length > 0 && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                {photos.map((src, i) => (
                  <div key={i} className="group relative aspect-square overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`POD ${i + 1}`} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}
                      aria-label="Remove photo"
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Left at side gate, gravel on driveway, etc."
              className="mt-1 w-full resize-none rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-moss-500)]"
            />
          </label>

          <button
            type="button"
            onClick={tagLocation}
            className="flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          >
            <MapPin className="h-4 w-4" aria-hidden />
            {geo ? `Tagged ${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}` : "Tag drop location"}
          </button>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] px-5 py-3">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" size="sm" disabled={saving} onClick={() => void save()}>
            <Check className="h-4 w-4" aria-hidden />
            {saving ? "Saving…" : "Save & mark delivered"}
          </Button>
        </div>
      </div>
    </div>
  );
}
