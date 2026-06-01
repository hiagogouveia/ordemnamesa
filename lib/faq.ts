export interface FAQItem {
  q: string;
  a: string;
}

// Fonte única das perguntas frequentes da landing.
// Usada tanto no componente visual (FAQSection) quanto no FAQPage JSON-LD da home.
export const HOME_FAQ: FAQItem[] = [
  {
    q: "O que é uma plataforma de execução operacional para restaurantes?",
    a: "É um software que garante que as rotinas do restaurante sejam realmente executadas — não apenas planejadas. No Ordem na Mesa, isso significa checklists digitais de abertura, fechamento, higiene e recebimento, com evidência fotográfica, ordem das tarefas e histórico auditável. Diferente de um PDV (que cuida de pedidos e vendas), a execução operacional cuida de como a operação roda no dia a dia.",
  },
  {
    q: "Preciso instalar algo no restaurante?",
    a: "Não. O Ordem na Mesa funciona 100% pelo navegador (gestor) e pelo celular dos funcionários. Sem instalação, sem hardware novo, sem mexer na infra do seu restaurante.",
  },
  {
    q: "Funciona no celular?",
    a: "Sim — e é justamente onde ele brilha. A equipe usa pelo celular pessoal ou um dispositivo do estabelecimento. Interface mobile-first, otimizada para um polegar e tela pequena.",
  },
  {
    q: "Serve para qualquer tipo de restaurante?",
    a: "Sim. Bar, pizzaria, hamburgueria, cantina, cafeteria, restaurante self-service, açaiteria, dark kitchen — qualquer operação com equipe que executa rotinas se beneficia. Os checklists são totalmente personalizáveis.",
  },
  {
    q: "Precisa de internet o tempo todo?",
    a: "Funciona online com sincronização em tempo real, e tem modo offline para áreas com sinal instável. As tarefas marcadas offline sincronizam assim que a conexão volta.",
  },
  {
    q: "Quanto tempo leva para colocar no ar?",
    a: "Menos de uma hora para o setup básico. Você cria as áreas, monta os primeiros checklists e a equipe já começa a usar no próximo turno. Sem treinamento longo.",
  },
  {
    q: "Tem multi-loja para quem tem mais de uma unidade?",
    a: "Sim. Você gerencia várias unidades no mesmo painel, com checklists próprios por loja e visão consolidada por rede. Ideal para grupos e franquias.",
  },
  {
    q: "Como funciona o suporte?",
    a: "Atendimento direto pelo WhatsApp com pessoas reais. Sem ticket, sem URA. Você manda mensagem, a gente resolve.",
  },
  {
    q: "Quanto custa?",
    a: "O preço varia conforme o tamanho da operação. Há teste grátis de 30 dias após aprovação. Fale com a gente pelo WhatsApp e mandamos uma proposta sob medida — sem surpresa, sem letra miúda.",
  },
];
