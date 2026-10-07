import Link from "next/link";
import { Button, Container } from "@balm/ui";
import { PageShell } from "@/components/PageShell";
import React from "react";

export const metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <PageShell>
      <Container size="narrow" className="py-32 text-center">
          <p className="font-display text-7xl font-semibold text-[var(--color-text-brand)]">
            404
          </p>
          <h1 className="mt-4 font-display text-4xl font-semibold leading-tight tracking-tight">
            Looks like that path was rocky.
          </h1>
          <p className="mt-4 text-lg text-[var(--color-text-secondary)]">
            The page you're after isn't here. Try the catalog, or give us a call.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/">
              <Button size="lg">Back to home</Button>
            </Link>
            <Link href="/products">
              <Button size="lg" variant="secondary">
                Browse products
              </Button>
            </Link>
          </div>
      </Container>
    </PageShell>
  );
}
