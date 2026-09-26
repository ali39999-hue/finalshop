/**
 * SEO helpers (W11, roadmap §15): canonical URLs, sitemap XML and
 * schema.org JSON-LD. All money surfaces as major-unit decimal strings —
 * computed from the money kernel's minor units before reaching this layer.
 */

export interface SitemapEntry {
  loc: string;
  lastmod?: string;
  changefreq?: "daily" | "weekly" | "monthly";
  priority?: string;
}

export function canonicalUrl(baseUrl: string, locale: string, path: string): string {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const cleanPath = path.replace(/^\/+/, "");
  if (cleanPath.length === 0) return `${cleanBase}/${locale}`;
  return `${cleanBase}/${locale}/${cleanPath}`;
}

export function buildSitemapXml(entries: SitemapEntry[]): string {
  const urls = entries
    .map((entry) => {
      const lastmod = entry.lastmod
        ? `<lastmod>${new Date(entry.lastmod).toISOString()}</lastmod>`
        : "";
      const changefreq = entry.changefreq ? `<changefreq>${entry.changefreq}</changefreq>` : "";
      const priority = entry.priority ? `<priority>${entry.priority}</priority>` : "";
      return `<url><loc>${escapeXml(entry.loc)}</loc>${lastmod}${changefreq}${priority}</url>`;
    })
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`
  );
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Minor units → decimal major string ("2500" → "25.00" for USD). */
export function minorToMajorString(minor: bigint, decimals: number): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const whole = abs / BigInt(10 ** decimals);
  const fraction = abs % BigInt(10 ** decimals);
  const fractionStr =
    decimals === 0
      ? ""
      : "." + fraction.toString().padStart(decimals, "0");
  return `${negative ? "-" : ""}${whole.toString()}${fractionStr}`;
}

export interface ProductJsonLdInput {
  name: string;
  description?: string;
  url: string;
  image?: string;
  priceMinor: bigint | null;
  currency: string;
  currencyDecimals: number;
  inStock: boolean;
}

/** schema.org/Product with an Offer — safe for unauthenticated storefront HTML. */
export function buildProductJsonLd(input: ProductJsonLdInput): Record<string, unknown> {
  const offers =
    input.priceMinor === null
      ? undefined
      : {
          "@type": "Offer",
          price: minorToMajorString(input.priceMinor, input.currencyDecimals),
          priceCurrency: input.currency,
          availability: input.inStock
            ? "https://schema.org/InStock"
            : "https://schema.org/OutOfStock",
        };
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: input.name,
    url: input.url,
  };
  if (input.description) jsonLd.description = input.description;
  if (input.image) jsonLd.image = input.image;
  if (offers) jsonLd.offers = offers;
  return jsonLd;
}
