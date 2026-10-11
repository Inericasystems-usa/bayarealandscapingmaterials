import type { Metadata } from "next";
import { COMPANY } from "@/lib/company";
import { SHOW_PRICES } from "@/lib/storefront";
import {
  COVERAGE_DEPTHS,
  categoryOf,
  categoryPath,
  cubicYardCoverage,
  productPath,
  soldByPhrase,
  type CatalogCategory,
  type CatalogProduct,
} from "./index";
import { unitPriceLabel, variationPrices } from "./pricing";
import { CATEGORY_SCENES, shareImage as sceneShareImage } from "@/lib/scene-meta";

/**
 * Search and answer-engine metadata for the catalog pages: titles, meta
 * descriptions, keywords, Open Graph, and the JSON-LD blocks (Product,
 * BreadcrumbList, FAQPage, CollectionPage). Everything is built from the
 * catalog and lib/company.ts, so a page can only state what the site already
 * knows.
 */

export const SITE_URL = `https://${COMPANY.domain}`;
const TITLE_MAX = 60;
const DESCRIPTION_MAX = 160;
const DESCRIPTION_TARGET = 140;

const absolute = (path: string) => `${SITE_URL}${path}`;
const yardAddress = `${COMPANY.address.street}, ${COMPANY.address.city}, ${COMPANY.address.state} ${COMPANY.address.postalCode}`;
const yardHours = COMPANY.hours.map((h) => `${h.fullLabel} ${h.value}`).join(" and ");

/** The longest candidate that fits; titles are absolute (no site-name suffix). */
function fit(candidates: string[], max: number): string {
  const fitting = candidates.filter((c) => c.length <= max);
  if (fitting.length) return fitting[0]!;
  const shortest = candidates.reduce((a, b) => (a.length <= b.length ? a : b));
  return `${shortest.slice(0, max - 1).trimEnd()}…`;
}

export function productTitle(product: CatalogProduct): string {
  const category = categoryOf(product);
  return fit(
    [
      `${product.name} | ${category.name} | Richmond, CA Landscape Supply`,
      `${product.name} | ${category.name} in Richmond, CA`,
      `${product.name} | ${category.name} | Bay Area`,
      `${product.name} | Richmond, CA`,
      `${product.name} | Bay Area`,
      product.name,
    ],
    TITLE_MAX,
  );
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * A unique description of about 140-160 characters: the product, what it is,
 * how it is sold, and where to get it. Picks the richest variant that fits,
 * then pads with a true local fact if it runs short.
 */
export function productDescription(product: CatalogProduct): string {
  const alternates = product.variations.length > 1 ? " (half and quarter yards too)" : "";
  const sold = `${capitalise(soldByPhrase(product))}${alternates}`;
  const what = product.what;
  const variants = product.isService
    ? [
        `${product.name}: ${what}, from our yard in Richmond, CA. Call ${COMPANY.phone} or request a quote online.`,
        `${product.name}: ${what}. Call ${COMPANY.phone} or request a quote.`,
        `${product.name} from our Richmond, CA yard. Call ${COMPANY.phone}.`,
      ]
    : [
        `${product.name}, ${what}. ${sold} at our Richmond, CA yard, with Bay Area delivery. Request a quote or call ${COMPANY.phone}.`,
        `${product.name}, ${what}. ${sold} at our Richmond, CA yard, with Bay Area delivery. Request a quote today.`,
        `${product.name}, ${what}. ${sold}. Pickup in Richmond, CA or Bay Area delivery. Request a quote.`,
        `${product.name}, ${what}. Pickup in Richmond, CA or Bay Area delivery. Request a quote.`,
        `${product.name}. Pickup in Richmond, CA or Bay Area delivery. Request a quote.`,
      ];
  let out = fit(variants, DESCRIPTION_MAX);
  for (const pad of [` Call ${COMPANY.phone}.`, " Open 7 days."]) {
    if (out.length < DESCRIPTION_TARGET && out.length + pad.length <= DESCRIPTION_MAX && !out.includes(pad.trim())) {
      out += pad;
    }
  }
  return out;
}

/** Owner-requested keywords meta: product, kind, category and local terms. */
export function productKeywords(product: CatalogProduct): string[] {
  return product.keywords;
}

/** The site's default share card (app/opengraph-image.tsx), for products without a photo. */
export const DEFAULT_SHARE_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: `The ${COMPANY.legalName} yard in ${COMPANY.address.city}, ${COMPANY.address.state}`,
};

/** The image a share card uses: the product photo, else the site's default card. */
function shareImage(product: CatalogProduct) {
  const photo = product.images[0];
  return photo ? { url: photo.src, width: photo.width, height: photo.height, alt: photo.alt } : DEFAULT_SHARE_IMAGE;
}

export function productMetadata(product: CatalogProduct): Metadata {
  const title = productTitle(product);
  const description = productDescription(product);
  const url = productPath(product.slug);
  const image = shareImage(product);
  return {
    title: { absolute: title },
    description,
    keywords: productKeywords(product),
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      locale: "en_US",
      siteName: COMPANY.shortName,
      url,
      title,
      description,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image.url],
    },
  };
}

export function categoryTitle(category: CatalogCategory): string {
  return fit(
    [
      `${category.name} in Richmond, CA | Bay Area Landscape Supply`,
      `${category.name} | Richmond, CA Landscape Supply`,
      `${category.name} | Richmond, CA`,
      category.name,
    ],
    TITLE_MAX,
  );
}

export function categoryDescription(category: CatalogCategory): string {
  return category.intro.length <= DESCRIPTION_MAX ? category.intro : `${category.intro.slice(0, DESCRIPTION_MAX - 1).trimEnd()}…`;
}

export function categoryMetadata(category: CatalogCategory, products: readonly CatalogProduct[]): Metadata {
  const title = categoryTitle(category);
  const description = categoryDescription(category);
  const url = categoryPath(category.slug);
  // The category's scene photo is made for sharing (1200×628); otherwise the
  // first product photo, otherwise the site card.
  const scene = CATEGORY_SCENES[category.slug];
  const photo = products.find((p) => p.images.length)?.images[0];
  const image = scene
    ? sceneShareImage(scene)
    : photo
      ? { url: photo.src, width: photo.width, height: photo.height, alt: category.name }
      : DEFAULT_SHARE_IMAGE;
  return {
    title: { absolute: title },
    description,
    keywords: [category.keyword, `${category.keyword} Richmond CA`, `${category.keyword} Bay Area`, category.name.toLowerCase(), "landscape supply Richmond CA"],
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      locale: "en_US",
      siteName: COMPANY.shortName,
      url,
      title,
      description,
      images: [image],
    },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

// ── FAQ ─────────────────────────────────────────────────────────────────
// Answers come only from facts the site already states: the yard address and
// hours (lib/company.ts), the delivery radius, same- and next-day delivery and
// the 1-yard bulk delivery minimum (the delivery and FAQ pages), and how to
// get a quote. Coverage is arithmetic.

export interface Faq {
  q: string;
  a: string;
}

export function productFaqs(product: CatalogProduct, showPrices: boolean = SHOW_PRICES): Faq[] {
  const prices = variationPrices(product, showPrices);
  const quote = prices
    ? {
        q: `How much does ${product.name} cost?`,
        a: `${prices.map((p) => `${unitPriceLabel(p.price, p.unit)}`).join(", ")} at our ${COMPANY.address.city} yard, before sales tax. Delivery is priced by distance and load: request a quote online or call ${COMPANY.phone} and we will confirm the total.`,
      }
    : {
        q: `How do I get a price for ${product.name}?`,
        a: `Request a quote online with the unit and quantity you need, or call the yard at ${COMPANY.phone}. We will confirm the price, availability and any delivery charge.`,
      };
  if (product.isService) {
    return [
      {
        q: `How do I book ${product.name}?`,
        a: `Call the yard at ${COMPANY.phone} or request a quote online. The yard is at ${yardAddress}, open ${yardHours}.`,
      },
      quote,
    ];
  }
  const faqs: Faq[] = [
    {
      q: `Can I pick up ${product.name} at your yard?`,
      a: `Yes. Our yard is at ${yardAddress}, open ${yardHours}. We can load materials directly into your truck or trailer.`,
    },
    {
      q: `Do you deliver ${product.name}?`,
      a:
        `Yes. We deliver across the Bay Area within about ${COMPANY.serviceRadiusMi} miles of our Richmond yard; farther deliveries are quoted case by case. Same-day and next-day delivery are available, subject to scheduling.` +
        (product.soldByCubicYard ? " The minimum delivery order for bulk materials is 1 cubic yard; smaller amounts can be picked up at the yard." : ""),
    },
  ];
  if (product.soldByCubicYard) {
    const [d1, d2] = COVERAGE_DEPTHS;
    faqs.push({
      q: `How much area does a cubic yard of ${product.name} cover?`,
      a: `One cubic yard is 27 cubic feet. Spread ${d1} inches deep it covers about ${cubicYardCoverage(d1)} square feet, and ${d2} inches deep about ${cubicYardCoverage(d2)} square feet.${
        product.variations.length > 1 ? " Half and quarter cubic yards are also available." : ""
      }`,
    });
  }
  faqs.push(quote);
  return faqs;
}

// ── JSON-LD ─────────────────────────────────────────────────────────────

export const BUSINESS_ID = `${SITE_URL}#business`;

export function productJsonLd(product: CatalogProduct, showPrices: boolean = SHOW_PRICES) {
  const category = categoryOf(product);
  const url = absolute(productPath(product.slug));
  const prices = variationPrices(product, showPrices);
  const availability = `https://schema.org/${product.stockStatus === "instock" ? "InStock" : "OutOfStock"}`;
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${url}#product`,
    name: product.name,
    sku: product.sku,
    url,
    description: [product.shortDescription, ...product.description].join(" "),
    category: category.group ? `${category.group} > ${category.name}` : category.name,
    ...(product.images.length ? { image: product.images.map((i) => absolute(i.src)) } : {}),
    keywords: product.keywords.join(", "),
    additionalProperty: product.variations.map((v) => ({
      "@type": "PropertyValue",
      name: "Unit of sale",
      value: v.unit,
    })),
    // Offers only when the storefront shows prices: an offer without a price
    // is reported as an error by Google.
    ...(prices
      ? {
          offers: prices.map((p) => ({
            "@type": "Offer",
            sku: p.sku,
            url,
            price: p.price.toFixed(2),
            priceCurrency: "USD",
            availability,
            seller: { "@id": BUSINESS_ID },
            priceSpecification: {
              "@type": "UnitPriceSpecification",
              price: p.price.toFixed(2),
              priceCurrency: "USD",
              unitText: p.unit,
            },
          })),
        }
      : {}),
  };
}

export interface Crumb {
  name: string;
  path: string;
}

export function breadcrumbJsonLd(crumbs: Crumb[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: absolute(c.path),
    })),
  };
}

export function faqJsonLd(faqs: Faq[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function collectionJsonLd(name: string, path: string, description: string, products: readonly CatalogProduct[]) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name,
    url: absolute(path),
    description,
    provider: { "@id": BUSINESS_ID },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: products.length,
      itemListElement: products.map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: absolute(productPath(p.slug)),
        name: p.name,
      })),
    },
  };
}

/** Serialise for a <script type="application/ld+json"> without breaking out of it. */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function productCrumbs(product: CatalogProduct): Crumb[] {
  const category = categoryOf(product);
  return [
    { name: "Home", path: "/" },
    { name: "Products", path: "/products" },
    { name: category.name, path: categoryPath(category.slug) },
    { name: product.name, path: productPath(product.slug) },
  ];
}
