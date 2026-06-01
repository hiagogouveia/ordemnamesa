import type { Metadata } from "next";
import Link from "next/link";
import {
  buildMetadata,
  siteConfig,
  breadcrumbJsonLd,
  faqPageJsonLd,
} from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import { getAllChecklists } from "@/lib/programmatic";
import { getPostsBySlugs } from "@/lib/blog";

// Curadoria estratégica fixa: ponte → conceito → execução de tarefas.
const LEITURA_RECOMENDADA = [
  "software-de-checklist-vs-execucao-operacional",
  "checklists-digitais-para-restaurantes",
  "controle-de-tarefas-em-restaurantes",
];

export const metadata: Metadata = buildMetadata({
  title: "Execução Operacional para Restaurantes: o guia completo da categoria",
  description:
    "Execução operacional para restaurantes: o que é, por que as operações falham, como difere de PDV e ERP, os 4 pilares e como medir. O guia definitivo da categoria.",
  path: "/execucao-operacional",
});

const FAQS = [
  {
    q: "O que é execução operacional para restaurantes?",
    a: "É a disciplina de garantir que as rotinas do restaurante — abertura, fechamento, higiene, recebimento e troca de turno — sejam cumpridas no padrão, com responsável, ordem e comprovação. Uma plataforma de execução operacional digitaliza esses checklists, exige evidência (foto) e dá visibilidade em tempo real ao gestor.",
  },
  {
    q: "Qual a diferença entre execução operacional e gestão de restaurante?",
    a: "Gestão de restaurante é um termo amplo que costuma incluir vendas, finanças e cardápio. Execução operacional é a camada específica de garantir que as rotinas do dia a dia aconteçam corretamente — um recorte mais profundo e operacional.",
  },
  {
    q: "Plataforma de execução operacional é a mesma coisa que PDV?",
    a: "Não. O PDV cuida de pedidos, pagamentos e vendas. A plataforma de execução operacional cuida de como a operação roda por trás da venda — as rotinas, a equipe e os padrões. São camadas complementares; uma não substitui a outra.",
  },
  {
    q: "Que rotinas entram na execução operacional?",
    a: "As quatro âncoras são abertura, fechamento, higiene e recebimento de mercadorias, costuradas pela troca de turno. A partir delas, qualquer rotina recorrente do restaurante pode ser padronizada.",
  },
  {
    q: "Como medir a execução operacional?",
    a: "Pela taxa de conformidade, tarefas concluídas por turno e unidade, falhas recorrentes, capacidade de auditoria e evidências registradas — todos extraídos da própria operação, sem necessidade de estimativas.",
  },
  {
    q: "Execução operacional ajuda na vigilância sanitária e na RDC 216?",
    a: "Sim. A RDC 216/2004 da Anvisa exige boas práticas e o registro delas. Um checklist digital com evidência fotográfica e histórico por responsável é a forma mais simples de comprovar higienização e controle de temperatura numa fiscalização.",
  },
  {
    q: "Que tipos de restaurante se beneficiam?",
    a: "Hamburguerias, pizzarias, cafeterias, bares, açaiterias, restaurantes self-service, dark kitchens e franquias — qualquer operação com equipe que executa rotinas e precisa de padrão entre turnos e unidades.",
  },
  {
    q: "Preciso trocar meu PDV para usar uma plataforma de execução operacional?",
    a: "Não. Ela atua em uma camada diferente e convive com o seu PDV e o seu ERP. Você continua vendendo no mesmo sistema; a plataforma de execução operacional cuida das rotinas que sustentam a operação.",
  },
];

const FAILURES = [
  {
    t: "Esquecimento de tarefas",
    d: "A rotina vive na cabeça das pessoas. No dia tranquilo funciona; no dia cheio — fila na porta, equipe reduzida, um imprevisto — é quando a tarefa some. E o que é esquecido raramente é o trivial: é a aferição de temperatura, a troca do óleo, a higienização da bancada de manipulação.",
  },
  {
    t: "Falta de padronização",
    d: "Sem um padrão escrito e executável, cada colaborador faz à sua maneira. O resultado do turno depende de quem está trabalhando, não de como o restaurante decidiu operar. Isso é o oposto de marca: o cliente recebe uma experiência diferente a cada visita.",
  },
  {
    t: "Troca de turno",
    d: "A passagem entre turnos é o ponto onde a informação evapora. O turno da noite herda pendências que não conhece, uma praça desabastecida e um caixa sem conferência. Sem uma passagem estruturada, instala-se o 'achei que era você'.",
  },
  {
    t: "Dependência do dono",
    d: "Quando a operação só roda com o dono presente cobrando, ele virou o sistema operacional do próprio negócio — e isso não escala. Não dá para abrir uma segunda unidade, tirar férias ou crescer enquanto a qualidade depende da sua sombra sobre a equipe.",
  },
  {
    t: "Falta de auditoria e evidência",
    d: "'Limpei o fritador' não é a mesma coisa que uma foto do fritador limpo. Sem registro com data, hora, responsável e evidência, é impossível auditar o que aconteceu — seja para corrigir a equipe, seja para comprovar conformidade numa visita da vigilância sanitária.",
  },
];

const COMPARISON = [
  {
    tipo: "PDV (ponto de venda)",
    foco: "Vendas e pedidos",
    pergunta: "Quanto e o que eu vendi?",
    naoFaz: "Não garante que as rotinas operacionais aconteçam",
  },
  {
    tipo: "ERP",
    foco: "Gestão administrativa e financeira",
    pergunta: "Como está a saúde financeira/administrativa?",
    naoFaz: "Não governa a execução no chão do turno",
  },
  {
    tipo: "Software de checklist (genérico)",
    foco: "Listas de verificação",
    pergunta: "O que precisa ser feito?",
    naoFaz: "Costuma ser genérico: sem turno, recebimento e contexto de restaurante",
  },
  {
    tipo: "Plataforma de execução operacional",
    foco: "Execução das rotinas no padrão",
    pergunta: "As rotinas estão sendo cumpridas, por quem e com prova?",
    naoFaz: "Não processa vendas nem substitui o ERP",
  },
];

const METRICS = [
  {
    t: "Taxa de conformidade",
    d: "Percentual de itens do checklist concluídos dentro do padrão e do prazo. É o termômetro geral da disciplina operacional.",
  },
  {
    t: "Tarefas concluídas por turno/unidade",
    d: "Mostra onde a execução é forte e onde escorrega, permitindo comparar turnos, lojas e equipes.",
  },
  {
    t: "Falhas recorrentes",
    d: "Quais itens 'falham sempre'. Falha recorrente quase nunca é problema de pessoa; é problema de processo, treinamento ou dimensionamento.",
  },
  {
    t: "Auditoria",
    d: "A capacidade de revisar o que foi feito, por quem e quando, de forma confiável.",
  },
  {
    t: "Evidências",
    d: "Fotos e registros que transformam 'foi feito' em prova verificável, úteis para a gestão e para a fiscalização sanitária.",
  },
];

const PROFILES = [
  { t: "Hamburgueria", d: "Pico intenso e curto: chapa, mise en place e estoque de pães precisam estar prontos antes do primeiro pedido. Abertura padronizada é decisiva." },
  { t: "Pizzaria", d: "Forno e massa ditam o ritmo; planejamento de boleamento e mise en place de coberturas evitam falta no pico e perda no fechamento." },
  { t: "Cafeteria", d: "Qualidade do café depende de calibração e limpeza diárias da máquina; a vitrine precisa estar cheia no horário de maior fluxo." },
  { t: "Franquia", d: "O padrão é o ativo da marca. A franqueadora precisa garantir que cada unidade execute igual, com auditoria e evidência comparáveis entre lojas." },
  { t: "Operação multiunidade", d: "Visão consolidada por rede, com checklists próprios por loja, é o que torna possível gerir várias unidades sem estar fisicamente em todas." },
];

const STEPS = [
  {
    t: "1. Comece pelas rotinas que mais doem",
    d: "Não digitalize tudo de uma vez. Escolha as duas rotinas que mais geram problema quando falham — normalmente abertura e higiene.",
    href: "/modelos/checklist-abertura-hamburgueria",
    linkLabel: "Ver modelo de checklist de abertura",
  },
  {
    t: "2. Transforme cada item em tarefa com responsável",
    d: "Pegue o checklist de papel que você já usa, transforme cada item em uma tarefa digital, defina o responsável e marque o que é crítico (exige foto).",
    href: "/modelos/checklist-limpeza-restaurante",
    linkLabel: "Ver modelo de checklist de limpeza",
  },
  {
    t: "3. Organize por turno",
    d: "Separe abertura, troca de turno e fechamento. Cada turno recebe a rotina certa, na ordem certa, sem depender da memória.",
    href: "/modelos/checklist-troca-turno-restaurante",
    linkLabel: "Ver modelo de troca de turno",
  },
  {
    t: "4. Feche o ciclo no recebimento e no estoque",
    d: "Conecte recebimento de mercadorias e controle de estoque — é onde o custo e a segurança alimentar entram pela porta dos fundos.",
    href: "/modelos/checklist-recebimento-restaurante",
    linkLabel: "Ver modelo de recebimento",
  },
];

const GLOSSARY = [
  { t: "POP (Procedimento Operacional Padronizado)", d: "Documento que descreve o passo a passo de uma tarefa para que seja executada sempre da mesma forma. A RDC 216 exige POPs para itens como higienização e controle de pragas." },
  { t: "APPCC / HACCP", d: "Análise de Perigos e Pontos Críticos de Controle: metodologia internacional (base no Codex Alimentarius) para identificar e controlar perigos ao longo do processo de produção de alimentos." },
  { t: "BPF (Boas Práticas de Fabricação)", d: "Conjunto de práticas que garantem condições higiênico-sanitárias adequadas. Em serviços de alimentação, são definidas pela RDC 216/2004 da Anvisa." },
  { t: "FIFO (First In, First Out)", d: "Regra de rotação de estoque: o primeiro item a entrar é o primeiro a sair, evitando que produtos antigos vençam no fundo da prateleira." },
  { t: "PVPS (Primeiro que Vence, Primeiro que Sai)", d: "Versão da rotação de estoque baseada na validade: usa-se primeiro o que vence antes. Reduz perda por vencimento." },
  { t: "Zona de perigo (temperatura)", d: "Faixa de temperatura, geralmente entre 5 °C e 60 °C, em que microrganismos se multiplicam mais rapidamente. Por isso o controle e o registro de temperatura são centrais." },
  { t: "Conformidade operacional", d: "Grau em que as rotinas são executadas dentro do padrão e do prazo definidos. É o principal indicador de uma operação saudável." },
  { t: "Evidência fotográfica", d: "Foto que comprova a execução de uma tarefa crítica. Transforma 'foi feito' em prova verificável, com data, hora e responsável." },
];

const SOURCES = [
  { label: "Anvisa — Resolução RDC nº 216/2004 (texto oficial)", url: "https://bvsms.saude.gov.br/bvs/saudelegis/anvisa/2004/res0216_15_09_2004.html" },
  { label: "Anvisa — Cartilha de Boas Práticas para Serviços de Alimentação", url: "https://www.gov.br/anvisa/pt-br/centraisdeconteudo/publicacoes/alimentos/manuais-guias-e-orientacoes/cartilha-boas-praticas-para-servicos-de-alimentacao.pdf" },
  { label: "FAO/OMS — Codex Alimentarius (base do APPCC/HACCP)", url: "https://www.fao.org/fao-who-codexalimentarius" },
  { label: "Ministério da Saúde — Situação epidemiológica das DTHA", url: "https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/d/dtha/situacao-epidemiologica" },
  { label: "Lei nº 6.437/1977 — infrações à legislação sanitária", url: "https://www.planalto.gov.br/ccivil_03/leis/l6437.htm" },
  { label: "Embrapa — Perdas e desperdício de alimentos", url: "https://www.embrapa.br/tema-perdas-e-desperdicio-de-alimentos/sobre-o-tema" },
];

const extLink =
  "text-primary underline underline-offset-2 hover:opacity-80";

export default function ExecucaoOperacionalPage() {
  const checklists = getAllChecklists();
  const leituraRecomendada = getPostsBySlugs(LEITURA_RECOMENDADA);

  return (
    <main className="mx-auto max-w-3xl px-4 py-24 sm:px-6 lg:px-8">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Início", path: "/" },
          { name: "Execução operacional", path: "/execucao-operacional" },
        ])}
      />
      <JsonLd data={faqPageJsonLd(FAQS)} />

      <nav className="mb-8 text-sm text-slate-500 dark:text-[#93adc8]">
        <Link href="/" className="hover:text-primary">Início</Link>
        <span className="mx-2">/</span>
        <span>Execução operacional</span>
      </nav>

      <article className="text-slate-700 dark:text-[#c5d6e6] leading-relaxed">
        <header className="mb-10">
          <p className="text-xs font-mono uppercase tracking-widest text-primary mb-3">
            Guia da categoria
          </p>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-slate-900 dark:text-white mb-5">
            O que é execução operacional para restaurantes?
          </h1>
          <p className="text-lg rounded-2xl border border-primary/30 bg-primary/5 p-5 text-slate-800 dark:text-[#dce8f3]">
            <strong>Execução operacional para restaurantes é a disciplina de
            garantir que as rotinas do dia a dia — abertura, fechamento, higiene
            e recebimento — sejam de fato cumpridas no padrão, com responsável
            definido, ordem clara e comprovação.</strong> Uma plataforma de
            execução operacional digitaliza esses checklists, registra
            evidências e dá ao gestor visibilidade em tempo real.
          </p>
          <p className="mt-5 text-xs text-slate-500 dark:text-[#7e98ac]">
            Por Equipe Ordem na Mesa · Atualizado em junho de 2026
          </p>
        </header>

        <p className="mb-6">
          Restaurante quase nunca quebra na venda. Quebra na execução: a tarefa
          que ninguém lembrou de fazer, a câmara fria que passou a noite fora da
          temperatura, o pão que faltou no pico, o padrão de limpeza que cai
          quando o dono não está. Vender é a parte visível; sustentar a operação
          por trás da venda é o que separa o restaurante que cresce do que vive
          apagando incêndio.
        </p>
        <p className="mb-12">
          Este é o guia completo, em português, sobre execução operacional para
          restaurantes: o que é, por que as operações falham, como a categoria
          se diferencia de PDV e ERP, quais são seus pilares, como medi-la e
          quando adotá-la.
        </p>

        <section className="mb-12">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
            Por que restaurantes falham na execução
          </h2>
          <p className="mb-5">
            A maioria das falhas operacionais não vem de má vontade da equipe —
            vem da ausência de um sistema que garanta que o combinado aconteça.
            Cinco causas se repetem em praticamente toda operação:
          </p>
          <div className="space-y-4">
            {FAILURES.map((f) => (
              <div key={f.t}>
                <h3 className="font-bold text-slate-900 dark:text-white">{f.t}</h3>
                <p className="mt-1">{f.d}</p>
              </div>
            ))}
          </div>
          <p className="mt-5">
            Essas cinco causas têm um denominador comum: a intenção existe, mas a
            execução não é verificável. É esse vazio que uma plataforma de
            execução operacional preenche.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
            O que é uma plataforma de execução operacional para restaurantes
          </h2>
          <p className="mb-4">
            <strong>Uma plataforma de execução operacional para restaurantes é o
            software que transforma as rotinas do restaurante em checklists
            digitais executáveis — com ordem obrigatória, responsável, evidência
            fotográfica e histórico auditável — e dá ao gestor visibilidade em
            tempo real sobre o que foi feito, por quem e quando.</strong>
          </p>
          <p className="mb-4">
            Ela não substitui o sistema de vendas. Atua na camada que normalmente
            fica sem dono: a execução das rotinas que sustentam a operação.
            Enquanto um checklist de papel apenas lista o que fazer, a plataforma
            garante que aquilo aconteça, registra a prova e expõe o desvio no
            momento em que ele ocorre — não no fim do mês, quando já virou
            prejuízo. O{" "}
            <Link href="/" className="text-primary hover:underline">
              Ordem na Mesa
            </Link>{" "}
            é uma plataforma de execução operacional para restaurantes construída
            sobre quatro capacidades que um checklist simples não tem: estrutura
            por turno e recorrência, evidência e criticidade, rastreabilidade e
            visão gerencial.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
            PDV, ERP, software de checklist e plataforma de execução operacional
          </h2>
          <p className="mb-5">
            Esses quatro tipos de software resolvem problemas distintos e, na
            maioria das operações maduras, convivem. Confundi-los é o erro mais
            comum de quem está avaliando ferramentas.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-300 dark:border-[#233f48]">
                  <th className="py-3 pr-4 font-bold text-slate-900 dark:text-white">Tipo</th>
                  <th className="py-3 pr-4 font-bold text-slate-900 dark:text-white">Foco</th>
                  <th className="py-3 pr-4 font-bold text-slate-900 dark:text-white">Responde</th>
                  <th className="py-3 font-bold text-slate-900 dark:text-white">O que não faz</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) => (
                  <tr key={row.tipo} className="border-b border-slate-200 dark:border-[#1b3038] align-top">
                    <td className="py-3 pr-4 font-medium text-slate-900 dark:text-white">{row.tipo}</td>
                    <td className="py-3 pr-4">{row.foco}</td>
                    <td className="py-3 pr-4">{row.pergunta}</td>
                    <td className="py-3">{row.naoFaz}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-5">
            O software de checklist é a ferramenta; a plataforma de execução
            operacional é a categoria que organiza essa ferramenta em torno da
            realidade do restaurante — turnos, áreas, criticidade, evidência e
            gestão multiunidade. Veja na prática por que isso supera{" "}
            <Link href="/comparativos/ordem-na-mesa-vs-planilhas" className="text-primary hover:underline">
              planilhas
            </Link>{" "}
            e o{" "}
            <Link href="/comparativos/ordem-na-mesa-vs-whatsapp" className="text-primary hover:underline">
              grupo de WhatsApp
            </Link>
            .
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
            Os 4 pilares da execução operacional
          </h2>
          <p className="mb-5">
            Toda a execução operacional de um restaurante se organiza em quatro
            rotinas-âncora. Dominar essas quatro resolve a maior parte das falhas.
          </p>

          <h3 className="font-bold text-slate-900 dark:text-white mb-1">1. Abertura</h3>
          <p className="mb-4">
            Define se o restaurante começa o dia pronto para vender: ligar e
            aferir equipamentos, conferir temperatura de geladeiras e câmaras
            frias, montar o mise en place, checar estoques de itens de alto giro
            e abrir o caixa. Uma abertura mal feita compromete o primeiro pico de
            vendas, o horário em que cada falha custa mais caro. Veja um{" "}
            <Link href="/modelos/checklist-abertura-hamburgueria" className="text-primary hover:underline">
              checklist de abertura
            </Link>{" "}
            completo.
          </p>

          <h3 className="font-bold text-slate-900 dark:text-white mb-1">2. Fechamento</h3>
          <p className="mb-4">
            Protege equipamento, insumos e caixa, e prepara a abertura do dia
            seguinte: limpeza profunda, armazenamento correto com rótulo e
            temperatura, registro de perdas, conferência do caixa contra o
            sistema e checagem de segurança. Fechamento relaxado é a causa nº 1 de
            uma abertura ruim no dia seguinte — veja um{" "}
            <Link href="/modelos/checklist-fechamento-pizzaria" className="text-primary hover:underline">
              checklist de fechamento
            </Link>
            .
          </p>

          <h3 className="font-bold text-slate-900 dark:text-white mb-1">3. Higiene</h3>
          <p className="mb-4">
            É, ao mesmo tempo, obrigação legal e diferencial competitivo. No
            Brasil, a referência é a{" "}
            <a href={SOURCES[0].url} target="_blank" rel="noopener noreferrer" className={extLink}>
              RDC 216/2004 da Anvisa
            </a>
            , que estabelece as Boas Práticas para serviços de alimentação —
            higienização de instalações, equipamentos e utensílios, controle de
            temperatura, higiene dos manipuladores e o registro dessas
            atividades (veja a{" "}
            <a href={SOURCES[1].url} target="_blank" rel="noopener noreferrer" className={extLink}>
              cartilha oficial de Boas Práticas
            </a>
            ). Operações mais estruturadas adotam ainda o APPCC (Análise de
            Perigos e Pontos Críticos de Controle), metodologia reconhecida
            internacionalmente, com base no{" "}
            <a href={SOURCES[2].url} target="_blank" rel="noopener noreferrer" className={extLink}>
              Codex Alimentarius (FAO/OMS)
            </a>
            . Um ponto técnico que orienta boa parte da rotina é a zona de perigo
            de temperatura — a faixa, geralmente entre 5 °C e 60 °C, em que
            microrganismos se multiplicam mais rapidamente. O ponto-chave para o
            gestor: a norma exige não só fazer, mas comprovar — e é aí que a
            evidência fotográfica e o histórico auditável deixam de ser luxo.
            Comece pelo{" "}
            <Link href="/modelos/checklist-limpeza-restaurante" className="text-primary hover:underline">
              checklist de limpeza
            </Link>
            .
          </p>

          <h3 className="font-bold text-slate-900 dark:text-white mb-1">4. Recebimento</h3>
          <p className="mb-4">
            Boa parte dos problemas de custo e de segurança alimentar entra pela
            porta dos fundos. O recebimento confere nota fiscal contra o pedido,
            mede a temperatura de congelados e resfriados na chegada, verifica
            validade, integridade de embalagem e qualidade, e garante o
            armazenamento imediato seguindo PVPS/FIFO. Veja um{" "}
            <Link href="/modelos/checklist-recebimento-restaurante" className="text-primary hover:underline">
              checklist de recebimento
            </Link>
            .
          </p>
          <p>
            Esses quatro pilares não vivem isolados: a{" "}
            <Link href="/modelos/checklist-troca-turno-restaurante" className="text-primary hover:underline">
              troca de turno
            </Link>{" "}
            costura todos eles, garantindo que o que ficou pendente em um turno
            seja comunicado ao próximo com responsável claro.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
            Por que isso importa — o que dizem os dados
          </h2>
          <p className="mb-4">
            A execução da higiene não é burocracia: é prevenção. Segundo o{" "}
            <a href={SOURCES[3].url} target="_blank" rel="noopener noreferrer" className={extLink}>
              Ministério da Saúde
            </a>
            , o Brasil notificou, em média, <strong>662 surtos de doenças de
            transmissão hídrica e alimentar (DTHA) por ano</strong> no período de
            2007 a 2020 — boa parte associada a falhas de manipulação,
            temperatura e higiene que uma rotina bem executada ajuda a evitar.
          </p>
          <p className="mb-4">
            O descumprimento das normas sanitárias também tem custo: a{" "}
            <a href={SOURCES[4].url} target="_blank" rel="noopener noreferrer" className={extLink}>
              Lei nº 6.437/1977
            </a>{" "}
            define as infrações à legislação sanitária e prevê sanções que vão de
            advertência a multa e interdição do estabelecimento. E há ainda a
            perda silenciosa: o desperdício de alimentos é um desafio nacional —
            a{" "}
            <a href={SOURCES[5].url} target="_blank" rel="noopener noreferrer" className={extLink}>
              Embrapa
            </a>{" "}
            aponta um desperdício estimado em cerca de 94 kg per capita ao ano no
            consumo familiar no Brasil (um indicador do contexto; a perda da sua
            operação deve ser medida no seu próprio estoque). Recebimento
            conferido, rotação por validade e fechamento correto atacam
            diretamente essa perda.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
            Como medir a execução operacional
          </h2>
          <p className="mb-5">
            O que não é medido não é gerido. A execução operacional vira gestão
            de verdade quando você acompanha indicadores simples — todos
            extraídos da própria operação, sem necessidade de inventar números:
          </p>
          <div className="space-y-3">
            {METRICS.map((m) => (
              <div key={m.t}>
                <h3 className="font-bold text-slate-900 dark:text-white">{m.t}</h3>
                <p className="mt-1">{m.d}</p>
              </div>
            ))}
          </div>
          <p className="mt-5">
            A régua certa não é "a equipe é boa?" — é "a execução está no padrão,
            de forma consistente, mesmo quando o dono não está?".
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
            Benefícios financeiros
          </h2>
          <p className="mb-4">
            A execução operacional não é custo: é proteção de margem. Os ganhos
            aparecem em quatro frentes — e o tamanho de cada um você deve medir na
            sua própria operação, comparando o antes e o depois:
          </p>
          <ul className="space-y-2 list-disc pl-5">
            <li><strong>Redução de retrabalho</strong> — tarefa feita certa na primeira vez não precisa ser refeita.</li>
            <li><strong>Redução de desperdício</strong> — controle de validade, PVPS/FIFO no estoque e recebimento conferido atacam a perda de insumos.</li>
            <li><strong>Redução de falhas operacionais</strong> — menos erro de processo significa menos prejuízo invisível e menos risco sanitário.</li>
            <li><strong>Padronização entre unidades</strong> — padrão consistente é o que permite escalar a marca sem escalar o caos.</li>
          </ul>
          <p className="mt-4">
            Aqui não cabe prometer percentuais genéricos: o ganho real depende da
            sua operação — e por isso a plataforma deve dar os dados para você
            medir esse retorno, em vez de confiar no 'achismo'.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
            Quando um restaurante deve adotar
          </h2>
          <p className="mb-5">
            Regra geral: a partir do momento em que a operação tem mais de um
            turno ou mais de uma pessoa executando rotinas, e a qualidade não pode
            depender da presença do dono. Na prática, o encaixe varia por perfil:
          </p>
          <div className="space-y-3">
            {PROFILES.map((p) => (
              <div key={p.t}>
                <h3 className="font-bold text-slate-900 dark:text-white">{p.t}</h3>
                <p className="mt-1">{p.d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
            Como começar a implantar execução operacional em um restaurante
          </h2>
          <p className="mb-5">
            A migração não precisa ser dolorosa. Em menos de uma hora a primeira
            rotina está no ar. Um passo a passo simples:
          </p>
          <div className="space-y-4">
            {STEPS.map((s) => (
              <div key={s.t} className="rounded-xl border border-slate-200 dark:border-[#233f48] p-5">
                <h3 className="font-bold text-slate-900 dark:text-white">{s.t}</h3>
                <p className="mt-1">{s.d}</p>
                <Link href={s.href} className="mt-2 inline-block text-primary hover:underline">
                  {s.linkLabel} →
                </Link>
              </div>
            ))}
          </div>
          <p className="mt-5">
            Veja{" "}
            <Link href="/modelos" className="text-primary hover:underline">
              todos os modelos de checklist
            </Link>{" "}
            para começar.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
            Glossário operacional
          </h2>
          <dl className="space-y-3">
            {GLOSSARY.map((g) => (
              <div key={g.t} className="rounded-xl border border-slate-200 dark:border-[#233f48] p-4">
                <dt className="font-bold text-slate-900 dark:text-white">{g.t}</dt>
                <dd className="mt-1">{g.d}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
            Perguntas frequentes
          </h2>
          <div className="space-y-3">
            {FAQS.map((f) => (
              <details key={f.q} className="rounded-xl border border-slate-200 dark:border-[#233f48] p-4">
                <summary className="font-bold text-slate-900 dark:text-white cursor-pointer">
                  {f.q}
                </summary>
                <p className="mt-2">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
            Comece pelos checklists essenciais
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {checklists.map((c) => (
              <li key={c.slug}>
                <Link href={`/modelos/${c.slug}`} className="text-primary hover:underline">
                  {c.h1}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {leituraRecomendada.length > 0 && (
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
              Leitura recomendada
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {leituraRecomendada.map((post) => (
                <Link
                  key={post.slug}
                  href={`/blog/${post.slug}`}
                  className="block rounded-xl border border-slate-200 dark:border-[#233f48] p-4 hover:border-primary/40 transition-colors"
                >
                  <span className="block font-bold text-slate-900 dark:text-white text-sm leading-snug">
                    {post.title}
                  </span>
                  <span className="mt-2 block text-xs text-slate-600 dark:text-[#93adc8] line-clamp-3">
                    {post.description}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="mb-12 text-sm">
          <h2 className="text-base font-bold text-slate-900 dark:text-white mb-3">
            Fontes e referências
          </h2>
          <ul className="space-y-1.5 list-disc pl-5 text-slate-500 dark:text-[#7e98ac]">
            {SOURCES.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className={extLink}>
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center">
          <p className="text-lg font-bold text-slate-900 dark:text-white">
            Pronto para colocar sua operação no padrão?
          </p>
          <p className="mt-2 text-slate-600 dark:text-[#93adc8]">
            Conheça a {siteConfig.category.toLowerCase()} na prática.
          </p>
          <Link
            href="/qualificacao"
            className="mt-4 inline-block rounded-full bg-primary px-6 py-3 font-bold text-white transition-opacity hover:opacity-90"
          >
            Agendar demonstração
          </Link>
        </section>
      </article>
    </main>
  );
}
