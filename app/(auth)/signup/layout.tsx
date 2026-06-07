import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

// Override do layout (auth): a página de cadastro DEVE ser indexável (página
// pública de conversão). O layout pai aplica noindex às telas de auth (login,
// recuperação de senha), mas o signup precisa aparecer na busca.
export const metadata: Metadata = buildMetadata({
  title: "Criar conta grátis",
  description:
    "Crie sua conta no Ordem na Mesa e teste grátis por 30 dias. Checklists digitais, gestão de equipe e controle total da operação do seu restaurante.",
  path: "/signup",
});

export default function SignupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
