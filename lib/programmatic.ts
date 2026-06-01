import type { FAQItem } from "@/lib/faq";

// ---------------------------------------------------------------------------
// Motor de páginas programáticas: /modelos/<slug>
// Cada página é um checklist real e profundo (não template raso) para um tipo
// de operação. Conteúdo focado em utilidade + intenção de busca long-tail.
// A categoria "Plataforma de Execução Operacional para Restaurantes" e o CTA
// são aplicados de forma consistente pelo template da rota.
// ---------------------------------------------------------------------------

export interface ChecklistGroup {
  title: string;
  items: string[];
}

export interface ChecklistPage {
  slug: string;
  /** H1 — termo exato de busca */
  h1: string;
  metaTitle: string;
  metaDescription: string;
  /** Estabelecimento e rotina, usados em texto e schema */
  establishment: string;
  routine: string;
  /** Parágrafo de resposta direta no topo (ideal para featured snippet e IA) */
  intro: string;
  /** Por que essa rotina importa (EEAT) */
  whyItMatters: string;
  groups: ChecklistGroup[];
  commonMistakes: string[];
  faqs: FAQItem[];
  relatedSlugs: string[];
  publishedAt: string;
}

export const checklistPages: ChecklistPage[] = [
  // 1 -----------------------------------------------------------------------
  {
    slug: "checklist-abertura-hamburgueria",
    h1: "Checklist de Abertura de Hamburgueria",
    metaTitle: "Checklist de Abertura de Hamburgueria (modelo completo 2026)",
    metaDescription:
      "Checklist de abertura de hamburgueria pronto: chapa, fritadeira, mise en place, salão e caixa. Modelo completo para a operação abrir no padrão todos os dias.",
    establishment: "hamburgueria",
    routine: "abertura",
    intro:
      "O checklist de abertura de hamburgueria garante que a chapa, a fritadeira, o mise en place e o salão estejam prontos antes do primeiro pedido. Abaixo está um modelo completo, organizado por área, que você pode copiar e digitalizar para que a equipe execute igual todos os dias.",
    whyItMatters:
      "Numa hamburgueria, o gargalo é a chapa. Se ela não está na temperatura certa ou o mise en place está incompleto, o primeiro pico de pedidos vira caos: fila, hambúrguer mal-passado e cliente insatisfeito. Uma abertura padronizada evita que a operação comece atrasada e protege a qualidade do produto desde o primeiro burger.",
    groups: [
      {
        title: "Cozinha e chapa",
        items: [
          "Ligar e pré-aquecer a chapa na temperatura padrão (registrar a temperatura)",
          "Ligar e aferir a temperatura das fritadeiras; conferir nível e qualidade do óleo",
          "Conferir temperatura das geladeiras e do freezer (registrar leitura)",
          "Verificar estoque de pães do dia e descongelamento de blends",
          "Montar mise en place: queijos, bacon, cebola, molhos e toppings nas cubas",
          "Conferir validade e rotular insumos abertos (data de manipulação)",
          "Testar exaustão e iluminação da cozinha",
        ],
      },
      {
        title: "Salão e atendimento",
        items: [
          "Higienizar mesas, balcão e cardápios",
          "Conferir limpeza dos banheiros e reposição de papel/sabonete",
          "Ligar TVs, som e ar-condicionado",
          "Repor guardanapos, sachês e materiais das mesas",
        ],
      },
      {
        title: "Caixa e sistemas",
        items: [
          "Abrir o caixa com o fundo de troco conferido",
          "Ligar maquininhas de cartão e testar uma transação",
          "Conferir impressora de comanda e papel",
          "Validar se o sistema de pedidos/delivery está online",
        ],
      },
    ],
    commonMistakes: [
      "Marcar a chapa como 'pronta' sem registrar a temperatura real.",
      "Abrir sem conferir o estoque de pães — o item que mais falta no pico.",
      "Deixar o mise en place incompleto e ir completando durante o rush.",
      "Não rotular insumos abertos, gerando risco sanitário e desperdício.",
    ],
    faqs: [
      {
        q: "Quais itens não podem faltar no checklist de abertura de hamburgueria?",
        a: "Temperatura da chapa e das fritadeiras, conferência de geladeiras, estoque de pães, mise en place completo de toppings e molhos, abertura de caixa e teste das maquininhas. Esses são os itens que mais impactam o primeiro pico de vendas.",
      },
      {
        q: "Quanto tempo leva a abertura de uma hamburgueria?",
        a: "Com um checklist padronizado, entre 30 e 60 minutos, dependendo do tamanho da operação. O ganho está na previsibilidade: a equipe sabe exatamente o que fazer e em que ordem.",
      },
      {
        q: "Por que registrar a temperatura da chapa e das geladeiras?",
        a: "Porque é o que garante segurança alimentar e qualidade. Registrar com horário cria um histórico auditável, útil tanto para a gestão quanto para a vigilância sanitária.",
      },
    ],
    relatedSlugs: [
      "checklist-fechamento-hamburgueria",
      "checklist-recebimento-restaurante",
      "checklist-limpeza-restaurante",
    ],
    publishedAt: "2026-06-01",
  },
  // 2 -----------------------------------------------------------------------
  {
    slug: "checklist-fechamento-hamburgueria",
    h1: "Checklist de Fechamento de Hamburgueria",
    metaTitle: "Checklist de Fechamento de Hamburgueria (modelo completo 2026)",
    metaDescription:
      "Checklist de fechamento de hamburgueria: limpeza de chapa e fritadeira, armazenamento de insumos, fechamento de caixa e segurança. Modelo pronto para padronizar.",
    establishment: "hamburgueria",
    routine: "fechamento",
    intro:
      "O checklist de fechamento de hamburgueria garante que a cozinha seja limpa, os insumos armazenados corretamente, o caixa fechado e o ponto trancado com segurança. Use o modelo abaixo para que o turno da noite entregue a operação pronta para o dia seguinte.",
    whyItMatters:
      "O fechamento mal feito é o que estraga a abertura do dia seguinte: chapa encrustada, óleo velho, insumo perdido e caixa furado. Padronizar o fechamento protege o equipamento, reduz perda de alimentos e elimina a discussão sobre diferença de caixa.",
    groups: [
      {
        title: "Limpeza da cozinha",
        items: [
          "Raspar e higienizar a chapa seguindo o procedimento padrão",
          "Filtrar ou descartar o óleo das fritadeiras conforme o cronograma",
          "Higienizar bancadas, cubas e utensílios",
          "Limpar e desligar exaustores e coifa",
          "Recolher e lavar telas, grelhas e espátulas",
        ],
      },
      {
        title: "Armazenamento e insumos",
        items: [
          "Guardar toppings e molhos em recipientes vedados e rotulados",
          "Conferir e registrar temperatura final das geladeiras e freezer",
          "Descartar insumos vencidos e registrar a perda",
          "Anotar itens em falta para o pedido do dia seguinte",
        ],
      },
      {
        title: "Caixa, segurança e energia",
        items: [
          "Fechar o caixa e conferir o valor com o relatório do sistema",
          "Guardar o malote/sangria no local seguro",
          "Desligar equipamentos, luzes e ar-condicionado não essenciais",
          "Conferir portas, janelas e acionar o alarme",
          "Registrar com foto a cozinha limpa e o salão organizado",
        ],
      },
    ],
    commonMistakes: [
      "Deixar a chapa para 'limpar amanhã' — encrusta e reduz a vida útil.",
      "Não registrar a perda de insumos, mascarando o desperdício real.",
      "Fechar o caixa sem conferir contra o sistema.",
      "Esquecer de anotar faltas, atrasando o pedido de reposição.",
    ],
    faqs: [
      {
        q: "O que não pode faltar no fechamento de uma hamburgueria?",
        a: "Limpeza da chapa e fritadeiras, armazenamento correto de insumos com rótulo, registro de temperatura final, fechamento de caixa conferido contra o sistema e checagem de segurança (portas, alarme).",
      },
      {
        q: "Por que registrar a temperatura no fechamento?",
        a: "Para garantir que os alimentos passarão a noite na faixa segura. Se a geladeira está acima do ideal ao fechar, você descobre antes de perder produto ou criar risco sanitário.",
      },
      {
        q: "Como evitar diferença de caixa no fechamento?",
        a: "Conferindo o valor físico contra o relatório do sistema todo dia, com responsável definido. Um checklist digital registra quem fechou e quando, eliminando a discussão.",
      },
    ],
    relatedSlugs: [
      "checklist-abertura-hamburgueria",
      "checklist-limpeza-restaurante",
      "checklist-troca-turno-restaurante",
    ],
    publishedAt: "2026-06-01",
  },
  // 3 -----------------------------------------------------------------------
  {
    slug: "checklist-abertura-pizzaria",
    h1: "Checklist de Abertura de Pizzaria",
    metaTitle: "Checklist de Abertura de Pizzaria (modelo completo 2026)",
    metaDescription:
      "Checklist de abertura de pizzaria: forno, massas, mise en place de coberturas, salão e caixa. Modelo pronto para a pizzaria abrir no padrão todos os dias.",
    establishment: "pizzaria",
    routine: "abertura",
    intro:
      "O checklist de abertura de pizzaria garante que o forno esteja na temperatura certa, as massas pré-fermentadas prontas, o mise en place de coberturas completo e o salão preparado. Veja o modelo completo abaixo, pronto para digitalizar.",
    whyItMatters:
      "Na pizzaria, o forno e a massa ditam tudo. Forno frio atrasa o primeiro pedido; massa mal planejada limita a venda da noite. Uma abertura padronizada garante que o tempo de aquecimento do forno e o estoque de massas estejam resolvidos antes de o salão encher.",
    groups: [
      {
        title: "Forno e massas",
        items: [
          "Ligar o forno com antecedência e registrar a temperatura ideal de operação",
          "Conferir o estoque de massas pré-fermentadas e o cronograma de fermentação",
          "Separar e bolear massas conforme a previsão de demanda do dia",
          "Conferir validade e qualidade dos molhos base (registrar manipulação)",
        ],
      },
      {
        title: "Mise en place de coberturas",
        items: [
          "Repor e organizar as cubas de coberturas (queijos, frios, vegetais)",
          "Conferir temperatura das geladeiras e da câmara fria",
          "Rotular insumos abertos com data de manipulação",
          "Verificar estoque de embalagens de delivery e caixas de pizza",
        ],
      },
      {
        title: "Salão, caixa e delivery",
        items: [
          "Higienizar mesas, balcão e cardápios",
          "Conferir banheiros e reposição de materiais",
          "Abrir o caixa com fundo de troco conferido e testar maquininhas",
          "Validar se os apps de delivery e o sistema de pedidos estão online",
        ],
      },
    ],
    commonMistakes: [
      "Ligar o forno em cima da hora e abrir com ele ainda frio.",
      "Não planejar o boleamento de massas pela demanda, faltando massa no pico.",
      "Esquecer de conferir o estoque de caixas de pizza para o delivery.",
      "Deixar coberturas sem rótulo de manipulação.",
    ],
    faqs: [
      {
        q: "Quais itens são essenciais no checklist de abertura de pizzaria?",
        a: "Aquecimento do forno com registro de temperatura, conferência e boleamento de massas, mise en place de coberturas, estoque de embalagens de delivery, abertura de caixa e validação dos apps de pedido.",
      },
      {
        q: "Com quanto tempo de antecedência ligar o forno da pizzaria?",
        a: "Depende do tipo de forno (a lenha, a gás ou elétrico), mas o ponto é padronizar: registre no checklist o horário de ligar e a temperatura-alvo para que o forno esteja pronto antes do primeiro pedido.",
      },
      {
        q: "Como organizar o mise en place de uma pizzaria?",
        a: "Por cubas de coberturas organizadas na ordem de montagem, com insumos rotulados e temperatura conferida. Um checklist digital garante que nada falte quando o salão encher.",
      },
    ],
    relatedSlugs: [
      "checklist-fechamento-pizzaria",
      "checklist-recebimento-restaurante",
      "checklist-controle-estoque-restaurante",
    ],
    publishedAt: "2026-06-01",
  },
  // 4 -----------------------------------------------------------------------
  {
    slug: "checklist-fechamento-pizzaria",
    h1: "Checklist de Fechamento de Pizzaria",
    metaTitle: "Checklist de Fechamento de Pizzaria (modelo completo 2026)",
    metaDescription:
      "Checklist de fechamento de pizzaria: limpeza do forno e bancadas, armazenamento de massas e coberturas, caixa e segurança. Modelo pronto para padronizar.",
    establishment: "pizzaria",
    routine: "fechamento",
    intro:
      "O checklist de fechamento de pizzaria garante a limpeza do forno e das bancadas, o armazenamento correto de massas e coberturas, o fechamento de caixa e a segurança do ponto. Use o modelo abaixo para entregar a operação pronta para o dia seguinte.",
    whyItMatters:
      "Massa e cobertura mal armazenadas viram perda; forno e bancadas sujos viram problema sanitário. O fechamento padronizado preserva os insumos mais caros da pizzaria e garante que a abertura do dia seguinte comece limpa.",
    groups: [
      {
        title: "Limpeza",
        items: [
          "Limpar a câmara e a boca do forno conforme o procedimento",
          "Higienizar bancadas de montagem e a área de boleamento",
          "Lavar utensílios, pás e formas",
          "Limpar e desligar a coifa e o exaustor",
        ],
      },
      {
        title: "Armazenamento de insumos",
        items: [
          "Guardar massas restantes vedadas e rotuladas, na temperatura correta",
          "Armazenar coberturas em recipientes vedados e identificados",
          "Registrar temperatura final das geladeiras e da câmara fria",
          "Descartar e registrar perdas; anotar faltas para o pedido seguinte",
        ],
      },
      {
        title: "Caixa, segurança e energia",
        items: [
          "Fechar o caixa e conferir contra o relatório do sistema",
          "Guardar a sangria no local seguro",
          "Desligar forno, equipamentos e luzes não essenciais",
          "Conferir portas e janelas e acionar o alarme",
          "Registrar com foto a cozinha limpa",
        ],
      },
    ],
    commonMistakes: [
      "Guardar massa sem vedar e rotular, perdendo o insumo no dia seguinte.",
      "Não limpar o forno enquanto ainda está morno, dificultando a remoção de resíduos.",
      "Fechar sem registrar perdas e faltas.",
      "Deixar a coifa suja, acumulando gordura e risco de incêndio.",
    ],
    faqs: [
      {
        q: "Como armazenar a massa de pizza no fechamento?",
        a: "Vedada, rotulada com data de manipulação e na temperatura correta (refrigerada). Registrar a temperatura final da geladeira garante que a massa estará boa na abertura seguinte.",
      },
      {
        q: "O que mais gera perda no fechamento de uma pizzaria?",
        a: "Massa e coberturas mal armazenadas. Um checklist de fechamento com itens de vedação, rotulagem e registro de temperatura reduz drasticamente essa perda.",
      },
      {
        q: "Por que limpar a coifa faz parte do fechamento?",
        a: "Porque o acúmulo de gordura é risco sanitário e de incêndio. Incluir a coifa no checklist (mesmo que com frequência semanal) garante que ela não seja esquecida.",
      },
    ],
    relatedSlugs: [
      "checklist-abertura-pizzaria",
      "checklist-limpeza-restaurante",
      "checklist-troca-turno-restaurante",
    ],
    publishedAt: "2026-06-01",
  },
  // 5 -----------------------------------------------------------------------
  {
    slug: "checklist-abertura-cafeteria",
    h1: "Checklist de Abertura de Cafeteria",
    metaTitle: "Checklist de Abertura de Cafeteria (modelo completo 2026)",
    metaDescription:
      "Checklist de abertura de cafeteria: máquina de espresso, moedor, vitrine, mise en place e caixa. Modelo pronto para a cafeteria abrir no padrão todos os dias.",
    establishment: "cafeteria",
    routine: "abertura",
    intro:
      "O checklist de abertura de cafeteria garante que a máquina de espresso esteja calibrada, o moedor regulado, a vitrine montada e o caixa pronto. Veja abaixo o modelo completo para padronizar a abertura e proteger a qualidade do café.",
    whyItMatters:
      "Na cafeteria, a primeira impressão é o café. Máquina sem aquecer, moagem desregulada ou vitrine vazia comprometem o ticket da manhã — justamente o horário de maior fluxo. Padronizar a abertura garante café no ponto e vitrine cheia quando o primeiro cliente chega.",
    groups: [
      {
        title: "Café e equipamentos",
        items: [
          "Ligar a máquina de espresso e aguardar o aquecimento completo",
          "Calibrar o moedor e fazer a dose de teste (registrar o ajuste)",
          "Conferir estoque de grãos, leite e leites vegetais",
          "Abastecer e testar a temperatura do vaporizador",
          "Limpar grupos, bicos e bandeja da máquina",
        ],
      },
      {
        title: "Vitrine e mise en place",
        items: [
          "Montar a vitrine com os itens do dia (registrar com foto)",
          "Conferir validade de bolos, salgados e itens perecíveis",
          "Repor xícaras, copos, tampas e canudos",
          "Conferir temperatura de geladeiras e expositores",
        ],
      },
      {
        title: "Salão e caixa",
        items: [
          "Higienizar mesas, balcão e estação de açúcar/guardanapos",
          "Conferir banheiros e reposição de materiais",
          "Abrir o caixa com fundo de troco e testar a maquininha",
          "Validar o sistema de pedidos e o programa de fidelidade",
        ],
      },
    ],
    commonMistakes: [
      "Servir o primeiro café sem calibrar o moedor (extração ruim).",
      "Abrir com a vitrine incompleta no horário de pico da manhã.",
      "Não conferir o estoque de leite, faltando no meio do movimento.",
      "Esquecer de limpar os grupos da máquina antes do primeiro uso.",
    ],
    faqs: [
      {
        q: "O que não pode faltar na abertura de uma cafeteria?",
        a: "Aquecimento e limpeza da máquina de espresso, calibração do moedor com dose de teste, conferência de grãos e leite, montagem da vitrine e abertura de caixa. Esses itens definem a qualidade e a velocidade no pico da manhã.",
      },
      {
        q: "Por que registrar a calibração do moedor?",
        a: "Porque a moagem muda com a umidade e o lote do grão. Registrar o ajuste do dia padroniza a extração entre baristas e mantém o café consistente.",
      },
      {
        q: "Como garantir vitrine cheia na abertura?",
        a: "Incluindo a montagem da vitrine com foto no checklist de abertura e conferindo a validade dos perecíveis. Assim o gestor vê remotamente se a vitrine ficou no padrão.",
      },
    ],
    relatedSlugs: [
      "checklist-fechamento-cafeteria",
      "checklist-recebimento-restaurante",
      "checklist-limpeza-restaurante",
    ],
    publishedAt: "2026-06-01",
  },
  // 6 -----------------------------------------------------------------------
  {
    slug: "checklist-fechamento-cafeteria",
    h1: "Checklist de Fechamento de Cafeteria",
    metaTitle: "Checklist de Fechamento de Cafeteria (modelo completo 2026)",
    metaDescription:
      "Checklist de fechamento de cafeteria: limpeza da máquina de espresso, retrolavagem, armazenamento da vitrine, caixa e segurança. Modelo pronto para padronizar.",
    establishment: "cafeteria",
    routine: "fechamento",
    intro:
      "O checklist de fechamento de cafeteria garante a limpeza correta da máquina de espresso (retrolavagem), o armazenamento dos itens da vitrine, o fechamento de caixa e a segurança. Use o modelo abaixo para preservar o equipamento e reduzir perdas.",
    whyItMatters:
      "A máquina de espresso é o equipamento mais caro da cafeteria — e o que mais sofre se a limpeza for negligenciada. Um fechamento padronizado com retrolavagem prolonga a vida da máquina, mantém o sabor do café e evita perda dos itens da vitrine.",
    groups: [
      {
        title: "Limpeza da máquina e equipamentos",
        items: [
          "Fazer a retrolavagem (backflush) dos grupos com detergente próprio",
          "Limpar bicos de vapor, lanças e bandejas",
          "Esvaziar e higienizar o moedor e a área de moagem",
          "Limpar a máquina de filtrado e jarras",
        ],
      },
      {
        title: "Vitrine e insumos",
        items: [
          "Recolher e armazenar itens da vitrine vedados e rotulados",
          "Descartar perecíveis vencidos e registrar a perda",
          "Conferir e registrar temperatura final de geladeiras e expositores",
          "Anotar faltas (grãos, leite, descartáveis) para reposição",
        ],
      },
      {
        title: "Salão, caixa e segurança",
        items: [
          "Higienizar mesas, balcão e estações de cliente",
          "Fechar o caixa e conferir contra o sistema",
          "Desligar máquina, equipamentos e luzes não essenciais",
          "Conferir portas e janelas e acionar o alarme",
        ],
      },
    ],
    commonMistakes: [
      "Pular a retrolavagem, comprometendo o sabor e a vida útil da máquina.",
      "Deixar itens da vitrine sem rótulo, gerando desperdício e risco.",
      "Não registrar perdas, escondendo o real desperdício da vitrine.",
      "Esquecer de anotar faltas, atrasando o pedido de grãos e leite.",
    ],
    faqs: [
      {
        q: "O que é retrolavagem e por que está no fechamento?",
        a: "Retrolavagem (backflush) é a limpeza interna dos grupos da máquina de espresso com detergente específico. Feita no fechamento, ela remove resíduos de óleo do café que comprometem o sabor e danificam a máquina ao longo do tempo.",
      },
      {
        q: "Como reduzir a perda da vitrine no fechamento?",
        a: "Armazenando corretamente os itens que podem ser reaproveitados, descartando e registrando o que venceu, e usando o histórico para ajustar a produção dos próximos dias.",
      },
      {
        q: "Quais itens de segurança incluir no fechamento da cafeteria?",
        a: "Desligamento da máquina e equipamentos, conferência de portas e janelas e acionamento do alarme. Incluir esses itens no checklist evita esquecimentos no fim de um turno cansativo.",
      },
    ],
    relatedSlugs: [
      "checklist-abertura-cafeteria",
      "checklist-limpeza-restaurante",
      "checklist-troca-turno-restaurante",
    ],
    publishedAt: "2026-06-01",
  },
  // 7 -----------------------------------------------------------------------
  {
    slug: "checklist-recebimento-restaurante",
    h1: "Checklist de Recebimento de Mercadorias em Restaurante",
    metaTitle:
      "Checklist de Recebimento de Mercadorias em Restaurante (modelo 2026)",
    metaDescription:
      "Checklist de recebimento de mercadorias em restaurante: conferência de temperatura, validade, quantidade, qualidade e nota fiscal. Modelo pronto com evidência.",
    establishment: "restaurante",
    routine: "recebimento de mercadorias",
    intro:
      "O checklist de recebimento de mercadorias garante que cada entrega seja conferida em temperatura, validade, quantidade, qualidade e nota fiscal antes de entrar no estoque. Use o modelo abaixo para impedir que insumo errado, vencido ou fora da temperatura chegue à cozinha.",
    whyItMatters:
      "A maioria dos problemas de custo e de higiene entra pela porta dos fundos. Receber sem conferir significa pagar por mercadoria que não veio, aceitar produto fora da temperatura segura e descobrir a perda só na hora de usar. Um recebimento padronizado protege o caixa e a segurança alimentar.",
    groups: [
      {
        title: "Conferência na chegada",
        items: [
          "Conferir a nota fiscal contra o pedido (itens, quantidade e preço)",
          "Medir e registrar a temperatura de congelados e resfriados na chegada",
          "Verificar prazos de validade e recusar itens com validade curta",
          "Inspecionar embalagens (integridade, sinais de violação ou avaria)",
        ],
      },
      {
        title: "Qualidade e quantidade",
        items: [
          "Avaliar qualidade sensorial de hortifrúti, carnes e perecíveis",
          "Pesar itens vendidos por peso e registrar divergências",
          "Registrar com foto qualquer não conformidade para o fornecedor",
          "Separar e devolver itens recusados, anotando o motivo",
        ],
      },
      {
        title: "Armazenamento imediato",
        items: [
          "Guardar refrigerados e congelados imediatamente (regra PVPS / FIFO)",
          "Rotular com data de recebimento e validade",
          "Atualizar o estoque com as quantidades recebidas",
          "Arquivar a nota fiscal e o registro de conferência",
        ],
      },
    ],
    commonMistakes: [
      "Assinar o canhoto sem conferir a temperatura dos congelados.",
      "Aceitar quantidade menor que a da nota por falta de conferência.",
      "Demorar a guardar perecíveis, quebrando a cadeia de frio.",
      "Não registrar não conformidades, perdendo o direito de reclamar com o fornecedor.",
    ],
    faqs: [
      {
        q: "O que conferir no recebimento de mercadorias de um restaurante?",
        a: "Nota fiscal contra o pedido, temperatura de congelados e resfriados, validade, integridade das embalagens, qualidade sensorial e quantidade (peso). Itens fora do padrão devem ser recusados e registrados.",
      },
      {
        q: "Qual a temperatura ideal para receber congelados e resfriados?",
        a: "Congelados devem chegar congelados (em torno de -18 °C) e resfriados na faixa de refrigeração segura. O essencial é medir e registrar na chegada; itens fora da faixa devem ser recusados.",
      },
      {
        q: "Por que registrar o recebimento com foto?",
        a: "A foto comprova não conformidades (embalagem violada, produto avariado, validade curta) e dá respaldo na negociação com o fornecedor. No Ordem na Mesa, esse registro fica no histórico auditável.",
      },
    ],
    relatedSlugs: [
      "checklist-controle-estoque-restaurante",
      "checklist-limpeza-restaurante",
      "checklist-abertura-hamburgueria",
    ],
    publishedAt: "2026-06-01",
  },
  // 8 -----------------------------------------------------------------------
  {
    slug: "checklist-controle-estoque-restaurante",
    h1: "Checklist de Controle de Estoque em Restaurante",
    metaTitle:
      "Checklist de Controle de Estoque em Restaurante (modelo completo 2026)",
    metaDescription:
      "Checklist de controle de estoque em restaurante: contagem, validade, FIFO, ponto de pedido e registro de perdas. Modelo pronto para reduzir desperdício e ruptura.",
    establishment: "restaurante",
    routine: "controle de estoque",
    intro:
      "O checklist de controle de estoque garante contagem periódica, rotação por validade (FIFO/PVPS), definição de ponto de pedido e registro de perdas. Use o modelo abaixo para reduzir desperdício, evitar ruptura de insumo e enxergar o custo real da operação.",
    whyItMatters:
      "Estoque mal controlado é dinheiro parado e perda invisível. Sem contagem e sem rotação, o restaurante compra o que não precisa, perde o que vence e fica sem o que vende. Um controle padronizado transforma o estoque de uma caixa-preta em uma decisão de compra baseada em dados.",
    groups: [
      {
        title: "Contagem e organização",
        items: [
          "Contar itens-chave na frequência definida (diária, semanal ou mensal)",
          "Aplicar PVPS/FIFO: o que vence primeiro fica à frente",
          "Conferir validade e separar itens próximos do vencimento",
          "Organizar prateleiras e câmaras seguindo o padrão de armazenamento",
        ],
      },
      {
        title: "Reposição e compras",
        items: [
          "Comparar a contagem com o ponto de pedido de cada item",
          "Gerar a lista de compras com base na demanda prevista",
          "Registrar entradas e saídas para manter o saldo correto",
          "Conferir preços e divergências com os fornecedores",
        ],
      },
      {
        title: "Perdas e indicadores",
        items: [
          "Registrar perdas (vencimento, quebra, descarte) com motivo",
          "Calcular o consumo médio dos principais insumos",
          "Identificar itens com excesso ou ruptura recorrente",
          "Documentar a contagem com foto/assinatura do responsável",
        ],
      },
    ],
    commonMistakes: [
      "Contar 'no olho' sem registro, impossibilitando comparação.",
      "Ignorar o FIFO, deixando produto antigo no fundo até vencer.",
      "Comprar por hábito em vez de ponto de pedido, gerando excesso.",
      "Não registrar perdas, escondendo o custo real do desperdício.",
    ],
    faqs: [
      {
        q: "Com que frequência fazer a contagem de estoque em um restaurante?",
        a: "Itens de alto giro e alto custo (proteínas, bebidas) merecem contagem diária ou em cada turno; o estoque geral costuma ser semanal ou mensal. O importante é padronizar a frequência e registrar cada contagem.",
      },
      {
        q: "O que é PVPS/FIFO no controle de estoque?",
        a: "PVPS (Primeiro que Vence, Primeiro que Sai) — equivalente ao FIFO — é a regra de usar primeiro o que vence antes. Organizar o estoque por validade reduz perda por vencimento.",
      },
      {
        q: "Como o controle de estoque reduz custo?",
        a: "Comprando pelo ponto de pedido (nem a mais, nem a menos), girando o estoque por validade e registrando perdas para atacar a causa. Com dados, a compra deixa de ser no 'achismo'.",
      },
    ],
    relatedSlugs: [
      "checklist-recebimento-restaurante",
      "checklist-fechamento-hamburgueria",
      "checklist-limpeza-restaurante",
    ],
    publishedAt: "2026-06-01",
  },
  // 9 -----------------------------------------------------------------------
  {
    slug: "checklist-limpeza-restaurante",
    h1: "Checklist de Limpeza de Restaurante",
    metaTitle: "Checklist de Limpeza de Restaurante (modelo completo 2026)",
    metaDescription:
      "Checklist de limpeza de restaurante por área e frequência: cozinha, salão, banheiros e equipamentos. Modelo pronto com evidência fotográfica para padrões de higiene.",
    establishment: "restaurante",
    routine: "limpeza e higienização",
    intro:
      "O checklist de limpeza de restaurante organiza a higienização por área e por frequência (diária, semanal e mensal): cozinha, salão, banheiros e equipamentos. Use o modelo abaixo para manter o padrão de higiene exigido pela RDC 216 e comprovar com evidência.",
    whyItMatters:
      "Limpeza é o item que mais gera autuação sanitária e reclamação de cliente — e o mais negligenciado quando não há método. Separar a limpeza por frequência garante que tarefas semanais (coifa, câmara fria) não sejam esquecidas entre as diárias, e a evidência fotográfica prova o padrão para a fiscalização.",
    groups: [
      {
        title: "Cozinha — diário",
        items: [
          "Higienizar bancadas, tábuas e utensílios após cada uso",
          "Limpar fogão, chapa, fritadeira e fornos",
          "Higienizar pias e desinfetar superfícies de manipulação",
          "Recolher o lixo e higienizar as lixeiras",
          "Limpar o piso da cozinha com produto adequado",
        ],
      },
      {
        title: "Salão e banheiros — diário",
        items: [
          "Higienizar mesas, cadeiras e balcão",
          "Limpar e desinfetar banheiros e repor materiais",
          "Limpar pisos do salão e áreas de circulação",
          "Higienizar maçanetas, interruptores e pontos de toque",
        ],
      },
      {
        title: "Periódico — semanal/mensal",
        items: [
          "Limpar coifa, exaustor e filtros de gordura (semanal)",
          "Higienizar câmara fria e geladeiras por dentro (semanal)",
          "Descongelar e limpar freezers (conforme cronograma)",
          "Limpar reservatórios, ralos e área externa (mensal)",
          "Registrar com foto as limpezas periódicas concluídas",
        ],
      },
    ],
    commonMistakes: [
      "Misturar tarefas diárias e periódicas, fazendo a coifa 'sumir' do radar.",
      "Limpar sem registro, sem prova para a vigilância sanitária.",
      "Usar produto ou diluição errada nas superfícies de alimento.",
      "Não definir responsável por área, gerando o 'achei que era você'.",
    ],
    faqs: [
      {
        q: "Como organizar um checklist de limpeza de restaurante?",
        a: "Por área (cozinha, salão, banheiros) e por frequência (diária, semanal, mensal). Tarefas periódicas como coifa e câmara fria precisam de frequência própria para não serem esquecidas entre as diárias.",
      },
      {
        q: "O checklist de limpeza atende a RDC 216 da Anvisa?",
        a: "A RDC 216 exige higienização e seu registro. Um checklist digital com evidência fotográfica e histórico por responsável é a forma mais simples de comprovar o cumprimento das boas práticas.",
      },
      {
        q: "Por que registrar a limpeza com foto?",
        a: "Porque comprova que foi feita e no padrão. A foto muda o comportamento da equipe e dá respaldo numa fiscalização ou reclamação — sem depender da memória de ninguém.",
      },
    ],
    relatedSlugs: [
      "checklist-abertura-hamburgueria",
      "checklist-recebimento-restaurante",
      "checklist-troca-turno-restaurante",
    ],
    publishedAt: "2026-06-01",
  },
  // 10 ----------------------------------------------------------------------
  {
    slug: "checklist-troca-turno-restaurante",
    h1: "Checklist de Troca de Turno em Restaurante",
    metaTitle:
      "Checklist de Troca de Turno em Restaurante (modelo completo 2026)",
    metaDescription:
      "Checklist de troca de turno em restaurante: passagem de pendências, conferência de estoque de praça, caixa parcial e comunicação entre equipes. Modelo pronto.",
    establishment: "restaurante",
    routine: "troca de turno",
    intro:
      "O checklist de troca de turno garante uma passagem limpa entre as equipes: pendências comunicadas, estoque de praça reposto, caixa parcial conferido e responsabilidades definidas. Use o modelo abaixo para que o turno que entra comece sabendo exatamente o que recebeu.",
    whyItMatters:
      "A troca de turno é onde a informação se perde. Sem uma passagem padronizada, o turno da noite herda problemas que não conhece: praça desabastecida, pendência não comunicada, caixa sem conferência. Padronizar a troca elimina o ruído e a desresponsabilização entre equipes.",
    groups: [
      {
        title: "Passagem de informações",
        items: [
          "Comunicar pendências e tarefas não concluídas do turno anterior",
          "Registrar ocorrências relevantes (reclamações, quebras, faltas)",
          "Informar reservas, eventos e demandas previstas para o próximo turno",
          "Confirmar a presença e as funções da equipe que entra",
        ],
      },
      {
        title: "Conferência operacional",
        items: [
          "Repor o mise en place e o estoque de praça para o próximo turno",
          "Conferir temperatura de geladeiras e equipamentos",
          "Verificar limpeza das estações antes da passagem",
          "Conferir estoque de descartáveis e embalagens de delivery",
        ],
      },
      {
        title: "Caixa e responsabilidade",
        items: [
          "Conferir o caixa parcial e registrar o valor na troca",
          "Registrar quem assume o caixa no novo turno",
          "Documentar a passagem com responsável de saída e de entrada",
          "Sinalizar itens que precisam de atenção imediata",
        ],
      },
    ],
    commonMistakes: [
      "Trocar de turno sem repor a praça, deixando o próximo turno no aperto.",
      "Não conferir o caixa parcial, gerando dúvida sobre qual turno furou.",
      "Comunicar pendências só verbalmente, sem registro.",
      "Não definir quem assume cada responsabilidade no novo turno.",
    ],
    faqs: [
      {
        q: "O que deve constar em um checklist de troca de turno?",
        a: "Passagem de pendências e ocorrências, reposição do mise en place e do estoque de praça, conferência de temperatura, caixa parcial conferido e definição de responsáveis de entrada e saída.",
      },
      {
        q: "Por que conferir o caixa na troca de turno?",
        a: "Para isolar a responsabilidade de cada turno. Registrar o valor parcial na troca evita a discussão de 'qual turno furou o caixa' no fim do dia.",
      },
      {
        q: "Como evitar que pendências se percam na troca de turno?",
        a: "Registrando-as no sistema, não só verbalmente. Um checklist digital de troca de turno entrega ao novo turno a lista exata do que ficou pendente, com responsável.",
      },
    ],
    relatedSlugs: [
      "checklist-fechamento-hamburgueria",
      "checklist-controle-estoque-restaurante",
      "checklist-limpeza-restaurante",
    ],
    publishedAt: "2026-06-01",
  },
];

export function getChecklistBySlug(slug: string): ChecklistPage | undefined {
  return checklistPages.find((page) => page.slug === slug);
}

export function getAllChecklists(): ChecklistPage[] {
  return checklistPages;
}
