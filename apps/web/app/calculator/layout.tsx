import type { Metadata } from "next";
import type { ReactNode } from "react";
import { sceneShare } from "@/lib/scene-meta";

// The page itself is a Client Component and so cannot export metadata; this
// layout carries the self-referencing canonical for the route.
export const metadata: Metadata = { alternates: { canonical: "/calculator" }, ...sceneShare("calculator", "/calculator") };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
