import { ImageResponse } from "next/og";
import React from "react";
import { COMPANY } from "@/lib/company";
import { HERO_IMAGES } from "@/lib/site-content";

/**
 * Open Graph / Twitter card — exactly 1200×630.
 *
 * Uses the real aerial yard photo already served from the site's CDN (the same
 * asset the contact page hero uses), with the business details overlaid from
 * lib/company.ts so the card can never drift from the phone number or name.
 *
 * The photo is fetched at build time and inlined. If that fetch fails — CDN
 * blip, or a build machine without egress — the card falls back to the solid
 * brand panel rather than failing the build. An OG image is not worth a broken
 * deploy.
 *
 * Next applies this to the root segment and every route below it, so the whole
 * site gets og:image + twitter:image from this one file.
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = `The ${COMPANY.legalName} yard in ${COMPANY.address.city}, ${COMPANY.address.state}`;

/** Fetch the yard photo as a data URI. Null on any failure — never throws. */
async function yardPhoto(): Promise<string | null> {
  try {
    const res = await fetch(HERO_IMAGES.contact, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    return `data:image/webp;base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

export default async function OpengraphImage() {
  const photo = await yardPhoto();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          background: "#1b4332",
          color: "#ebf3ee",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt=""
            width={size.width}
            height={size.height}
            style={{ position: "absolute", inset: 0, objectFit: "cover" }}
          />
        ) : null}

        {/* Dark scrim so the text stays legible over any part of the photo. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to top, rgba(12,35,25,0.92) 38%, rgba(12,35,25,0.25) 100%)",
          }}
        />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            position: "relative",
            padding: "0 80px 72px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 24 }}>
            <svg width="56" height="56" viewBox="0 0 48 48" fill="none">
              <path
                d="M24 42 C 24 34 23 30 22 26"
                stroke="#d2e6da"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <path d="M23 30 C 22 20 15 13 4 13 C 6 25 14 32 23 31 Z" fill="#ebf3ee" />
              <path d="M25 28 C 26 19 33 13 44 14 C 41 25 33 30 25 29 Z" fill="#74af8e" />
            </svg>
            <span style={{ fontSize: 26, letterSpacing: 6, color: "#a7cdb8" }}>
              {COMPANY.address.city.toUpperCase()}, {COMPANY.address.state}
            </span>
          </div>

          <span style={{ fontSize: 68, lineHeight: 1.05, fontWeight: 700 }}>
            {COMPANY.legalName}
          </span>
          <span style={{ marginTop: 22, fontSize: 32, lineHeight: 1.3, color: "#d2e6da" }}>
            {COMPANY.tagline}
          </span>

          <div style={{ display: "flex", alignItems: "center", gap: 28, marginTop: 34, fontSize: 27 }}>
            <span style={{ color: "#a7cdb8" }}>{COMPANY.domain}</span>
            <span style={{ color: "#74af8e" }}>·</span>
            <span style={{ color: "#ebf3ee" }}>{COMPANY.phone}</span>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
