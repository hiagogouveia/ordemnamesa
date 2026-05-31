-- ============================================================
-- Sprint 70 — Seed do catálogo v1 (8 modelos essenciais)
-- ============================================================
-- Idempotente: templates por slug, itens por (template_id, item_slug).
-- Re-rodar não duplica. Conteúdo curado a partir de POPs de restaurante
-- e boas práticas ANVISA (RDC 216/275).
-- Recebimento NÃO entra (já possui módulo próprio).
-- ============================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Templates
-- ---------------------------------------------------------------------------
INSERT INTO public.checklist_templates
  (slug, name, description, category, icon, suggested_type, suggested_area_label, suggested_recurrence, is_premium, sort_order)
VALUES
  ('abertura-cozinha', 'Abertura de Cozinha',
   'Rotina diária para ligar equipamentos e abastecer a praça antes do início do serviço.',
   'cozinha', 'restaurant', 'opening', 'Cozinha', 'daily', false, 10),
  ('fechamento-cozinha', 'Fechamento de Cozinha',
   'Rotina diária para desligar equipamentos, armazenar alimentos e deixar a cozinha segura e higienizada ao fim do serviço.',
   'cozinha', 'restaurant', 'closing', 'Cozinha', 'daily', false, 20),
  ('abertura-salao', 'Abertura de Salão',
   'Preparar o salão antes da abertura: ambiente, mesas e materiais de atendimento.',
   'salao', 'table_restaurant', 'opening', 'Salão', 'daily', false, 30),
  ('fechamento-salao', 'Fechamento de Salão',
   'Organizar e fechar o salão ao fim do expediente, garantindo segurança e limpeza.',
   'salao', 'table_restaurant', 'closing', 'Salão', 'daily', false, 40),
  ('abertura-caixa', 'Abertura de Caixa',
   'Conferir fundo de troco e preparar o caixa/PDV antes do início das vendas.',
   'caixa', 'point_of_sale', 'opening', 'Caixa', 'daily', false, 50),
  ('fechamento-caixa', 'Fechamento de Caixa',
   'Conferência de valores, sangria e fechamento do caixa ao fim do expediente.',
   'caixa', 'point_of_sale', 'closing', 'Caixa', 'daily', false, 60),
  ('controle-temperatura', 'Controle de Temperatura',
   'Aferição diária das temperaturas de câmaras, geladeiras e balcões — segurança alimentar (ANVISA RDC 216).',
   'seguranca_alimentar', 'thermostat', 'regular', 'Segurança Alimentar', 'daily', false, 70),
  ('limpeza-geral-fechamento', 'Limpeza Geral de Fechamento',
   'Limpeza completa do estabelecimento ao fim do expediente: pisos, banheiros e superfícies.',
   'limpeza', 'cleaning_services', 'closing', 'Limpeza', 'daily', false, 80)
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
-- Itens (todos os modelos numa única instrução, join por slug do template)
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
  -- ABERTURA DE COZINHA
  ('abertura-cozinha','abrir-registro-gas','Abrir Registro de Gás',NULL,1,false,true,false,NULL::text,NULL::int,NULL::jsonb),
  ('abertura-cozinha','ligar-exaustor','Ligar Exaustor/Coifa',NULL,2,false,false,false,NULL,NULL,NULL),
  ('abertura-cozinha','ligar-chapa','Ligar Chapa',NULL,3,false,false,false,NULL,NULL,NULL),
  ('abertura-cozinha','ligar-fritadeiras','Ligar Fritadeiras',NULL,4,false,false,false,NULL,NULL,NULL),
  ('abertura-cozinha','avaliar-oleo','Avalie o Óleo das Fritadeiras','Verifique cor, espuma e cheiro. Registre observação e foto.',5,true,true,true,NULL,2,NULL),
  ('abertura-cozinha','abastecer-praca','Abastecer Praça com Insumos',NULL,6,true,false,false,NULL,NULL,NULL),
  ('abertura-cozinha','verificar-validade','Verificar Validade dos Insumos na Praça',NULL,7,false,false,false,NULL,NULL,NULL),
  ('abertura-cozinha','higienizar-bancadas','Higienizar Bancadas',NULL,8,true,false,false,NULL,NULL,NULL),

  -- FECHAMENTO DE COZINHA
  ('fechamento-cozinha','desligar-equipamentos','Desligar Equipamentos (chapa, fritadeira, forno)',NULL,1,false,true,false,NULL,NULL,NULL),
  ('fechamento-cozinha','fechar-registro-gas','Fechar Registro de Gás',NULL,2,false,true,false,NULL,NULL,NULL),
  ('fechamento-cozinha','armazenar-alimentos','Armazenar Alimentos','Refrigerar e identificar com data. Seguir PVPS/FIFO.',3,true,false,false,NULL,NULL,NULL),
  ('fechamento-cozinha','descartar-pereciveis','Descartar Perecíveis Vencidos',NULL,4,false,false,false,NULL,NULL,NULL),
  ('fechamento-cozinha','limpar-chapa-fritadeira','Limpar Chapa e Fritadeiras',NULL,5,true,false,false,NULL,NULL,NULL),
  ('fechamento-cozinha','higienizar-bancadas-piso','Higienizar Bancadas e Piso',NULL,6,true,false,false,NULL,NULL,NULL),
  ('fechamento-cozinha','conferir-temp-camara','Conferir Temperatura da Câmara/Geladeira','Anote a temperatura aferida (°C).',7,false,false,true,'number',NULL,'{"min_value":-25,"max_value":7}'::jsonb),
  ('fechamento-cozinha','retirar-lixo','Retirar Lixo',NULL,8,false,false,false,NULL,NULL,NULL),
  ('fechamento-cozinha','trancar-cozinha','Trancar Cozinha',NULL,9,false,true,false,NULL,NULL,NULL),

  -- ABERTURA DE SALÃO
  ('abertura-salao','ligar-luzes-ar','Ligar Luzes e Ar-condicionado',NULL,1,false,false,false,NULL,NULL,NULL),
  ('abertura-salao','conferir-limpeza-salao','Conferir Limpeza do Salão',NULL,2,true,false,false,NULL,NULL,NULL),
  ('abertura-salao','organizar-mesas-cadeiras','Organizar Mesas e Cadeiras',NULL,3,false,false,false,NULL,NULL,NULL),
  ('abertura-salao','repor-saleiros-temperos','Repor Saleiros, Guardanapos e Temperos',NULL,4,false,false,false,NULL,NULL,NULL),
  ('abertura-salao','conferir-cardapios','Conferir Cardápios (limpos e completos)',NULL,5,false,false,false,NULL,NULL,NULL),
  ('abertura-salao','testar-maquina-cartao','Testar Máquina de Cartão',NULL,6,false,false,false,NULL,NULL,NULL),
  ('abertura-salao','ligar-musica-ambiente','Ligar Música Ambiente',NULL,7,false,false,false,NULL,NULL,NULL),

  -- FECHAMENTO DE SALÃO
  ('fechamento-salao','limpar-mesas-cadeiras','Limpar Mesas e Cadeiras',NULL,1,true,false,false,NULL,NULL,NULL),
  ('fechamento-salao','organizar-salao','Organizar Salão para o Dia Seguinte',NULL,2,false,false,false,NULL,NULL,NULL),
  ('fechamento-salao','recolher-saleiros-temperos','Recolher Saleiros e Temperos',NULL,3,false,false,false,NULL,NULL,NULL),
  ('fechamento-salao','varrer-passar-pano','Varrer e Passar Pano no Piso',NULL,4,true,false,false,NULL,NULL,NULL),
  ('fechamento-salao','desligar-equipamentos-salao','Desligar Equipamentos (TV, som, ar)',NULL,5,false,false,false,NULL,NULL,NULL),
  ('fechamento-salao','conferir-portas-janelas','Conferir Portas e Janelas',NULL,6,false,true,false,NULL,NULL,NULL),
  ('fechamento-salao','apagar-luzes','Apagar Luzes',NULL,7,false,false,false,NULL,NULL,NULL),

  -- ABERTURA DE CAIXA
  ('abertura-caixa','conferir-fundo-troco','Conferir Fundo de Troco','Informe o valor do fundo de troco (R$).',1,false,true,true,'number',NULL,'{"min_value":0}'::jsonb),
  ('abertura-caixa','registrar-valor-abertura','Registrar Valor de Abertura no Sistema',NULL,2,false,false,false,'number',NULL,'{"min_value":0}'::jsonb),
  ('abertura-caixa','ligar-sistema-pdv','Ligar Sistema/PDV',NULL,3,false,false,false,NULL,NULL,NULL),
  ('abertura-caixa','testar-impressora','Testar Impressora Fiscal',NULL,4,false,false,false,NULL,NULL,NULL),
  ('abertura-caixa','testar-maquininha','Testar Maquininha de Cartão',NULL,5,false,false,false,NULL,NULL,NULL),
  ('abertura-caixa','conferir-bobinas','Conferir Bobinas e Materiais',NULL,6,false,false,false,NULL,NULL,NULL),

  -- FECHAMENTO DE CAIXA
  ('fechamento-caixa','contar-dinheiro-gaveta','Contar Dinheiro na Gaveta','Informe o total em espécie (R$).',1,false,true,true,'number',NULL,'{"min_value":0}'::jsonb),
  ('fechamento-caixa','conferir-vendas-sistema','Conferir Vendas no Sistema',NULL,2,false,false,false,NULL,NULL,NULL),
  ('fechamento-caixa','conferir-cartao-pix','Conferir Recebimentos Cartão/Pix',NULL,3,false,false,false,NULL,NULL,NULL),
  ('fechamento-caixa','registrar-sangria','Registrar Sangria','Informe o valor retirado (R$).',4,false,false,true,'number',NULL,'{"min_value":0}'::jsonb),
  ('fechamento-caixa','identificar-divergencias','Identificar Divergências','Descreva qualquer diferença entre sistema e caixa físico.',5,false,false,true,NULL,NULL,NULL),
  ('fechamento-caixa','emitir-fechamento','Emitir Relatório de Fechamento',NULL,6,true,false,false,NULL,NULL,NULL),
  ('fechamento-caixa','guardar-valores','Guardar Valores no Cofre',NULL,7,false,true,false,NULL,NULL,NULL),

  -- CONTROLE DE TEMPERATURA
  ('controle-temperatura','temp-camara-congelados','Temperatura Câmara de Congelados','Faixa segura: -25°C a -18°C.',1,false,true,true,'number',NULL,'{"min_value":-25,"max_value":-18}'::jsonb),
  ('controle-temperatura','temp-camara-resfriados','Temperatura Câmara de Resfriados','Faixa segura: 0°C a 5°C.',2,false,true,true,'number',NULL,'{"min_value":0,"max_value":5}'::jsonb),
  ('controle-temperatura','temp-geladeira-bebidas','Temperatura Geladeira de Bebidas','Faixa: 0°C a 7°C.',3,false,false,false,'number',NULL,'{"min_value":0,"max_value":7}'::jsonb),
  ('controle-temperatura','temp-balcao-quente','Temperatura Balcão Quente / Buffet','Manter acima de 60°C (RDC 216).',4,false,true,false,'number',NULL,'{"min_value":60,"max_value":90}'::jsonb),
  ('controle-temperatura','registrar-anomalias','Registrar Anomalias e Ações Corretivas','Descreva qualquer leitura fora da faixa e a ação tomada.',5,false,false,true,NULL,NULL,NULL),
  ('controle-temperatura','conferir-organizacao-camara','Conferir Organização (PVPS/FIFO) da Câmara',NULL,6,true,false,false,NULL,NULL,NULL),

  -- LIMPEZA GERAL DE FECHAMENTO
  ('limpeza-geral-fechamento','varrer-pisos','Varrer Todos os Pisos',NULL,1,false,false,false,NULL,NULL,NULL),
  ('limpeza-geral-fechamento','passar-pano-desinfetante','Passar Pano com Desinfetante',NULL,2,true,false,false,NULL,NULL,NULL),
  ('limpeza-geral-fechamento','limpar-banheiros','Limpar e Higienizar Banheiros',NULL,3,true,true,false,NULL,NULL,NULL),
  ('limpeza-geral-fechamento','repor-papel-sabonete','Repor Papel e Sabonete nos Banheiros',NULL,4,false,false,false,NULL,NULL,NULL),
  ('limpeza-geral-fechamento','limpar-superficies-contato','Limpar Superfícies de Contato (maçanetas, interruptores)',NULL,5,false,false,false,NULL,NULL,NULL),
  ('limpeza-geral-fechamento','recolher-lixo-trocar-sacos','Recolher Lixo e Trocar Sacos',NULL,6,false,false,false,NULL,NULL,NULL),
  ('limpeza-geral-fechamento','limpar-area-externa','Limpar Área Externa/Calçada',NULL,7,false,false,false,NULL,NULL,NULL),
  ('limpeza-geral-fechamento','conferir-checklist-final','Conferência Final da Limpeza',NULL,8,true,false,false,NULL,NULL,NULL)
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
