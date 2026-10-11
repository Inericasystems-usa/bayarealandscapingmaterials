"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";
import type { DisplayImage } from "@/lib/catalog/shared";

/**
 * Product photos: the featured image, thumbnails when there is more than one,
 * and a full-size view in a native <dialog> (focus is trapped and Escape
 * closes it; the arrow keys step through photos). The generic placeholder is
 * shown plainly with its "photo coming soon" label and never opens a zoom.
 */
export function ProductGallery({ images, name }: { images: DisplayImage[]; name: string }) {
  const [index, setIndex] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const current = images[index] ?? images[0]!;
  const many = images.length > 1;

  const step = useCallback(
    (delta: number) => setIndex((i) => (i + delta + images.length) % images.length),
    [images.length],
  );

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [step]);

  if (current.isPlaceholder) {
    return (
      <figure>
        <div className="relative aspect-square overflow-hidden rounded-[var(--radius-xl)] bg-[var(--color-moss-50)]">
          <Image src={current.src} alt={current.alt} fill unoptimized priority className="object-cover" />
        </div>
        <figcaption className="mt-3 text-sm text-[var(--color-text-muted)]">
          We don&apos;t have a photo of {name} yet. Call the yard and we can describe it or send a picture.
        </figcaption>
      </figure>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="group relative block aspect-square w-full overflow-hidden rounded-[var(--radius-xl)] bg-[var(--color-stone-100)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-border-focus)]"
        aria-label={`View larger photo of ${name}`}
      >
        <Image
          src={current.src}
          alt={current.alt}
          fill
          priority={index === 0}
          fetchPriority={index === 0 ? "high" : "auto"}
          quality={70}
          sizes="(min-width: 1280px) 600px, (min-width: 1024px) 45vw, 90vw"
          className={`${current.kind ? "object-cover" : "object-contain"} transition-transform duration-700 ease-out motion-safe:group-hover:scale-[1.04]`}
        />
        {current.kind === "in-use" ? (
          <span className="absolute left-3 top-3 rounded-full bg-black/55 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
            Example of use
          </span>
        ) : null}
        <span
          aria-hidden
          className="absolute bottom-3 right-3 grid h-10 w-10 place-items-center rounded-full bg-white/90 text-[var(--color-moss-950)] shadow-[var(--shadow-sm)] transition-transform group-hover:scale-110"
        >
          <Maximize2 className="h-4 w-4" />
        </span>
      </button>

      {many ? (
        <ul className="mt-4 flex flex-wrap gap-3" aria-label="Product photos">
          {images.map((img, i) => (
            <li key={img.src}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show photo ${i + 1} of ${images.length}`}
                aria-current={i === index ? "true" : undefined}
                className={`group/thumb relative block h-20 w-20 overflow-hidden rounded-[var(--radius-md)] border-2 transition-all duration-200 ${
                  i === index
                    ? "border-[var(--color-action)] shadow-[var(--shadow-md)]"
                    : "border-transparent opacity-75 hover:-translate-y-0.5 hover:opacity-100"
                }`}
              >
                <Image src={img.src} alt="" fill sizes="80px" className="object-cover transition-transform duration-500 group-hover/thumb:scale-110" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <dialog
        ref={dialog}
        aria-label={`Photo of ${name}`}
        onClick={(e) => {
          // A click on the backdrop (the dialog itself, not its content) closes it.
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
        className="m-auto max-h-[92vh] max-w-[92vw] overflow-visible bg-transparent p-0 backdrop:bg-black/80"
      >
        <div className="relative">
          {/* Full resolution, at no more than its natural size: no upscaling. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={current.src}
            alt={current.alt}
            width={current.width}
            height={current.height}
            loading="lazy"
            className="block h-auto max-h-[88vh] w-auto max-w-[92vw] rounded-[var(--radius-lg)] bg-white"
          />
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label="Close photo"
            autoFocus
            className="absolute -top-3 -right-3 grid h-10 w-10 place-items-center rounded-full bg-white text-[var(--color-moss-950)] shadow-[var(--shadow-md)]"
          >
            <X className="h-5 w-5" />
          </button>
          {many ? (
            <>
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label="Previous photo"
                className="absolute left-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-[var(--color-moss-950)]"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label="Next photo"
                className="absolute right-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-[var(--color-moss-950)]"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          ) : null}
        </div>
      </dialog>
    </div>
  );
}
