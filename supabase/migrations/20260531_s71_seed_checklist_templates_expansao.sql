-- ============================================================
-- Sprint 71 — Expansão do catálogo (27 novos modelos)
-- ============================================================
-- SOMENTE CONTEÚDO. Não altera schema, não cria tabelas, não cria
-- kits, não mexe na UI. Mesmo padrão idempotente da s70:
--   templates por slug; itens por (template_id, item_slug).
-- Re-rodar não duplica. Mantém os 8 modelos da s70 intactos.
-- Nomes finais aprovados (linguagem de gestor, sem jargão).
-- ============================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Templates (27 novos)
-- ---------------------------------------------------------------------------
INSERT INTO public.checklist_templates
  (slug, name, description, category, icon, suggested_type, suggested_area_label, suggested_recurrence, is_premium, sort_order)
VALUES
  ('conferencia-sangria', 'Conferência de Sangria',
   'Registrar retiradas de dinheiro do caixa com segurança durante o expediente.',
   'caixa', 'payments', 'regular', 'Caixa', 'daily', false, 70),
  ('auditoria-caixa', 'Auditoria de Caixa',
   'Identificar diferenças entre o sistema e o caixa físico (quebra/sobra).',
   'caixa', 'fact_check', 'regular', 'Caixa', 'weekly', false, 80),
  ('mise-en-place', 'Pré-Preparo (Mise en Place)',
   'Garantir ingredientes cortados, pesados e prontos antes do serviço.',
   'cozinha', 'kitchen', 'opening', 'Cozinha', 'daily', false, 30),
  ('troca-oleo-fritadeiras', 'Troca de Óleo das Fritadeiras',
   'Procedimento de troca e descarte correto do óleo das fritadeiras.',
   'cozinha', 'oil_barrel', 'regular', 'Cozinha', 'weekly', false, 40),
  ('limpeza-profunda-cozinha', 'Limpeza Profunda da Cozinha',
   'Limpeza aprofundada semanal para remover gordura e manter os padrões de higiene.',
   'cozinha', 'cleaning_services', 'regular', 'Cozinha', 'weekly', false, 50),
  ('controle-validade-etiquetagem', 'Controle de Validade e Etiquetagem de Alimentos',
   'Etiquetar, datar e girar os insumos para reduzir perdas e garantir validade.',
   'cozinha', 'event_available', 'regular', 'Cozinha', 'daily', false, 60),
  ('montagem-mesas', 'Montagem e Preparação das Mesas',
   'Padronizar a montagem das mesas antes da abertura do salão.',
   'salao', 'table_restaurant', 'opening', 'Salão', 'daily', false, 50),
  ('padrao-atendimento', 'Padrão de Atendimento ao Cliente',
   'Garantir consistência no atendimento, da recepção ao fechamento da conta.',
   'salao', 'room_service', 'regular', 'Salão', 'daily', false, 60),
  ('contagem-estoque', 'Contagem de Estoque (Inventário)',
   'Conferir as quantidades em estoque para garantir acuracidade e apoiar o CMV.',
   'estoque', 'inventory_2', 'regular', 'Estoque', 'weekly', false, 10),
  ('organizacao-camara-fria', 'Organização da Câmara Fria',
   'Organizar, separar e controlar os alimentos refrigerados e congelados.',
   'estoque', 'ac_unit', 'regular', 'Estoque', 'daily', false, 20),
  ('pedido-compras-reposicao', 'Pedido de Compras e Reposição',
   'Repor o estoque com base nos níveis mínimos, evitando falta e excesso.',
   'estoque', 'shopping_cart', 'regular', 'Estoque', 'weekly', false, 30),
  ('plano-limpeza-higienizacao', 'Plano de Limpeza e Higienização',
   'Executar o plano de limpeza e higienização das áreas, com registro.',
   'limpeza', 'cleaning_services', 'regular', 'Limpeza', 'weekly', false, 90),
  ('higienizacao-banheiros', 'Limpeza e Reposição de Banheiros',
   'Limpeza periódica e reposição de materiais nos banheiros, com registro.',
   'banheiros', 'wc', 'regular', 'Banheiros', 'daily', false, 10),
  ('boas-praticas-manipulacao', 'Boas Práticas de Manipulação de Alimentos',
   'Conferir as boas práticas de manipulação para garantir a segurança alimentar.',
   'seguranca_alimentar', 'health_and_safety', 'regular', 'Cozinha', 'weekly', false, 80),
  ('higiene-saude-equipe', 'Higiene e Saúde da Equipe',
   'Verificar higiene pessoal e condições de saúde da equipe antes do serviço.',
   'seguranca_alimentar', 'clean_hands', 'opening', 'Cozinha', 'daily', false, 90),
  ('higienizacao-frutas-verduras', 'Higienização de Frutas e Verduras',
   'Lavar e sanitizar corretamente frutas, verduras e legumes.',
   'seguranca_alimentar', 'nutrition', 'regular', 'Cozinha', 'daily', false, 100),
  ('vigilancia-sanitaria', 'Checklist de Vigilância Sanitária',
   'Simular uma fiscalização e corrigir não conformidades antes do agente.',
   'seguranca_alimentar', 'verified', 'regular', NULL, 'monthly', false, 110),
  ('inspecao-refrigeracao', 'Inspeção de Geladeiras e Câmaras Frias',
   'Inspecionar o funcionamento e a conservação dos equipamentos de refrigeração.',
   'equipamentos', 'ac_unit', 'regular', 'Cozinha', 'weekly', false, 10),
  ('inspecao-gas', 'Inspeção de Segurança do Gás',
   'Verificar botijões, mangueiras e registros para prevenir vazamentos.',
   'equipamentos', 'gas_meter', 'regular', 'Cozinha', 'weekly', false, 20),
  ('manutencao-preventiva', 'Manutenção Preventiva de Equipamentos',
   'Inspeção preventiva para evitar quebras e paradas não planejadas.',
   'manutencao', 'build', 'regular', 'Cozinha', 'monthly', false, 10),
  ('limpeza-coifa-exaustao', 'Limpeza de Coifa, Exaustão e Filtros',
   'Remover a gordura do sistema de exaustão para reduzir risco de incêndio.',
   'manutencao', 'mode_fan', 'regular', 'Cozinha', 'monthly', false, 20),
  ('controle-pragas', 'Controle de Pragas (Dedetização)',
   'Registrar o controle de pragas e as barreiras de proteção do estabelecimento.',
   'manutencao', 'pest_control', 'regular', NULL, 'monthly', false, 30),
  ('conferencia-pedidos-delivery', 'Conferência de Pedidos (Delivery)',
   'Conferir itens, embalagem e lacre antes da saída do pedido.',
   'delivery', 'receipt_long', 'regular', 'Cozinha', 'daily', false, 10),
  ('higiene-temperatura-entrega', 'Higiene e Temperatura na Entrega',
   'Garantir bag higienizada e temperatura adequada dos pedidos na entrega.',
   'delivery', 'delivery_dining', 'regular', 'Cozinha', 'daily', false, 20),
  ('fechamento-financeiro-dia', 'Fechamento Financeiro do Dia',
   'Consolidar vendas, recebimentos e despesas do dia (visão do dono).',
   'administrativo', 'account_balance', 'closing', 'Caixa', 'daily', false, 10),
  ('controle-cmv', 'Controle de Custo de Mercadoria (CMV)',
   'Acompanhar o custo da mercadoria vendida e identificar desvios.',
   'administrativo', 'paid', 'regular', NULL, 'monthly', false, 20),
  ('passagem-turno', 'Passagem de Turno',
   'Alinhar pendências, faltas e prioridades entre os turnos.',
   'administrativo', 'groups', 'regular', NULL, 'daily', false, 30)
ON CONFLICT (slug) DO UPDATE SET
  name                 = EXCLUDED.name,
  description          = EXCLUDED.description,
  category             = EXCLUDED.category,
  icon                 = EXCLUDED.icon,
  suggested_type       = EXCLUDED.suggested_type,
  suggested_area_label = EXCLUDED.suggested_area_label,
  suggested_recurrence = EXCLUDED.suggested_recurrence,
  is_premium           = EXCLUDED.is_premium,
  sort_order           = EXCLUDED.sort_order,
  updated_at           = now();

-- ---------------------------------------------------------------------------
-- Itens (208 itens dos 27 modelos, numa única instrução; join por slug)
-- VALUES: (tpl_slug, item_slug, title, description, ord,
--          requires_photo, is_critical, requires_observation, type, max_photos, task_config)
-- ---------------------------------------------------------------------------
INSERT INTO public.checklist_template_items
  (template_id, item_slug, title, description, "order",
   requires_photo, is_critical, requires_observation, type, max_photos, task_config)
SELECT t.id, v.item_slug, v.title, v.description, v.ord,
       v.requires_photo, v.is_critical, v.requires_observation, v.type, v.max_photos, v.task_config
FROM public.checklist_templates t
JOIN (VALUES
  -- CONFERÊNCIA DE SANGRIA
  ('conferencia-sangria','contar-valor-retirada','Contar Valor da Retirada','Informe o valor retirado (R$).',1,false,false,false,'number',NULL::int,'{"min_value":0}'::jsonb),
  ('conferencia-sangria','registrar-sangria-sistema','Registrar Sangria no Sistema',NULL,2,false,false,false,NULL,NULL,NULL),
  ('conferencia-sangria','conferir-saldo-restante','Conferir Saldo Restante em Caixa','Informe o saldo que permanece no caixa (R$).',3,false,false,false,'number',NULL,'{"min_value":0}'::jsonb),
  ('conferencia-sangria','acondicionar-valor','Acondicionar Valor no Malote/Cofre',NULL,4,false,true,false,NULL,NULL,NULL),
  ('conferencia-sangria','registrar-responsavel-divergencia','Registrar Responsável e Divergências','Anote quem realizou e qualquer diferença.',5,false,false,true,NULL,NULL,NULL),

  -- AUDITORIA DE CAIXA
  ('auditoria-caixa','contar-dinheiro-fisico','Contar Dinheiro Físico','Total em espécie conferido (R$).',1,false,false,false,'number',NULL,'{"min_value":0}'::jsonb),
  ('auditoria-caixa','conferir-vendas-sistema','Conferir Total de Vendas no Sistema','Faturamento registrado no sistema (R$).',2,false,false,false,'number',NULL,'{"min_value":0}'::jsonb),
  ('auditoria-caixa','conferir-cartao-pix','Conferir Recebimentos em Cartão e Pix',NULL,3,false,false,false,NULL,NULL,NULL),
  ('auditoria-caixa','conferir-sangrias-suprimentos','Conferir Sangrias e Suprimentos do Dia',NULL,4,false,false,false,NULL,NULL,NULL),
  ('auditoria-caixa','calcular-diferenca','Calcular Diferença (Quebra/Sobra)','Diferença entre o físico e o sistema (R$).',5,false,false,false,'number',NULL,NULL),
  ('auditoria-caixa','registrar-justificativa','Registrar Justificativa das Divergências',NULL,6,false,false,true,NULL,NULL,NULL),
  ('auditoria-caixa','arquivar-comprovantes','Arquivar Comprovantes e Relatório',NULL,7,true,false,false,NULL,NULL,NULL),

  -- PRÉ-PREPARO (MISE EN PLACE)
  ('mise-en-place','conferir-fichas-tecnicas','Conferir Fichas Técnicas do Dia',NULL,1,false,false,false,NULL,NULL,NULL),
  ('mise-en-place','separar-insumos','Separar Insumos por Praça',NULL,2,false,false,false,NULL,NULL,NULL),
  ('mise-en-place','porcionar-proteinas','Porcionar e Pesar Proteínas',NULL,3,false,false,false,NULL,NULL,NULL),
  ('mise-en-place','cortar-legumes','Cortar Legumes e Vegetais',NULL,4,false,false,false,NULL,NULL,NULL),
  ('mise-en-place','preparar-molhos-bases','Preparar Molhos e Bases',NULL,5,false,false,false,NULL,NULL,NULL),
  ('mise-en-place','etiquetar-preparos','Etiquetar Preparos com Data e Validade',NULL,6,false,false,false,NULL,NULL,NULL),
  ('mise-en-place','abastecer-praca','Abastecer a Praça',NULL,7,true,false,false,NULL,NULL,NULL),
  ('mise-en-place','conferir-utensilios','Conferir Utensílios e Equipamentos da Praça',NULL,8,false,false,false,NULL,NULL,NULL),
  ('mise-en-place','organizar-geladeira-apoio','Organizar Geladeira de Apoio',NULL,9,false,false,false,NULL,NULL,NULL),

  -- TROCA DE ÓLEO DAS FRITADEIRAS
  ('troca-oleo-fritadeiras','desligar-resfriar','Desligar e Aguardar o Óleo Resfriar',NULL,1,false,true,false,NULL,NULL,NULL),
  ('troca-oleo-fritadeiras','drenar-oleo-usado','Drenar o Óleo Usado',NULL,2,false,false,false,NULL,NULL,NULL),
  ('troca-oleo-fritadeiras','descartar-corretamente','Descartar o Óleo em Recipiente Adequado','Nunca descartar o óleo na pia.',3,false,true,false,NULL,NULL,NULL),
  ('troca-oleo-fritadeiras','higienizar-cuba','Higienizar a Cuba da Fritadeira',NULL,4,true,false,false,NULL,NULL,NULL),
  ('troca-oleo-fritadeiras','abastecer-oleo-novo','Abastecer com Óleo Novo',NULL,5,false,false,false,NULL,NULL,NULL),
  ('troca-oleo-fritadeiras','registrar-troca','Registrar Data e Motivo da Troca',NULL,6,false,false,true,NULL,NULL,NULL),

  -- LIMPEZA PROFUNDA DA COZINHA
  ('limpeza-profunda-cozinha','desligar-esfriar-equipamentos','Desligar e Esfriar Equipamentos',NULL,1,false,false,false,NULL,NULL,NULL),
  ('limpeza-profunda-cozinha','limpar-chapa-fogao','Limpar Chapa, Fogão e Fornos',NULL,2,true,false,false,NULL,NULL,NULL),
  ('limpeza-profunda-cozinha','limpar-geladeiras','Limpar Geladeiras e Câmaras Internamente',NULL,3,false,false,false,NULL,NULL,NULL),
  ('limpeza-profunda-cozinha','higienizar-bancadas-paredes','Higienizar Bancadas, Azulejos e Paredes',NULL,4,true,false,false,NULL,NULL,NULL),
  ('limpeza-profunda-cozinha','limpar-ralos-pisos','Limpar Ralos e Pisos',NULL,5,false,false,false,NULL,NULL,NULL),
  ('limpeza-profunda-cozinha','limpar-filtros-exaustor','Limpar Filtros do Exaustor',NULL,6,false,false,false,NULL,NULL,NULL),
  ('limpeza-profunda-cozinha','verificar-vedacoes','Verificar Vedações e Borrachas',NULL,7,false,false,false,NULL,NULL,NULL),
  ('limpeza-profunda-cozinha','organizar-utensilios','Organizar e Higienizar Utensílios',NULL,8,false,false,false,NULL,NULL,NULL),
  ('limpeza-profunda-cozinha','conferir-resultado-final','Conferir Resultado Final',NULL,9,true,false,false,NULL,NULL,NULL),

  -- CONTROLE DE VALIDADE E ETIQUETAGEM
  ('controle-validade-etiquetagem','verificar-validades','Verificar Validade dos Produtos Abertos',NULL,1,false,false,false,NULL,NULL,NULL),
  ('controle-validade-etiquetagem','aplicar-etiquetas','Aplicar Etiquetas com Data de Abertura e Validade',NULL,2,true,false,false,NULL,NULL,NULL),
  ('controle-validade-etiquetagem','organizar-validade','Organizar pela Regra: Primeiro que Vence, Primeiro que Sai',NULL,3,false,false,false,NULL,NULL,NULL),
  ('controle-validade-etiquetagem','descartar-vencidos','Descartar Produtos Vencidos',NULL,4,false,true,false,NULL,NULL,NULL),
  ('controle-validade-etiquetagem','conferir-armazenamento','Conferir Armazenamento Correto (separação)',NULL,5,false,false,false,NULL,NULL,NULL),
  ('controle-validade-etiquetagem','registrar-perdas','Registrar Perdas e Descartes',NULL,6,false,false,true,NULL,NULL,NULL),
  ('controle-validade-etiquetagem','conferir-integridade-embalagens','Conferir Integridade das Embalagens',NULL,7,false,false,false,NULL,NULL,NULL),

  -- MONTAGEM E PREPARAÇÃO DAS MESAS
  ('montagem-mesas','conferir-limpeza-mesas','Conferir Limpeza de Mesas e Cadeiras',NULL,1,false,false,false,NULL,NULL,NULL),
  ('montagem-mesas','dispor-toalhas','Dispor Toalhas / Jogos Americanos',NULL,2,false,false,false,NULL,NULL,NULL),
  ('montagem-mesas','posicionar-talheres','Posicionar Talheres e Pratos',NULL,3,false,false,false,NULL,NULL,NULL),
  ('montagem-mesas','montar-couvert','Montar Couvert / Guardanapos',NULL,4,false,false,false,NULL,NULL,NULL),
  ('montagem-mesas','repor-temperos-mesa','Repor Saleiros e Temperos de Mesa',NULL,5,false,false,false,NULL,NULL,NULL),
  ('montagem-mesas','conferir-cardapios','Conferir Cardápios (limpos e completos)',NULL,6,false,false,false,NULL,NULL,NULL),
  ('montagem-mesas','padronizar-disposicao','Padronizar a Disposição do Salão',NULL,7,false,false,false,NULL,NULL,NULL),

  -- PADRÃO DE ATENDIMENTO AO CLIENTE
  ('padrao-atendimento','recepcao-cliente','Recepção e Acolhimento do Cliente',NULL,1,false,false,false,NULL,NULL,NULL),
  ('padrao-atendimento','apresentar-cardapio','Apresentar Cardápio e Sugestões',NULL,2,false,false,false,NULL,NULL,NULL),
  ('padrao-atendimento','anotar-pedido','Anotar o Pedido Corretamente',NULL,3,false,false,false,NULL,NULL,NULL),
  ('padrao-atendimento','cumprir-tempo-entrega','Cumprir o Tempo de Entrega dos Pratos',NULL,4,false,false,false,NULL,NULL,NULL),
  ('padrao-atendimento','acompanhar-mesa','Acompanhar a Mesa Durante a Refeição',NULL,5,false,false,false,NULL,NULL,NULL),
  ('padrao-atendimento','oferecer-sobremesa','Oferecer Sobremesa / Cafezinho',NULL,6,false,false,false,NULL,NULL,NULL),
  ('padrao-atendimento','agilidade-conta','Agilidade no Fechamento da Conta',NULL,7,false,false,false,NULL,NULL,NULL),
  ('padrao-atendimento','despedida-cliente','Despedida e Convite para Retornar',NULL,8,false,false,false,NULL,NULL,NULL),
  ('padrao-atendimento','avaliar-atendimento','Avaliar o Padrão de Atendimento','Dê uma nota geral ao atendimento observado.',9,false,false,false,'rating',NULL,NULL),

  -- CONTAGEM DE ESTOQUE (INVENTÁRIO)
  ('contagem-estoque','organizar-itens','Organizar Itens para Contagem',NULL,1,false,false,false,NULL,NULL,NULL),
  ('contagem-estoque','contar-secos','Contar Estoque Seco','Quantidade conferida.',2,false,false,false,'number',NULL,'{"min_value":0}'::jsonb),
  ('contagem-estoque','contar-refrigerados','Contar Estoque Refrigerado','Quantidade conferida.',3,false,false,false,'number',NULL,'{"min_value":0}'::jsonb),
  ('contagem-estoque','contar-congelados','Contar Estoque Congelado','Quantidade conferida.',4,false,false,false,'number',NULL,'{"min_value":0}'::jsonb),
  ('contagem-estoque','contar-bebidas','Contar Bebidas','Quantidade conferida.',5,false,false,false,'number',NULL,'{"min_value":0}'::jsonb),
  ('contagem-estoque','contar-descartaveis','Contar Descartáveis e Embalagens','Quantidade conferida.',6,false,false,false,'number',NULL,'{"min_value":0}'::jsonb),
  ('contagem-estoque','comparar-sistema','Comparar a Contagem com o Sistema',NULL,7,false,false,false,NULL,NULL,NULL),
  ('contagem-estoque','atualizar-sistema','Atualizar o Sistema com a Contagem',NULL,8,false,false,false,NULL,NULL,NULL),

  -- ORGANIZAÇÃO DA CÂMARA FRIA
  ('organizacao-camara-fria','conferir-temperatura','Conferir Temperatura da Câmara','Faixa segura: 0°C a 5°C.',1,false,false,false,'number',NULL,'{"min_value":0,"max_value":5}'::jsonb),
  ('organizacao-camara-fria','organizar-prateleiras','Organizar Prateleiras (cru embaixo, pronto em cima)',NULL,2,false,true,false,NULL,NULL,NULL),
  ('organizacao-camara-fria','separar-por-tipo','Separar Alimentos por Tipo',NULL,3,false,false,false,NULL,NULL,NULL),
  ('organizacao-camara-fria','aplicar-validade','Aplicar Primeiro que Vence, Primeiro que Sai',NULL,4,false,false,false,NULL,NULL,NULL),
  ('organizacao-camara-fria','verificar-cobertos-identificados','Verificar Alimentos Cobertos e Identificados',NULL,5,false,false,false,NULL,NULL,NULL),
  ('organizacao-camara-fria','limpar-derramamentos','Limpar Derramamentos e Resíduos',NULL,6,true,false,false,NULL,NULL,NULL),
  ('organizacao-camara-fria','registrar-anomalias','Registrar Anomalias (gelo, odor, falha)',NULL,7,false,false,true,NULL,NULL,NULL),

  -- PEDIDO DE COMPRAS E REPOSIÇÃO
  ('pedido-compras-reposicao','verificar-niveis','Verificar Níveis de Estoque',NULL,1,false,false,false,NULL,NULL,NULL),
  ('pedido-compras-reposicao','identificar-abaixo-minimo','Identificar Itens Abaixo do Mínimo',NULL,2,false,false,false,NULL,NULL,NULL),
  ('pedido-compras-reposicao','definir-quantidade','Definir Quantidade a Pedir','Quantidade total do pedido.',3,false,false,false,'number',NULL,'{"min_value":0}'::jsonb),
  ('pedido-compras-reposicao','conferir-fornecedores','Conferir Fornecedores e Preços',NULL,4,false,false,false,NULL,NULL,NULL),
  ('pedido-compras-reposicao','emitir-pedido','Emitir o Pedido de Compra',NULL,5,false,false,false,NULL,NULL,NULL),
  ('pedido-compras-reposicao','confirmar-fornecedor','Confirmar o Pedido com o Fornecedor',NULL,6,false,false,false,NULL,NULL,NULL),
  ('pedido-compras-reposicao','conferir-orcamento','Conferir o Orçamento do Pedido','Valor total do pedido (R$).',7,false,false,false,'number',NULL,'{"min_value":0}'::jsonb),

  -- PLANO DE LIMPEZA E HIGIENIZAÇÃO
  ('plano-limpeza-higienizacao','limpar-pisos-producao','Limpar Pisos da Área de Produção',NULL,1,false,false,false,NULL,NULL,NULL),
  ('plano-limpeza-higienizacao','higienizar-bancadas-superficies','Higienizar Bancadas e Superfícies',NULL,2,true,false,false,NULL,NULL,NULL),
  ('plano-limpeza-higienizacao','limpar-equipamentos','Limpar os Equipamentos',NULL,3,false,false,false,NULL,NULL,NULL),
  ('plano-limpeza-higienizacao','higienizar-utensilios','Higienizar os Utensílios',NULL,4,false,false,false,NULL,NULL,NULL),
  ('plano-limpeza-higienizacao','limpar-paredes-azulejos','Limpar Paredes e Azulejos',NULL,5,false,false,false,NULL,NULL,NULL),
  ('plano-limpeza-higienizacao','limpar-ralos-canaletas','Limpar Ralos e Canaletas',NULL,6,false,false,false,NULL,NULL,NULL),
  ('plano-limpeza-higienizacao','higienizar-lixeiras','Higienizar as Lixeiras',NULL,7,false,false,false,NULL,NULL,NULL),
  ('plano-limpeza-higienizacao','trocar-panos-esponjas','Trocar Panos e Esponjas',NULL,8,false,false,false,NULL,NULL,NULL),
  ('plano-limpeza-higienizacao','repor-produtos-limpeza','Repor Produtos de Limpeza',NULL,9,false,false,false,NULL,NULL,NULL),
  ('plano-limpeza-higienizacao','registrar-execucao','Registrar Execução e Responsável',NULL,10,true,false,false,NULL,NULL,NULL),

  -- LIMPEZA E REPOSIÇÃO DE BANHEIROS
  ('higienizacao-banheiros','limpar-vasos-pias','Limpar e Desinfetar Vasos e Pias',NULL,1,true,true,false,NULL,NULL,NULL),
  ('higienizacao-banheiros','limpar-espelhos-bancadas','Limpar Espelhos e Bancadas',NULL,2,false,false,false,NULL,NULL,NULL),
  ('higienizacao-banheiros','limpar-piso','Limpar e Desinfetar o Piso',NULL,3,false,false,false,NULL,NULL,NULL),
  ('higienizacao-banheiros','repor-papel-higienico','Repor Papel Higiênico',NULL,4,false,false,false,NULL,NULL,NULL),
  ('higienizacao-banheiros','repor-sabonete','Repor Sabonete',NULL,5,false,false,false,NULL,NULL,NULL),
  ('higienizacao-banheiros','repor-papel-toalha','Repor Papel-Toalha',NULL,6,false,false,false,NULL,NULL,NULL),
  ('higienizacao-banheiros','esvaziar-lixeiras','Esvaziar Lixeiras e Trocar Sacos',NULL,7,false,false,false,NULL,NULL,NULL),
  ('higienizacao-banheiros','verificar-odor-ventilacao','Verificar Odor e Ventilação',NULL,8,false,false,false,NULL,NULL,NULL),

  -- BOAS PRÁTICAS DE MANIPULAÇÃO DE ALIMENTOS
  ('boas-praticas-manipulacao','higiene-maos','Higienização Correta das Mãos',NULL,1,false,true,false,NULL,NULL,NULL),
  ('boas-praticas-manipulacao','uso-uniforme-epi','Uso de Uniforme e EPIs Limpos',NULL,2,false,false,false,NULL,NULL,NULL),
  ('boas-praticas-manipulacao','uso-touca','Uso de Touca / Proteção dos Cabelos',NULL,3,false,false,false,NULL,NULL,NULL),
  ('boas-praticas-manipulacao','evitar-contaminacao-cruzada','Evitar Contaminação Cruzada (tábuas/utensílios)',NULL,4,false,true,false,NULL,NULL,NULL),
  ('boas-praticas-manipulacao','higienizar-utensilios-superficies','Higienizar Utensílios e Superfícies',NULL,5,false,false,false,NULL,NULL,NULL),
  ('boas-praticas-manipulacao','controle-temperatura-preparo','Controle de Temperatura no Preparo',NULL,6,false,false,false,NULL,NULL,NULL),
  ('boas-praticas-manipulacao','armazenamento-correto','Armazenamento Correto dos Alimentos',NULL,7,false,false,false,NULL,NULL,NULL),
  ('boas-praticas-manipulacao','etiquetagem-validade','Etiquetagem e Controle de Validade',NULL,8,false,false,false,NULL,NULL,NULL),
  ('boas-praticas-manipulacao','higienizacao-hortifruti','Higienização de Hortifrúti',NULL,9,false,false,false,NULL,NULL,NULL),
  ('boas-praticas-manipulacao','descarte-residuos','Descarte Correto de Resíduos',NULL,10,false,false,false,NULL,NULL,NULL),
  ('boas-praticas-manipulacao','evidencia-conformidade','Registrar Evidência de Conformidade',NULL,11,true,false,false,NULL,NULL,NULL),
  ('boas-praticas-manipulacao','registrar-nao-conformidades','Registrar Não Conformidades',NULL,12,false,false,true,NULL,NULL,NULL),

  -- HIGIENE E SAÚDE DA EQUIPE
  ('higiene-saude-equipe','conferir-uniforme','Conferir Uniforme Limpo e Completo',NULL,1,false,false,false,NULL,NULL,NULL),
  ('higiene-saude-equipe','conferir-maos-unhas','Conferir Mãos e Unhas (curtas, sem esmalte)',NULL,2,false,true,false,NULL,NULL,NULL),
  ('higiene-saude-equipe','conferir-adornos','Conferir Ausência de Adornos (anéis, brincos)',NULL,3,false,false,false,NULL,NULL,NULL),
  ('higiene-saude-equipe','conferir-cabelos','Conferir Cabelos Presos / Touca',NULL,4,false,false,false,NULL,NULL,NULL),
  ('higiene-saude-equipe','conferir-ferimentos','Conferir Ausência de Ferimentos Expostos',NULL,5,false,true,false,NULL,NULL,NULL),
  ('higiene-saude-equipe','conferir-sintomas','Conferir Ausência de Sintomas (gripe, mal-estar)',NULL,6,false,false,false,NULL,NULL,NULL),
  ('higiene-saude-equipe','registrar-afastamentos','Registrar Afastamentos / Observações de Saúde',NULL,7,false,false,true,NULL,NULL,NULL),

  -- HIGIENIZAÇÃO DE FRUTAS E VERDURAS
  ('higienizacao-frutas-verduras','pre-lavar','Pré-Lavar em Água Corrente',NULL,1,false,false,false,NULL,NULL,NULL),
  ('higienizacao-frutas-verduras','preparar-solucao','Preparar Solução Clorada','Seguir a diluição indicada no rótulo do produto.',2,false,false,false,NULL,NULL,NULL),
  ('higienizacao-frutas-verduras','imersao','Imersão pelo Tempo Correto',NULL,3,false,false,false,NULL,NULL,NULL),
  ('higienizacao-frutas-verduras','enxaguar','Enxaguar em Água Potável',NULL,4,false,false,false,NULL,NULL,NULL),
  ('higienizacao-frutas-verduras','armazenar','Armazenar Higienizados Separadamente',NULL,5,false,false,false,NULL,NULL,NULL),
  ('higienizacao-frutas-verduras','registrar-higienizacao','Registrar a Higienização',NULL,6,true,false,false,NULL,NULL,NULL),

  -- CHECKLIST DE VIGILÂNCIA SANITÁRIA
  ('vigilancia-sanitaria','documentacao-licencas','Documentação e Licenças em Dia',NULL,1,false,false,false,NULL,NULL,NULL),
  ('vigilancia-sanitaria','manual-boas-praticas','Manual de Boas Práticas Disponível',NULL,2,false,false,false,NULL,NULL,NULL),
  ('vigilancia-sanitaria','procedimentos-higiene','Procedimentos de Higiene Documentados',NULL,3,false,false,false,NULL,NULL,NULL),
  ('vigilancia-sanitaria','higiene-instalacoes','Higiene das Instalações',NULL,4,false,false,false,NULL,NULL,NULL),
  ('vigilancia-sanitaria','registros-temperatura','Registros de Temperatura em Dia',NULL,5,false,false,false,NULL,NULL,NULL),
  ('vigilancia-sanitaria','controle-validade','Controle de Validade e Etiquetagem',NULL,6,false,false,false,NULL,NULL,NULL),
  ('vigilancia-sanitaria','armazenamento-adequado','Armazenamento Adequado dos Alimentos',NULL,7,false,false,false,NULL,NULL,NULL),
  ('vigilancia-sanitaria','higiene-manipuladores','Higiene dos Manipuladores',NULL,8,false,false,false,NULL,NULL,NULL),
  ('vigilancia-sanitaria','controle-pragas-evidencia','Evidência de Controle de Pragas',NULL,9,false,false,false,NULL,NULL,NULL),
  ('vigilancia-sanitaria','potabilidade-agua','Controle de Potabilidade da Água',NULL,10,false,false,false,NULL,NULL,NULL),
  ('vigilancia-sanitaria','destino-residuos','Destino Correto dos Resíduos',NULL,11,false,false,false,NULL,NULL,NULL),
  ('vigilancia-sanitaria','equipamentos-conservacao','Equipamentos em Bom Estado de Conservação',NULL,12,false,false,false,NULL,NULL,NULL),
  ('vigilancia-sanitaria','ausencia-pragas','Ausência de Sinais de Pragas',NULL,13,false,true,false,NULL,NULL,NULL),
  ('vigilancia-sanitaria','evidencia-fotografica','Registrar Evidência Fotográfica',NULL,14,true,false,false,NULL,NULL,NULL),
  ('vigilancia-sanitaria','registrar-nao-conformidades','Registrar Não Conformidades e Ações',NULL,15,false,false,true,NULL,NULL,NULL),
  ('vigilancia-sanitaria','avaliar-conformidade','Avaliar a Conformidade Geral','Nota geral de prontidão para fiscalização.',16,false,false,false,'rating',NULL,NULL),

  -- INSPEÇÃO DE GELADEIRAS E CÂMARAS FRIAS
  ('inspecao-refrigeracao','aferir-temperatura','Aferir Temperatura de Cada Equipamento','Registre a temperatura aferida (°C).',1,false,false,false,'number',NULL,'{"min_value":-25,"max_value":7}'::jsonb),
  ('inspecao-refrigeracao','verificar-vedacao','Verificar Vedação e Borrachas',NULL,2,false,false,false,NULL,NULL,NULL),
  ('inspecao-refrigeracao','verificar-gelo','Verificar Formação Excessiva de Gelo',NULL,3,false,false,false,NULL,NULL,NULL),
  ('inspecao-refrigeracao','verificar-dreno','Verificar Dreno e Escoamento',NULL,4,false,false,false,NULL,NULL,NULL),
  ('inspecao-refrigeracao','verificar-motor','Verificar Ruído e Funcionamento do Motor',NULL,5,false,false,false,NULL,NULL,NULL),
  ('inspecao-refrigeracao','limpar-condensador','Limpar Condensador / Grade Traseira',NULL,6,false,false,false,NULL,NULL,NULL),
  ('inspecao-refrigeracao','registrar-falhas','Registrar Falhas e Foto',NULL,7,true,false,false,NULL,NULL,NULL),

  -- INSPEÇÃO DE SEGURANÇA DO GÁS
  ('inspecao-gas','verificar-botijoes','Verificar Botijões / Central de Gás',NULL,1,false,true,false,NULL,NULL,NULL),
  ('inspecao-gas','testar-vazamento','Testar Vazamento (água e sabão)','Nunca use chama para testar vazamento.',2,false,true,false,NULL,NULL,NULL),
  ('inspecao-gas','verificar-mangueiras','Verificar Mangueiras e Validade',NULL,3,false,false,false,NULL,NULL,NULL),
  ('inspecao-gas','verificar-registros-valvulas','Verificar Registros e Válvulas',NULL,4,false,false,false,NULL,NULL,NULL),
  ('inspecao-gas','conferir-ventilacao','Conferir Ventilação do Ambiente',NULL,5,false,false,false,NULL,NULL,NULL),
  ('inspecao-gas','registrar-inspecao','Registrar Inspeção (foto e observação)',NULL,6,true,false,true,NULL,NULL,NULL),

  -- MANUTENÇÃO PREVENTIVA DE EQUIPAMENTOS
  ('manutencao-preventiva','inspecionar-refrigeracao','Inspecionar Equipamentos de Refrigeração',NULL,1,false,false,false,NULL,NULL,NULL),
  ('manutencao-preventiva','inspecionar-coccao','Inspecionar Equipamentos de Cocção',NULL,2,false,false,false,NULL,NULL,NULL),
  ('manutencao-preventiva','verificar-eletrica','Verificar Instalações Elétricas (tomadas, fios)',NULL,3,false,false,false,NULL,NULL,NULL),
  ('manutencao-preventiva','verificar-hidraulica','Verificar Vazamentos Hidráulicos',NULL,4,false,false,false,NULL,NULL,NULL),
  ('manutencao-preventiva','lubrificar-pecas','Lubrificar Peças Móveis',NULL,5,false,false,false,NULL,NULL,NULL),
  ('manutencao-preventiva','testar-equipamentos','Testar Funcionamento dos Equipamentos',NULL,6,false,false,false,NULL,NULL,NULL),
  ('manutencao-preventiva','agendar-reparos','Agendar Reparos Necessários',NULL,7,false,false,false,NULL,NULL,NULL),
  ('manutencao-preventiva','registrar-manutencao','Registrar a Manutenção',NULL,8,true,false,false,NULL,NULL,NULL),

  -- LIMPEZA DE COIFA, EXAUSTÃO E FILTROS
  ('limpeza-coifa-exaustao','desligar-sistema','Desligar o Sistema de Exaustão',NULL,1,false,true,false,NULL,NULL,NULL),
  ('limpeza-coifa-exaustao','remover-filtros','Remover Filtros Metálicos',NULL,2,false,false,false,NULL,NULL,NULL),
  ('limpeza-coifa-exaustao','desengordurar-filtros','Desengordurar os Filtros',NULL,3,true,false,false,NULL,NULL,NULL),
  ('limpeza-coifa-exaustao','limpar-coifa-dutos','Limpar Coifa e Dutos Acessíveis',NULL,4,false,false,false,NULL,NULL,NULL),
  ('limpeza-coifa-exaustao','recolocar-filtros','Recolocar Filtros e Testar',NULL,5,false,false,false,NULL,NULL,NULL),
  ('limpeza-coifa-exaustao','registrar-limpeza','Registrar Limpeza e Próxima Data',NULL,6,false,false,false,NULL,NULL,NULL),

  -- CONTROLE DE PRAGAS (DEDETIZAÇÃO)
  ('controle-pragas','verificar-iscas','Verificar Iscas e Armadilhas',NULL,1,false,false,false,NULL,NULL,NULL),
  ('controle-pragas','inspecionar-sinais','Inspecionar Sinais de Pragas',NULL,2,false,true,false,NULL,NULL,NULL),
  ('controle-pragas','verificar-barreiras','Verificar Barreiras (telas, ralos, frestas)',NULL,3,false,false,false,NULL,NULL,NULL),
  ('controle-pragas','conferir-certificado','Conferir Certificado de Dedetização Vigente',NULL,4,false,false,false,NULL,NULL,NULL),
  ('controle-pragas','conferir-armazenamento-protegido','Conferir Armazenamento Protegido',NULL,5,false,false,false,NULL,NULL,NULL),
  ('controle-pragas','registrar-ocorrencias','Registrar Ocorrências',NULL,6,false,false,true,NULL,NULL,NULL),
  ('controle-pragas','anexar-evidencia','Anexar Evidência / Certificado',NULL,7,true,false,false,NULL,NULL,NULL),

  -- CONFERÊNCIA DE PEDIDOS (DELIVERY)
  ('conferencia-pedidos-delivery','conferir-itens','Conferir Itens do Pedido',NULL,1,false,true,false,NULL,NULL,NULL),
  ('conferencia-pedidos-delivery','conferir-acompanhamentos','Conferir Acompanhamentos e Talheres',NULL,2,false,false,false,NULL,NULL,NULL),
  ('conferencia-pedidos-delivery','conferir-embalagem','Conferir Embalagem Adequada',NULL,3,false,false,false,NULL,NULL,NULL),
  ('conferencia-pedidos-delivery','lacrar-embalagem','Lacrar a Embalagem',NULL,4,false,false,false,NULL,NULL,NULL),
  ('conferencia-pedidos-delivery','conferir-dados-entrega','Conferir os Dados de Entrega',NULL,5,false,false,false,NULL,NULL,NULL),
  ('conferencia-pedidos-delivery','anexar-nota','Anexar Nota / Comanda',NULL,6,false,false,false,NULL,NULL,NULL),
  ('conferencia-pedidos-delivery','registrar-foto-pedido','Registrar Foto do Pedido Pronto',NULL,7,true,false,false,NULL,NULL,NULL),

  -- HIGIENE E TEMPERATURA NA ENTREGA
  ('higiene-temperatura-entrega','higienizar-bag','Higienizar a Bag de Entrega',NULL,1,true,false,false,NULL,NULL,NULL),
  ('higiene-temperatura-entrega','conferir-temperatura-quentes','Conferir Temperatura de Pratos Quentes','Manter acima de 60°C.',2,false,false,false,'number',NULL,'{"min_value":60}'::jsonb),
  ('higiene-temperatura-entrega','conferir-temperatura-frios','Conferir Temperatura de Itens Frios/Gelados','Manter refrigerado (até 10°C).',3,false,false,false,'number',NULL,'{"max_value":10}'::jsonb),
  ('higiene-temperatura-entrega','separar-quentes-frios','Separar Itens Quentes e Frios na Bag',NULL,4,false,false,false,NULL,NULL,NULL),
  ('higiene-temperatura-entrega','conferir-tempo-saida','Conferir o Tempo Máximo de Saída',NULL,5,false,false,false,NULL,NULL,NULL),
  ('higiene-temperatura-entrega','conferir-higiene-entregador','Conferir Higiene do Entregador',NULL,6,false,false,false,NULL,NULL,NULL),

  -- FECHAMENTO FINANCEIRO DO DIA
  ('fechamento-financeiro-dia','consolidar-vendas','Consolidar as Vendas do Dia','Faturamento total do dia (R$).',1,false,false,false,'number',NULL,'{"min_value":0}'::jsonb),
  ('fechamento-financeiro-dia','conferir-dinheiro','Conferir Recebimentos em Dinheiro','Total em espécie (R$).',2,false,false,false,'number',NULL,'{"min_value":0}'::jsonb),
  ('fechamento-financeiro-dia','conferir-cartao-pix','Conferir Cartão e Pix','Total em cartão e Pix (R$).',3,false,false,false,'number',NULL,'{"min_value":0}'::jsonb),
  ('fechamento-financeiro-dia','conferir-delivery-apps','Conferir Recebimentos de Apps de Delivery',NULL,4,false,false,false,NULL,NULL,NULL),
  ('fechamento-financeiro-dia','conferir-despesas','Conferir Despesas do Dia','Total de despesas pagas (R$).',5,false,false,false,'number',NULL,'{"min_value":0}'::jsonb),
  ('fechamento-financeiro-dia','identificar-divergencias','Identificar Divergências',NULL,6,false,false,true,NULL,NULL,NULL),
  ('fechamento-financeiro-dia','emitir-relatorio','Emitir Relatório de Fechamento',NULL,7,true,false,false,NULL,NULL,NULL),

  -- CONTROLE DE CUSTO DE MERCADORIA (CMV)
  ('controle-cmv','estoque-inicial','Levantar o Estoque Inicial','Valor do estoque inicial (R$).',1,false,false,false,'number',NULL,'{"min_value":0}'::jsonb),
  ('controle-cmv','somar-compras','Somar as Compras do Período','Total de compras no período (R$).',2,false,false,false,'number',NULL,'{"min_value":0}'::jsonb),
  ('controle-cmv','estoque-final','Levantar o Estoque Final','Valor do estoque final (R$).',3,false,false,false,'number',NULL,'{"min_value":0}'::jsonb),
  ('controle-cmv','calcular-cmv','Calcular o CMV do Período','CMV = Estoque Inicial + Compras − Estoque Final.',4,false,false,false,'number',NULL,'{"min_value":0}'::jsonb),
  ('controle-cmv','calcular-percentual','Calcular o % de CMV sobre o Faturamento','Percentual de CMV (%).',5,false,false,false,'number',NULL,'{"min_value":0,"max_value":100}'::jsonb),
  ('controle-cmv','comparar-meta','Comparar com a Meta',NULL,6,false,false,false,NULL,NULL,NULL),
  ('controle-cmv','identificar-desvios','Identificar Desvios e Perdas',NULL,7,false,false,true,NULL,NULL,NULL),
  ('controle-cmv','definir-acoes','Definir Ações de Correção',NULL,8,false,false,false,NULL,NULL,NULL),

  -- PASSAGEM DE TURNO
  ('passagem-turno','revisar-pendencias','Revisar Pendências do Turno Anterior',NULL,1,false,false,false,NULL,NULL,NULL),
  ('passagem-turno','informar-faltas-reservas','Informar Faltas, Reservas e Eventos',NULL,2,false,false,false,NULL,NULL,NULL),
  ('passagem-turno','conferir-estoque-operacional','Conferir Estoque Operacional / Reposições',NULL,3,false,false,false,NULL,NULL,NULL),
  ('passagem-turno','alinhar-prioridades','Alinhar Prioridades do Próximo Turno',NULL,4,false,false,false,NULL,NULL,NULL),
  ('passagem-turno','comunicar-ocorrencias','Comunicar Ocorrências e Manutenções',NULL,5,false,false,false,NULL,NULL,NULL),
  ('passagem-turno','confirmar-equipe','Confirmar a Equipe Presente',NULL,6,false,false,false,NULL,NULL,NULL)
) AS v(tpl_slug, item_slug, title, description, ord,
       requires_photo, is_critical, requires_observation, type, max_photos, task_config)
  ON t.slug = v.tpl_slug
ON CONFLICT (template_id, item_slug) DO UPDATE SET
  title                = EXCLUDED.title,
  description          = EXCLUDED.description,
  "order"              = EXCLUDED."order",
  requires_photo       = EXCLUDED.requires_photo,
  is_critical          = EXCLUDED.is_critical,
  requires_observation = EXCLUDED.requires_observation,
  type                 = EXCLUDED.type,
  max_photos           = EXCLUDED.max_photos,
  task_config          = EXCLUDED.task_config;

COMMIT;
