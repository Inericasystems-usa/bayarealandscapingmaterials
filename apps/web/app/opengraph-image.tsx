import { ImageResponse } from "next/og";
import React from "react";
import { COMPANY } from "@/lib/company";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { SCENE_META } from "@/lib/scene-meta";

/**
 * Open Graph / Twitter card — exactly 1200×630.
 *
 * The yard scene from public/image (lib/scene-meta.ts) with the logo mark and
 * the business details from lib/company.ts overlaid, so the card can never
 * drift from the phone number or name. Both images are read from disk at build
 * time; if either is missing the card falls back to the plain brand panel
 * rather than failing the build.
 *
 * Next applies this to the root segment and every route below it. Pages with a
 * scene of their own set their card in metadata (sceneShare).
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = `${COMPANY.legalName}, ${COMPANY.address.city}, ${COMPANY.address.state}: bulk landscape materials`;

/** A file from public/ as a data URI. Null on any failure — never throws. */
async function publicFile(path: string, mime: string): Promise<string | null> {
  try {
    const buffer = await readFile(join(process.cwd(), "public", path));
    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

export default async function OpengraphImage() {
  const [photo, mark] = await Promise.all([
    publicFile(`image/${SCENE_META.yard.file}_191x1.png`, "image/png"),
    publicFile("brand/logo-mark-white.png", "image/png"),
  ]);

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
            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : null}

        {/* Dark scrim so the text stays legible over any part of the photo. */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
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
            {mark ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mark} alt="" width={130} height={70} style={{ objectFit: "contain" }} />
            ) : null}
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
