/**
 * Verificação do interpretador de comandos do URBI.
 *
 *   npx tsx scripts/testar_navegacao_urbi.mts
 *
 * É puro: não toca no banco, não chama rede, não usa chave nenhuma. Roda
 * offline e em segundos — pode rodar antes de qualquer commit que mexa em
 * lib/urbi/navegacao.ts.
 */
import { interpretar, aplicarFiltrosLocais, filtrosParaQuery, queryParaFiltros } from "../lib/urbi/navegacao";

let ok = 0;
let falhou = 0;

function conferir(rotulo: string, real: unknown, esperado: unknown) {
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a === b) { ok++; return; }
  falhou++;
  console.error(`✕ ${rotulo}\n    esperado: ${b}\n    veio:     ${a}`);
}

function cmd(texto: string) {
  const c = interpretar(texto);
  if (!c) return null;
  const { resposta, ...resto } = c as any;
  return resto;
}

// ---------------------------------------------------------------- navegação
conferir("home", cmd("ir para home"), { tipo: "navegar", rota: "/" });
conferir("pilha", cmd("abrir a pilha"), { tipo: "navegar", rota: "/processos" });
conferir("bdi", cmd("abrir o bdi"), { tipo: "navegar", rota: "/admin/bdi" });
conferir("bip", cmd("abrir o bip"), { tipo: "navegar", rota: "/admin/bdi/leis" });
conferir("mrp", cmd("minha produtividade"), { tipo: "navegar", rota: "/mrp" });
conferir("mrp equipe antes de mrp", cmd("mrp da equipe"), { tipo: "navegar", rota: "/admin/mrp" });
conferir("mdp", cmd("abrir o mdp"), { tipo: "navegar", rota: "/mdp" });
conferir("voltar", cmd("voltar"), { tipo: "voltar" });

// ------------------------------------------------------------------ filtros
conferir("indeferidos", cmd("mostrar os indeferidos"), { tipo: "filtrar", filtros: { tag: "indeferimento" } });
conferir("laudos", cmd("processos com laudo"), { tipo: "filtrar", filtros: { tag: "laudo" } });
conferir("despacho interno ganha de despacho", cmd("filtrar despacho interno"), { tipo: "filtrar", filtros: { tag: "despacho_interno" } });
conferir("analise 2", cmd("processos na analise 2"), { tipo: "filtrar", filtros: { analise: 2 } });
conferir("analise por extenso", cmd("segunda analise"), { tipo: "filtrar", filtros: { analise: 2 } });
conferir("analise 5 (aceita, hoje vazia)", cmd("analise 5"), { tipo: "filtrar", filtros: { analise: 5 } });
conferir("tipo + pilha", cmd("pilha de regularizacao"), { tipo: "filtrar", filtros: { tipo: "regularizacao" } });
conferir("slot 5", cmd("processos de aprovacao de projeto"), { tipo: "filtrar", filtros: { tipo: "slot_05" } });
conferir("combinado", cmd("regularizacao indeferido na analise 1"),
  { tipo: "filtrar", filtros: { tipo: "regularizacao", tag: "indeferimento", analise: 1 } });

// --------------------------------------------------------------- ordenação
conferir("maior area", cmd("ordenar por maior area"), { tipo: "filtrar", filtros: { ordenar: "area_desc" } });
conferir("menor area", cmd("menor area"), { tipo: "filtrar", filtros: { ordenar: "area_asc" } });
conferir("mais novo", cmd("mais novos primeiro"), { tipo: "filtrar", filtros: { ordenar: "data_desc" } });
conferir("mais antigo", cmd("mais antigo"), { tipo: "filtrar", filtros: { ordenar: "data_asc" } });

// -------------------------------------------------------------------- busca
conferir("numero sei", cmd("localizar o processo 24.5.000016462-6"), { tipo: "buscar", termo: "24.5.000016462-6" });
conferir("nome completo", cmd("procurar jardel cesar de oliveira"), { tipo: "buscar", termo: "jardel cesar de oliveira" });
conferir("primeiro nome", cmd("achar o processo do marizete"), { tipo: "buscar", termo: "marizete" });
conferir("nome com de no meio preservado", cmd("buscar maria de souza"), { tipo: "buscar", termo: "maria de souza" });
conferir("limpar filtros", cmd("limpar filtros"), { tipo: "limpar_filtros" });
conferir("abrir primeiro", cmd("abrir o primeiro"), { tipo: "abrir_resultado", indice: 0 });
conferir("abrir resultado 3", cmd("abrir resultado 3"), { tipo: "abrir_resultado", indice: 2 });

// ------------------------------------------------- o que NÃO pode virar comando
for (const perigoso of [
  "apagar o processo 24.5.000016462-6",
  "excluir todos os processos",
  "atribuir o processo para o marcos",
  "assinar o despacho",
  "mudar o status para deferido",
  "criar processo novo",
]) {
  const c = interpretar(perigoso);
  const destrutivo = c && !["navegar", "voltar", "buscar", "filtrar", "limpar_filtros", "abrir_resultado"].includes(c.tipo);
  conferir(`sem comando destrutivo: "${perigoso}"`, destrutivo ?? false, false);
}
// "apagar processo <numero>" cai em busca (leitura), nunca em exclusão — o
// interpretador não tem verbo de escrita nenhum para casar.
conferir("apagar vira leitura, não exclusão", cmd("apagar o processo 24.5.000016462-6")?.tipo, "buscar");

// --------------------------------------------------------- filtros locais
const amostra = [
  { codigo: "A", area_construida: 100, criado_em: "2026-01-01", tags: [{ tipo: "despacho", numero_analise: 1 }] },
  { codigo: "B", area_construida: 900, criado_em: "2026-06-01", tags: [{ tipo: "indeferimento", numero_analise: 2 }] },
  { codigo: "C", area_construida: null, criado_em: "2026-03-01", tags: [{ tipo: "laudo", numero_analise: 1 }] },
  { codigo: "D", area_construida: 50, criado_em: "2026-02-01", tags: ["TEXTO_SOLTO"] },
];
const cod = (l: any[]) => l.map(x => x.codigo);

conferir("filtro por tag", cod(aplicarFiltrosLocais(amostra, { tag: "indeferimento" })), ["B"]);
conferir("filtro por analise", cod(aplicarFiltrosLocais(amostra, { analise: 1 })), ["A", "C"]);
conferir("tag + analise juntos na MESMA tag", cod(aplicarFiltrosLocais(amostra, { tag: "laudo", analise: 1 })), ["C"]);
conferir("tag string não quebra nem casa", cod(aplicarFiltrosLocais(amostra, { tag: "despacho" })), ["A"]);
conferir("ordem maior area (sem area vai pro fim)", cod(aplicarFiltrosLocais(amostra, { ordenar: "area_desc" })), ["B", "A", "D", "C"]);
conferir("ordem menor area (sem area vai pro fim)", cod(aplicarFiltrosLocais(amostra, { ordenar: "area_asc" })), ["D", "A", "B", "C"]);
conferir("ordem mais novo", cod(aplicarFiltrosLocais(amostra, { ordenar: "data_desc" })), ["B", "C", "D", "A"]);
conferir("ordem mais antigo", cod(aplicarFiltrosLocais(amostra, { ordenar: "data_asc" })), ["A", "D", "C", "B"]);

// ------------------------------------------------------------ ida e volta
const f = { busca: "maria", tipo: "regularizacao", tag: "laudo", analise: 3, ordenar: "area_desc" as const };
conferir("query ida e volta", queryParaFiltros(new URLSearchParams(filtrosParaQuery(f).slice(1))), f);
conferir("query ignora valor inventado", queryParaFiltros(new URLSearchParams("tag=xpto&analise=9&ordenar=aleatorio")), {});

console.log(`\n${ok} passaram, ${falhou} falharam.`);
process.exit(falhou > 0 ? 1 : 0);
