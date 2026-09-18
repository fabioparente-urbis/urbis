-- ============================================================
-- Slots 1 e 2 — prompts P2_EXTRACAO — pedido direto do Fábio (18/09/2026):
-- "o numero do despacho da cheadv e do uso do solo ta vindo sem o ano... é
-- importante vir o numer com o ano, exatamente como ta no documento, rever
-- os prompts... o certo é 1492/2025 e nao apenas 1492"
--
-- JÁ APLICADO EM PRODUÇÃO via script avulso — este arquivo é o registro,
-- mesmo padrão de supabase/correcoes/2026_09_18_*.sql. Idempotente por
-- position(): rodar de novo não estraga nada (só não acha o trecho velho).
--
-- Achado: os dois prompts (Regularização id=13 v22, Aceite id=14 v35)
-- instruíam o modelo a devolver "despacho" como APENAS o número do ato,
-- sem o ano ("ex: 1374"), com exemplo mostrando "DESPACHO Nº 1374/2024"
-- mas pedindo só "1374". Corrigido nos dois: agora pede o número COM o
-- ano, exatamente como está escrito no documento (ex: "1374/2024").
--
-- Conferido antes de mudar: `despacho` (o número do ato) não é usado em
-- nenhum gerador de documento pra concatenar ano separadamente — o valor
-- sai como o modelo devolver, então não há risco de duplicar o ano em
-- nenhum documento oficial.
--
-- Slot 1 tocado com autorização explícita desta mensagem do Fábio (ele
-- descreveu o bug em geral, "rever os prompts", plural — os dois prompts
-- tinham exatamente o mesmo defeito, texto quase idêntico).
-- ============================================================
DO $$
DECLARE c text; n int := 0;
BEGIN
  SELECT conteudo INTO c FROM lip_prompts WHERE id = 13 AND chave = 'P2_EXTRACAO';
  IF position('   - "despacho": APENAS o número do ato (ex: "1374", "603"). NUNCA texto descritivo.' in c) > 0 THEN
    c := replace(c,
      '   - "despacho": APENAS o número do ato (ex: "1374", "603"). NUNCA texto descritivo.',
      '   - "despacho": o número do ato COM O ANO, exatamente como está no documento (ex: "1374/2024", "603/2023"). NUNCA só o número sem o ano. NUNCA texto descritivo.');
    n := n + 1;
  END IF;
  IF position('   O número do ato aparece no título: "DESPACHO Nº 1374/2024" ou "Ato nº 603".' in c) > 0 THEN
    c := replace(c,
      '   O número do ato aparece no título: "DESPACHO Nº 1374/2024" ou "Ato nº 603".',
      '   O número do ato aparece no título: "DESPACHO Nº 1374/2024" ou "Ato nº 603/2023" — inclua a barra e o ano, exatamente como estão escritos no documento.');
    n := n + 1;
  END IF;
  IF position('    "despacho": { "valor": "...", "fonte": "Número do ato CHEADV (ex: 1374)" },' in c) > 0 THEN
    c := replace(c,
      '    "despacho": { "valor": "...", "fonte": "Número do ato CHEADV (ex: 1374)" },',
      '    "despacho": { "valor": "...", "fonte": "Número do ato CHEADV, com ano (ex: 1374/2024)" },');
    n := n + 1;
  END IF;
  IF n > 0 THEN UPDATE lip_prompts SET conteudo = c, atualizado_em = now() WHERE id = 13; END IF;
  RAISE NOTICE 'Regularização (id=13): % trecho(s) corrigido(s).', n;
END $$;

DO $$
DECLARE c text; n int := 0;
BEGIN
  SELECT conteudo INTO c FROM lip_prompts WHERE id = 14 AND chave = 'P2_EXTRACAO';
  IF position('   - "despacho" (DESPACHO CHEADV): é APENAS o NÚMERO DO ATO administrativo. Exemplos válidos: "1374", "603", "1021". NUNCA coloque texto corrido, descrição ou conteúdo do despacho neste campo.' in c) > 0 THEN
    c := replace(c,
      '   - "despacho" (DESPACHO CHEADV): é APENAS o NÚMERO DO ATO administrativo. Exemplos válidos: "1374", "603", "1021". NUNCA coloque texto corrido, descrição ou conteúdo do despacho neste campo.',
      '   - "despacho" (DESPACHO CHEADV): é o NÚMERO DO ATO administrativo COM O ANO, exatamente como está no documento. Exemplos válidos: "1374/2024", "603/2023", "1021/2024". NUNCA só o número sem o ano. NUNCA coloque texto corrido, descrição ou conteúdo do despacho neste campo.');
    n := n + 1;
  END IF;
  IF position('   O número do ato aparece no título ou cabeçalho do documento CHEADV (ex: "DESPACHO Nº 1374/2024" ou "Ato nº 603").' in c) > 0 THEN
    c := replace(c,
      '   O número do ato aparece no título ou cabeçalho do documento CHEADV (ex: "DESPACHO Nº 1374/2024" ou "Ato nº 603").',
      '   O número do ato aparece no título ou cabeçalho do documento CHEADV (ex: "DESPACHO Nº 1374/2024" ou "Ato nº 603/2023") — inclua a barra e o ano, exatamente como estão escritos no documento.');
    n := n + 1;
  END IF;
  IF position('    "despacho": { "valor": "...", "fonte": "Número do ato CHEADV (ex: 1374)" },' in c) > 0 THEN
    c := replace(c,
      '    "despacho": { "valor": "...", "fonte": "Número do ato CHEADV (ex: 1374)" },',
      '    "despacho": { "valor": "...", "fonte": "Número do ato CHEADV, com ano (ex: 1374/2024)" },');
    n := n + 1;
  END IF;
  IF n > 0 THEN UPDATE lip_prompts SET conteudo = c, atualizado_em = now() WHERE id = 14; END IF;
  RAISE NOTICE 'Aceite (id=14): % trecho(s) corrigido(s).', n;
END $$;
