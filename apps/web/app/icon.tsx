import { ImageResponse } from "next/og";
import React from "react";

// Route segment config
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Generated favicon — brand sprout mark on Forest Green (#1B4332)
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#1b4332",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 7,
        }}
      >
        <svg width="24" height="24" viewBox="0 0 48 48" fill="none">
          <path
            d="M24 42 C 24 34 23 30 22 26"
            stroke="#d2e6da"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path d="M23 30 C 22 20 15 13 4 13 C 6 25 14 32 23 31 Z" fill="#ebf3ee" />
          <path d="M25 28 C 26 19 33 13 44 14 C 41 25 33 30 25 29 Z" fill="#74af8e" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
