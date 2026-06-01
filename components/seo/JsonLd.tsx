/**
 * Renderiza um bloco de structured data (schema.org) como <script type="application/ld+json">.
 * Server Component — seguro para usar em qualquer página/layout.
 */
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
