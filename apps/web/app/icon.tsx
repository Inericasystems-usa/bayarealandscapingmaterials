import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import React from "react";

// Route segment config
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/**
 * The favicon: the supplied artwork (public/brand/icon-256.png, the largest
 * frame of BALM_Favicon_Exact_Artwork.ico; scripts/build-brand.mjs) at 32 px.
 * public/favicon.ico is the same artwork for clients that ask for that path.
 */
export default async function Icon() {
  const art = await readFile(join(process.cwd(), "public", "brand", "icon-256.png"));
  return new ImageResponse(
    (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`data:image/png;base64,${art.toString("base64")}`} alt="" width={32} height={32} />
    ),
    { ...size },
  );
}
