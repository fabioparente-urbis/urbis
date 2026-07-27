-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-07-27 · Campos PRIMITIVOS no LIP do slot 5 (Aprovação de Projeto)
--
-- POR QUÊ: o LIP guardava o VEREDITO ("a área na ART confere com o projeto?") e
-- não guardava o FATO que produz o veredito (qual área a ART declara). Sem o
-- fato, o "confere?" não é calculável — só perguntável, e o sistema nunca sai de
-- "sem dado". Estes 11 campos são esses fatos.
--
-- Origem da lista: OBS COD do slot 5, entrada "o LIP guarda o veredito e não
-- guarda o fato que produz o veredito".
--
-- Cinco deles a leitura da pasta já preenche sozinha, da camada de texto
-- (lib/lerPastaSlot5.ts): áreas das ARTs, volume da ART de caixa, área permeável
-- projetada e os alertas do Uso do Solo. Os outros ficam vazios por decisão de
-- projeto — campo vazio é honesto, campo chutado contamina a conferência que
-- depende dele.
--
-- Já aplicado em produção via REST em 27/07/2026. Este arquivo existe para o
-- histórico e para reproduzir o estado em outro ambiente. É idempotente.
-- Backup do estado anterior (125 campos): backups/backup_lip_slot5_campos_2026-07-27.json
-- ─────────────────────────────────────────────────────────────────────────────

insert into lip_campos (aba_id, chave, label, tipo, placeholder, valor_padrao, ordem, ativo)
select v.aba_id::uuid, v.chave, v.label, 'texto', v.placeholder, '',
       coalesce((select max(c.ordem) + 1 from lip_campos c where c.aba_id = v.aba_id::uuid), 0),
       true
from (values
  ('9aa4aae6-7556-4e20-a69c-47e3e8ec1e6b','dimensoesDoLoteNaCertidao','DIMENSÕES DO LOTE NA CERTIDÃO','Frente x fundo, conforme a matrícula'),
  ('9aa4aae6-7556-4e20-a69c-47e3e8ec1e6b','dimensoesDoLoteNoProjeto','DIMENSÕES DO LOTE NO PROJETO','Frente x fundo, conforme a planta de situação'),
  ('e8933b1d-92ad-4459-b5d8-f6c2bbc850d1','alertasDoUsoDoSolo','ALERTAS EMITIDOS NO USO DO SOLO','Ex.: proximidade de aeroporto, corredor viário'),
  ('33646542-fe3c-42e8-9c31-1c00df7d49d2','areaNaArtDeProjeto','ÁREA DECLARADA NA ART DE PROJETO (m²)','Quadro de atividade técnica'),
  ('33646542-fe3c-42e8-9c31-1c00df7d49d2','areaNaArtDeExecucao','ÁREA DECLARADA NA ART DE EXECUÇÃO (m²)','Quadro de atividade técnica'),
  ('33646542-fe3c-42e8-9c31-1c00df7d49d2','volumeNaArtDeCaixa','VOLUME DECLARADO NA ART DE CAIXA (m³)','Quadro de atividade técnica'),
  ('6962f2a2-f117-48d0-8dd4-2af2fd07db94','alturaDaEdificacao','ALTURA DA EDIFICAÇÃO — TÉRREO À LAJE DE COBERTURA (m)','Ver nos cortes'),
  ('6962f2a2-f117-48d0-8dd4-2af2fd07db94','acessoVertical','MEIOS DE ACESSO VERTICAL PREVISTOS','Escada, rampa, elevador'),
  ('805ba78a-f478-4740-aad3-3a286a599e6b','areaPermeavelProjetada','ÁREA PERMEÁVEL PROJETADA (m²)','Carimbo / quadro de áreas'),
  ('71477ce3-5f77-447d-943f-f552a370cc92','areaImpermeabilizada','ÁREA IMPERMEABILIZADA DO TERRENO (m²)','Base do cálculo do ICCAP'),
  ('71477ce3-5f77-447d-943f-f552a370cc92','volumeExigidoDaCaixa','VOLUME EXIGIDO DA CAIXA — ICCAP (m³)','Carimbo: EXIGIDO (IN 007/2024)')
) as v(aba_id, chave, label, placeholder)
where not exists (
  select 1 from lip_campos c where c.chave = v.chave and c.aba_id = v.aba_id::uuid
);

-- ─────────────────────────────────────────────────────────────────────────────
-- REVERSÃO. Antes de rodar, confira se algum processo já usou os campos:
--
--   select campo_chave, count(*) from lip_valores
--   where campo_chave in ('dimensoesDoLoteNaCertidao','dimensoesDoLoteNoProjeto',
--     'alertasDoUsoDoSolo','areaNaArtDeProjeto','areaNaArtDeExecucao',
--     'volumeNaArtDeCaixa','alturaDaEdificacao','acessoVertical',
--     'areaPermeavelProjetada','areaImpermeabilizada','volumeExigidoDaCaixa')
--   group by campo_chave;
--
--   delete from lip_campos
--   where chave in ('dimensoesDoLoteNaCertidao','dimensoesDoLoteNoProjeto',
--     'alertasDoUsoDoSolo','areaNaArtDeProjeto','areaNaArtDeExecucao',
--     'volumeNaArtDeCaixa','alturaDaEdificacao','acessoVertical',
--     'areaPermeavelProjetada','areaImpermeabilizada','volumeExigidoDaCaixa')
--   and aba_id in (select id from lip_abas
--                  where assunto_id = '78e2f7bb-7d9e-4b66-a6b8-1fd8418361f3');
--
-- Depois, o slot 5 volta a ter 125 campos.
-- ─────────────────────────────────────────────────────────────────────────────
