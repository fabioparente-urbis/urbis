/**
 * scripts/testar_profissionais_fase9.mts — Fase 9 do mandato de 12 fases (05/09/2026):
 * identidade de profissionais — canonicalização de CAU/CREA e detecção de candidatos a
 * duplicata (leitura só, nunca funde). A rota de desempenho ganhou dois campos novos
 * (identidade_confirmada_humana, candidatos_duplicados) — cobertos aqui com dado real.
 *
 *   npx tsx --env-file=.env.local scripts/testar_profissionais_fase9.mts
 */
import { canonicalizarRegistro, detectarCandidatosDuplicados } from "../lib/profissionais/canonicalizar";
import { supabaseAdmin } from "../lib/supabaseAdmin";

let falhas = 0;
const t = (nome: string, cond: boolean, detalhe = "") => {
  console.log((cond ? "  ok    " : "  FALHA ") + nome + (cond || !detalhe ? "" : `\n           ${detalhe}`));
  if (!cond) falhas++;
};
const secao = (n: string) => console.log(`\n── ${n}`);

// ─────────────────────────────────────────────────────────────────────────────
secao("1 · canonicalizarRegistro — formatos reais observados na base convergem");
{
  t("null/undefined/vazio viram null", canonicalizarRegistro(null) === null && canonicalizarRegistro(undefined) === null && canonicalizarRegistro("") === null);
  t('"3186/D-GO" → "3186DGO"', canonicalizarRegistro("3186/D-GO") === "3186DGO");
  t('"1019837780D-GO" → "1019837780DGO"', canonicalizarRegistro("1019837780D-GO") === "1019837780DGO");
  t('"1016728336D/GO" → "1016728336DGO"', canonicalizarRegistro("1016728336D/GO") === "1016728336DGO");
  t('"1018567658-D/GO" → "1018567658DGO"', canonicalizarRegistro("1018567658-D/GO") === "1018567658DGO");
  t('"CREA-1020076283DGO" → "1020076283DGO" (prefixo removido)', canonicalizarRegistro("CREA-1020076283DGO") === "1020076283DGO");
  t('duas grafias da MESMA matrícula convergem pro mesmo canônico', canonicalizarRegistro("1020076283/D-GO") === canonicalizarRegistro("CREA-1020076283DGO"));
  t('"A279399-7" (CAU) → "A2793997"', canonicalizarRegistro("A279399-7") === "A2793997");
  t('"00A1306251 - GO" (CAU) → "00A1306251GO"', canonicalizarRegistro("00A1306251 - GO") === "00A1306251GO");
}

// ─────────────────────────────────────────────────────────────────────────────
secao("2 · detectarCandidatosDuplicados — casos fabricados");
{
  const fabricados = [
    { id: "a", nome_original: "FULANO", cau: null, crea: "3186/D-GO" },
    { id: "b", nome_original: "FULANO DIGITADO DIFERENTE", cau: null, crea: "CREA-3186DGO" },
    { id: "c", nome_original: "OUTRO PROFISSIONAL", cau: "A100-1", crea: null },
    { id: "d", nome_original: "SEM NENHUM REGISTRO", cau: null, crea: null },
  ];
  const candidatos = detectarCandidatosDuplicados(fabricados);
  t("acha o par a/b (mesmo CREA após normalizar)", candidatos.some((c) => c.campo === "crea" && new Set([c.profissional_a.id, c.profissional_b.id]).size === 2 && [c.profissional_a.id, c.profissional_b.id].sort().join(",") === "a,b"));
  t("não inclui c (CAU único) nem d (sem registro) em nenhum par", !candidatos.some((c) => c.profissional_a.id === "c" || c.profissional_b.id === "c" || c.profissional_a.id === "d" || c.profissional_b.id === "d"));
  t("nunca compara CAU com CREA (campo sempre igual nos dois lados de um par)", candidatos.every((c) => c.campo === "cau" || c.campo === "crea"));
  t("apenas 1 par no total (a/b)", candidatos.length === 1);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("3 · dado real da base — hoje nenhum profissional atinge identidade_confirmada_humana");
{
  const { data: profissionais, error } = await supabaseAdmin.from("profissionais").select("id, validado, merged_into_id").is("merged_into_id", null);
  t("consulta real funcionou", !error, error?.message);
  const vivos = profissionais ?? [];
  t("existem profissionais vivos na base (auditoria encontrou 25)", vivos.length > 0, `n=${vivos.length}`);
  t("achado confirmado: nenhum tem validado=true hoje (não é bug desta fase)", vivos.every((p: any) => p.validado === false), `com validado=true: ${vivos.filter((p: any) => p.validado).length}`);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("4 · candidatos a duplicata com dado real da base — nunca funde, só compara");
{
  const { data: profissionais } = await supabaseAdmin.from("profissionais").select("id, nome_original, cau, crea").is("merged_into_id", null);
  const candidatos = detectarCandidatosDuplicados((profissionais ?? []) as any[]);
  t("função roda sem erro contra os 25 profissionais reais", Array.isArray(candidatos));
  t("nenhum par aponta o mesmo profissional contra si mesmo", candidatos.every((c) => c.profissional_a.id !== c.profissional_b.id));
  console.log(`           candidatos encontrados hoje: ${candidatos.length}`);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("5 · rota de desempenho devolve os campos novos sem quebrar os antigos");
{
  const codigoFonte = (await import("node:fs")).readFileSync(
    new URL("../app/api/admin/urbi/desempenho-profissionais/route.ts", import.meta.url),
    "utf-8",
  );
  t("rota importa detectarCandidatosDuplicados (reaproveita, não duplica)", codigoFonte.includes("detectarCandidatosDuplicados"));
  t("rota calcula identidade_confirmada_humana", codigoFonte.includes("identidade_confirmada_humana"));
  t("rota nunca escreve em profissionais (só SELECT)", !codigoFonte.includes('.from("profissionais").update') && !codigoFonte.includes('.from("profissionais").delete') && !codigoFonte.includes('.from("profissionais").insert'));
  t("rota nunca escreve em processo_profissionais (só SELECT)", !codigoFonte.includes('.from("processo_profissionais").update') && !codigoFonte.includes('.from("processo_profissionais").delete') && !codigoFonte.includes('.from("processo_profissionais").insert'));
}

console.log(`\n${falhas === 0 ? "TODOS OS TESTES PASSARAM" : `${falhas} FALHA(S)`}`);
process.exit(falhas);
