import { DemoWalkthrough } from "./_components/DemoWalkthrough";

/**
 * Página `/demo` — entry point do walkthrough guiado.
 *
 * O `DemoWalkthrough` é um Client Component que faz toda a interação
 * (estado de passo, ESC, animações). O Next.js cuida do code-splitting
 * por rota automaticamente — não precisamos de `dynamic({ ssr: false })`
 * porque o componente já gerencia hydration de forma segura (estado inicial
 * fixo, leitura de query string apenas em useEffect).
 */
export default function DemoPage() {
  return <DemoWalkthrough />;
}
