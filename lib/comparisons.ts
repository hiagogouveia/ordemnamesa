import type { FAQItem } from "@/lib/faq";

// Páginas BOFU de comparação: /comparativos/<slug>
// Posicionam o Ordem na Mesa como execução operacional vs métodos antigos.

export interface ComparisonRow {
  aspect: string;
  alternative: string;
  ordemNaMesa: string;
}

export interface ComparisonPage {
  slug: string;
  /** Nome curto do método comparado (ex.: "planilhas") */
  alternative: string;
  h1: string;
  metaTitle: string;
  metaDescription: string;
  intro: string;
  painPoints: string[];
  rows: ComparisonRow[];
  verdict: string;
  faqs: FAQItem[];
  publishedAt: string;
}

export const comparisonPages: ComparisonPage[] = [
  {
    slug: "ordem-na-mesa-vs-planilhas",
    alternative: "planilhas",
    h1: "Ordem na Mesa vs Planilhas: qual usar para o checklist do restaurante?",
    metaTitle: "Ordem na Mesa vs Planilhas para checklist de restaurante",
    metaDescription:
      "Planilha de checklist é melhor que papel, mas não tem evidência, alerta nem rastreabilidade. Compare planilhas e a plataforma de execução operacional Ordem na Mesa.",
    intro:
      "A planilha é o primeiro passo de quem sai do papel — e por um tempo resolve. Mas ela continua dependendo de alguém lembrar de preencher, não tem evidência fotográfica e ninguém audita dezenas de abas por semana. Veja como a planilha se compara à plataforma de execução operacional Ordem na Mesa.",
    painPoints: [
      "Depende de a equipe lembrar de preencher — sem alerta de tarefa esquecida.",
      "Não exige foto: 'feito' é só um texto digitado, sem prova.",
      "Difícil de auditar: ninguém revisa todas as abas e linhas.",
      "Sem ordem obrigatória nem responsável claro por tarefa.",
      "Quebra fácil no celular e some quando alguém edita por engano.",
    ],
    rows: [
      { aspect: "Evidência fotográfica", alternative: "Não", ordemNaMesa: "Sim, por tarefa crítica" },
      { aspect: "Alerta de tarefa não feita", alternative: "Não", ordemNaMesa: "Sim, em tempo real" },
      { aspect: "Histórico auditável", alternative: "Frágil e editável", ordemNaMesa: "Imutável, com data/hora/responsável" },
      { aspect: "Uso no celular", alternative: "Ruim", ordemNaMesa: "Mobile-first" },
      { aspect: "Ordem das tarefas", alternative: "Não", ordemNaMesa: "Sequencial obrigatória" },
      { aspect: "Multi-unidade", alternative: "Vira caos de arquivos", ordemNaMesa: "Painel consolidado" },
    ],
    verdict:
      "A planilha funciona para começar, mas não garante execução: ela registra intenção, não prova. Quando a operação cresce ou tem mais de um turno, a falta de evidência e de alerta cobra o preço. O Ordem na Mesa mantém a simplicidade e adiciona o que falta: foto, ordem, responsável e histórico auditável.",
    faqs: [
      {
        q: "Planilha de checklist é suficiente para um restaurante pequeno?",
        a: "Para começar, ajuda. Mas mesmo no pequeno a planilha não prova execução nem avisa quando algo foi esquecido. Assim que há mais de um turno ou funcionário, a falta de evidência e responsável começa a doer.",
      },
      {
        q: "Dá para importar minhas planilhas para o Ordem na Mesa?",
        a: "Sim — o conteúdo da sua planilha vira checklists digitais. Cada linha de tarefa passa a ter responsável, ordem e, quando crítica, foto obrigatória.",
      },
    ],
    publishedAt: "2026-06-01",
  },
  {
    slug: "ordem-na-mesa-vs-papel",
    alternative: "checklist em papel",
    h1: "Ordem na Mesa vs Checklist em Papel: por que digitalizar a operação?",
    metaTitle: "Ordem na Mesa vs Checklist em Papel no restaurante",
    metaDescription:
      "Checklist em papel é barato de imprimir e caro de operar: sem evidência, sem histórico, some na faxina. Compare o papel com a execução operacional digital do Ordem na Mesa.",
    intro:
      "O checklist de papel parece a opção mais barata, mas é a mais cara de operar: não avisa quando uma tarefa é esquecida, não tem foto, não mostra quem fez e some no primeiro dia corrido. Veja a comparação direta com a plataforma de execução operacional Ordem na Mesa.",
    painPoints: [
      "Sem rastreabilidade: impossível saber quando a tarefa foi feita.",
      "Sem evidência: marcar um 'X' não prova nada.",
      "Some, molha, rasga e é descartado na faxina.",
      "Sem visão gerencial: o dono precisa estar lá para conferir.",
      "Sem padrão entre turnos e unidades.",
    ],
    rows: [
      { aspect: "Custo de operar", alternative: "Alto (retrabalho e perda)", ordemNaMesa: "Previsível" },
      { aspect: "Evidência fotográfica", alternative: "Não", ordemNaMesa: "Sim" },
      { aspect: "Histórico", alternative: "Some", ordemNaMesa: "Permanente e auditável" },
      { aspect: "Visão remota do gestor", alternative: "Não", ordemNaMesa: "Tempo real, pelo celular" },
      { aspect: "Vigilância sanitária", alternative: "Sem comprovação confiável", ordemNaMesa: "Histórico com foto e responsável" },
    ],
    verdict:
      "O papel custa pouco para imprimir e muito para operar. Ele não comprova nada e desaparece justamente quando você mais precisa — numa fiscalização ou numa reclamação. Digitalizar com o Ordem na Mesa transforma o checklist em execução verificável, sem perder a simplicidade que a equipe já conhece.",
    faqs: [
      {
        q: "Minha equipe é resistente a tecnologia. Vão conseguir usar?",
        a: "Sim. A interface é mobile-first e mais simples que um app de mensagens: a equipe abre o turno, vê a lista e marca conforme executa. O setup leva menos de uma hora e não exige treinamento longo.",
      },
      {
        q: "Preciso de algum hardware para sair do papel?",
        a: "Não. Funciona no navegador do gestor e no celular dos funcionários. Sem instalação e sem equipamento novo.",
      },
    ],
    publishedAt: "2026-06-01",
  },
  {
    slug: "ordem-na-mesa-vs-whatsapp",
    alternative: "WhatsApp",
    h1: "Ordem na Mesa vs WhatsApp: por que o grupo não é um checklist",
    metaTitle: "Ordem na Mesa vs WhatsApp para controle de tarefas",
    metaDescription:
      "O grupo de WhatsApp comunica, mas não controla: tarefa se perde no feed, sem responsável, sem evidência estruturada. Compare com a execução operacional Ordem na Mesa.",
    intro:
      "Quase todo restaurante usa o grupo de WhatsApp para coordenar a equipe. Ele é ótimo para conversar — e péssimo para garantir execução. A tarefa se perde no meio de 200 mensagens, ninguém sabe o que ficou pendente e não há histórico estruturado. Veja a comparação com o Ordem na Mesa.",
    painPoints: [
      "A tarefa se perde no feed de mensagens.",
      "Sem responsável claro nem confirmação de execução.",
      "Foto vira mais uma imagem perdida na conversa, sem vínculo com a tarefa.",
      "Impossível auditar: ninguém rola semanas de conversa.",
      "Misturado com assuntos pessoais e dispersão da equipe.",
    ],
    rows: [
      { aspect: "Tarefa estruturada", alternative: "Não (texto solto)", ordemNaMesa: "Sim, com responsável e ordem" },
      { aspect: "Confirmação de execução", alternative: "Incerta", ordemNaMesa: "Marcação + foto" },
      { aspect: "Histórico organizado", alternative: "Não", ordemNaMesa: "Por checklist, data e responsável" },
      { aspect: "Foco da equipe", alternative: "Disperso", ordemNaMesa: "Só a rotina do turno" },
      { aspect: "Auditoria", alternative: "Inviável", ordemNaMesa: "Direta no histórico" },
    ],
    verdict:
      "WhatsApp é um excelente canal de comunicação e um péssimo sistema de controle. Use-o para avisos — e deixe a execução das rotinas no Ordem na Mesa, onde cada tarefa tem dono, ordem, evidência e histórico. O alerta de pendência pode até chegar no WhatsApp, mas o controle fica estruturado.",
    faqs: [
      {
        q: "Posso continuar usando o WhatsApp junto com o Ordem na Mesa?",
        a: "Sim. O WhatsApp continua ótimo para comunicação rápida. O Ordem na Mesa cuida da execução estruturada das rotinas — o que precisa de responsável, ordem, evidência e histórico.",
      },
      {
        q: "O Ordem na Mesa envia alertas?",
        a: "O acompanhamento é em tempo real pelo painel, e o suporte é feito por WhatsApp com pessoas reais. A execução das tarefas fica registrada no sistema, não perdida no chat.",
      },
    ],
    publishedAt: "2026-06-01",
  },
  {
    slug: "ordem-na-mesa-vs-google-forms",
    alternative: "Google Forms",
    h1: "Ordem na Mesa vs Google Forms para checklist de restaurante",
    metaTitle: "Ordem na Mesa vs Google Forms para checklist operacional",
    metaDescription:
      "Google Forms coleta respostas, mas não é feito para rotina operacional: sem ordem, sem alerta, sem visão de execução por turno. Compare com o Ordem na Mesa.",
    intro:
      "O Google Forms é gratuito e fácil de montar, e por isso muita gente tenta usá-lo como checklist. O problema é que ele foi feito para coletar respostas pontuais, não para garantir a execução de uma rotina diária por turno. Veja a comparação com a plataforma de execução operacional Ordem na Mesa.",
    painPoints: [
      "Feito para formulário, não para rotina recorrente por turno.",
      "Sem ordem obrigatória nem tarefa crítica.",
      "Sem alerta quando uma resposta (tarefa) não chega.",
      "Respostas viram uma planilha bruta que ninguém analisa.",
      "Sem visão gerencial de progresso em tempo real.",
    ],
    rows: [
      { aspect: "Rotina recorrente por turno", alternative: "Manual e frágil", ordemNaMesa: "Nativa (turno, recorrência)" },
      { aspect: "Tarefa crítica e ordem", alternative: "Não", ordemNaMesa: "Sim" },
      { aspect: "Alerta de não execução", alternative: "Não", ordemNaMesa: "Sim, tempo real" },
      { aspect: "Evidência fotográfica vinculada", alternative: "Limitada", ordemNaMesa: "Por tarefa, no histórico" },
      { aspect: "Visão gerencial", alternative: "Planilha bruta", ordemNaMesa: "Painel de execução" },
    ],
    verdict:
      "Google Forms é uma boa ferramenta de formulário, mas não de execução operacional. Para uma rotina diária com turnos, responsáveis, ordem e evidência, ele não foi desenhado. O Ordem na Mesa é construído exatamente para isso — e mantém a facilidade de uso que faz o Forms parecer atraente.",
    faqs: [
      {
        q: "Por que não usar Google Forms como checklist se é grátis?",
        a: "Porque ele coleta respostas, mas não garante execução: não tem ordem obrigatória, tarefa crítica, alerta de pendência nem visão de progresso por turno. O 'grátis' custa caro em retrabalho e falta de controle.",
      },
      {
        q: "O Ordem na Mesa é tão fácil de configurar quanto um formulário?",
        a: "Sim. Você cria as áreas e monta os checklists em minutos, e a equipe começa a usar no próximo turno. A diferença é que ele foi feito para rotina operacional, não para um formulário pontual.",
      },
    ],
    publishedAt: "2026-06-01",
  },
];

export function getComparisonBySlug(slug: string): ComparisonPage | undefined {
  return comparisonPages.find((page) => page.slug === slug);
}

export function getAllComparisons(): ComparisonPage[] {
  return comparisonPages;
}
