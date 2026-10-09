import { jsonLdString } from "@/lib/catalog/seo";

/** One structured-data block, escaped so its text can never close the tag. */
export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: jsonLdString(data) }}
    />
  );
}
