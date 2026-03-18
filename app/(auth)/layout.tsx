import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Login",
  description:
    "Acesse o painel de gestão do Ordem na Mesa. Controle checklists, equipe e operações do seu restaurante.",
  path: "/login",
});

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
