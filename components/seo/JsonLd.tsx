/**
 * Renderiza um bloco de structured data (schema.org) como <script type="application/ld+json">.
 * Server Component — seguro para usar em qualquer página/layout.
 */
export function JsonLd({ data }: { data: object }) {
  // Escapa `<`, `>` e `&` para impedir quebra do contexto <script> (ex.: um valor
  // contendo "</script>") caso `data` algum dia inclua conteúdo controlado por usuário.
  const json = JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
