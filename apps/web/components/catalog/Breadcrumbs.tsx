import Link from "next/link";
import type { Route } from "next";
import { ChevronRight } from "lucide-react";
import type { Crumb } from "@/lib/catalog/seo";

/** Visible breadcrumb trail; the page also emits it as BreadcrumbList JSON-LD. */
export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-[var(--color-text-secondary)]">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={c.path} className="flex items-center gap-1.5">
              {last ? (
                <span aria-current="page" className="font-medium text-[var(--color-text-primary)]">
                  {c.name}
                </span>
              ) : (
                <>
                  <Link href={c.path as Route} className="hover:text-[var(--color-text-brand)] hover:underline">
                    {c.name}
                  </Link>
                  <ChevronRight className="h-3.5 w-3.5 text-[var(--color-text-muted)]" aria-hidden />
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
