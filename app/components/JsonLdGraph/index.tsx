import { type JsonLd, serializeJsonLd } from "@/lib/structured-data";

/**
 * A page's structured data, as the one `<script type="application/ld+json">`
 * the Next docs recommend rendering from the page itself. A plain <script> and
 * not next/script: this is data for crawlers, never executable code.
 */
export function JsonLdGraph({ graph }: { graph: JsonLd[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(graph) }}
    />
  );
}
