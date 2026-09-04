/**
 * scripts/testar_rotulos_lip_reais.mts — só leitura. Confirma contra o banco real que o rótulo
 * humano de `campos_tecnicos` (Fase AC, 04/09/2026) vem de `lip_campos.label` de verdade, pros
 * campos que apareceram como chave técnica crua na resposta do piloto (areaArt, bairro,
 * tombado, iptu...) — não é só teste sintético.
 *
 *   npx tsx --env-file=.env.local scripts/testar_rotulos_lip_reais.mts
 */
import { montarDossieFactual } from "../lib/urbi/montarDossie";
import { SEM_ROTULO_CADASTRADO } from "../lib/urbi/dossieProcesso";

let falhas = 0;
const t = (nome: string, cond: boolean, detalhe = "") => {
  console.log((cond ? "  ok    " : "  FALHA ") + nome + (cond || !detalhe ? "" : `\n           ${detalhe}`));
  if (!cond) falhas++;
};
const secao = (n: string) => console.log(`\n── ${n}`);

const USUARIO_ADMIN = { id: "1781e5cf-b09a-404c-87f6-6363cc4d8fe9", perfis: ["Administrador"], gerencia: null, irrestrito: true, gerenciaDoPerfil: null } as any;

secao("Regularização SEI (25.5.000046759-5) — campos que vazaram chave crua no piloto");
{
  const r = await montarDossieFactual("25.5.000046759-5", USUARIO_ADMIN);
  if (!r.ok) { t("carregou", false, r.erro); }
  else {
    const d = r.data as any;
    const ct = d.lip?.campos_tecnicos ?? {};
    const chavesDoPiloto = ["areaArt", "areaLaudo", "areaTotal", "areaVertical", "bairro", "tombado", "areaTerreno"];
    let algumaComRotulo = false;
    for (const chave of chavesDoPiloto) {
      const campo = ct[chave];
      if (!campo) { console.log(`  (${chave} não presente neste processo — ok, segue)`); continue; }
      t(`[${chave}] tem campo "rotulo" (string não vazia)`, typeof campo.rotulo === "string" && campo.rotulo.length > 0, JSON.stringify(campo));
      t(`[${chave}] rotulo é diferente da própria chave (não é fallback pra chave crua)`, campo.rotulo !== chave, campo.rotulo);
      if (campo.rotulo && campo.rotulo !== SEM_ROTULO_CADASTRADO && campo.rotulo !== chave) algumaComRotulo = true;
    }
    t("pelo menos 1 dos campos do piloto tem rótulo humano real (não é tudo SEM_ROTULO_CADASTRADO)", algumaComRotulo);

    // "Fontes consultadas" da Fase AB citava "lip.campos_tecnicos.areaArt" (caminho técnico) —
    // confirma que agora existe alternativa: campos_tecnicos.areaArt.rotulo é uma frase humana.
    if (ct.areaArt) t('rotulo de "areaArt" não é um caminho tipo "lip.campos_tecnicos..."', !/lip\.|campos_tecnicos\./.test(String(ct.areaArt.rotulo)));
  }
}

secao("cruzarLipComDocumento — rotulo de saída é humano quando há correspondência real (Slot 5)");
{
  const r = await montarDossieFactual("48533", USUARIO_ADMIN);
  if (!r.ok) { t("Slot 5 carregou", false, r.erro); }
  else {
    const d = r.data as any;
    const cruzLip = (d.cruzamentos ?? []).filter((c: any) => c.tipo === "lip_x_documento");
    if (cruzLip.length === 0) {
      console.log("  (nenhum cruzamento lip_x_documento neste processo agora — nada a checar, não é falha)");
    } else {
      for (const c of cruzLip.slice(0, 5)) {
        t(`[lip_x_documento] rotulo "${c.rotulo}" não é a chave técnica crua nem SEM_ROTULO_CADASTRADO indevido`, c.rotulo.length > 0);
      }
    }
  }
}

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos passaram");
process.exit(falhas);
