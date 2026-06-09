import { NextRequest, NextResponse } from "next/server";
import { lerPdf } from "@/lib/lerPdf";

export const maxDuration = 60;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const JANELA = 11000;
const OVERLAP = 500;
const MAX_JANELAS = 8;

function dividirEmJanelas(texto: string): string[] {
  const janelas: string[] = [];
  let pos = 0;
  while (pos < texto.length && janelas.length < MAX_JANELAS) {
    janelas.push(texto.slice(pos, pos + JANELA));
    pos += JANELA - OVERLAP;
  }
  return janelas;
}

function montarPrompt(janela: string, numero: number, total: number): string {
  return `Você é analista de regularização de obras da Prefeitura de Goiânia.
Esta é a janela ${numero} de ${total} do texto de um processo SEI.
Extraia APENAS os campos que conseguir identificar com segurança. Para campos não encontrados retorne null.

REGRAS GERAIS:
- Proprietário = dono do imóvel, NUNCA o responsável técnico/arquiteto/engenheiro
- Para cada campo informe valor e fonte
- Confirme cada valor em pelo menos outro documento do processo
- Divergências entre documentos: registre em observacoes

IDENTIFICAÇÃO (fonte: página do processo físico — "ALVARÁ DE REGULARIZAÇÃO" ou "PROTOCOLO"):
- proprietario: nome do proprietário/requerente
- logradouro: endereço completo
- quadra: número da quadra
- lote: número(s) do(s) lote(s)
- bairro: nome do bairro/setor
- iptu: inscrição cadastral (múltiplos: separar por " / ")
- processoFisico: número do processo físico — buscar no cabeçalho do protocolo ou no DUAM (campo "INSCRICAO CADASTRAL 008.XXXXXXXXX" → extrair os dígitos após "008.")
- processo: número do Processo SEI (NUP) — aparece no rodapé de todo documento, padrão "... SEI <numero> / pg. N"

RESPONSÁVEIS TÉCNICOS (fonte: carimbo do projeto — última planta):
- nome_responsavel_eng: nome completo do engenheiro responsável
- crea: número CREA (ex: "1016728336/D-GO")
- nome_responsavel_arq: nome completo do arquiteto — "NP" se não houver
- cau: número CAU (ex: "A12345-6") — "NP" se não houver

ÁREAS (só o número em m², ex: "148,77") — fonte: carimbo da planta:
- areaTotal: "ÁREA TOTAL DA CONSTRUÇÃO" ou "ÁREA A SER REGULARIZADA" (total)
- areaForaFrontal: "ÁREA A SER REGULARIZADA COM OCUPAÇÃO NORMAL"
- areaRecuo: "ÁREA A SER REGULARIZADA QUE OCUPA RECUO FRONTAL"
- areaTerreno: "ÁREA DO LOTE" ou "ÁREA DO TERRENO" (só o número)
- areaImpermeavel: "ÁREA IMPERMEÁVEL" (só o número em m²)
- areaAprovada: área existente já aprovada anteriormente, se houver
- areaVertical: "ÁREA A SER REGULARIZADA EM EDIFICAÇÃO VERTICAL" (só o número em m²) — preencher APENAS se nos cortes do projeto a altura da edificação (do terreno mais baixo até a laje de cobertura) for SUPERIOR a 12m; neste caso areaForaFrontal fica zerado e a área normal passa para este campo com multa específica de verticalização; "NP" se altura ≤ 12m

CORREDOR E CAIXA (fonte: uso do solo + planta memorial de cálculo):
- corredor: "Sim" se mencionar corredor viário, "Não" se não
- faixa: faixa de ampliação do corredor (ex: "5m") — "NP" se corredor = Não
- caixa: "Sim" se houver caixa de infiltração/recarga, "Não" se não
- volMin: volume mínimo da caixa em m³ — "NP" se caixa = Não
- volAt: volume atendido em m³ — "NP" se caixa = Não
- caixas: número de caixas — "NP" se caixa = Não

EDIFICAÇÃO (fonte: carimbo da planta):
- pav: número de pavimentos (térreo = "1", dois pavimentos = "2")
- unid: número de unidades (só número)
- existente: "Sim" ou "Não" — se há área existente aprovada

USO DO SOLO (fonte: documento "Informação de Uso do Solo – COMTEC"):
- tipoUso: tipo de uso (ex: "APROVAÇÃO DE PROJETO")
- usoDefinido: "Sim" se o documento de Uso do Solo contiver a expressão "SEM USO DEFINIDO" ou "ATIVIDADE ECONÔMICA SEM USO DEFINIDO" ou "EMPREENDIMENTO COM USO NÃO DEFINIDO"; "Não" se houver uso definido (CNAE específico listado)
- numeroUso: número SEI do Uso do Solo — 7 dígitos entre parênteses
- vistoriaUnidadeTerritorial: unidade territorial (ex: "ÁREA DE ADENSAMENTO BÁSICO - AAB")
- cnae1 a cnae5: descrição do CNAE ou "NP"

DOCUMENTOS SEI — retornar APENAS o número de 7 dígitos entre parênteses do rodapé:
- certidao: SEI da certidão de matrícula
- levantamento: SEI do projeto/levantamento arquitetônico
- artLev: SEI da ART/RRT de levantamento
- artCx: SEI da ART/RRT da Caixa — "NP" se não houver
- laudo: SEI do Laudo Técnico
- vistoria: SEI da Vistoria Fiscal
- foto: SEI do Registro Fotográfico
- usoSolo: SEI do documento de Uso do Solo

PROCESSO E SEIs ESPECÍFICOS:
- despacho: número do despacho CHEADV (ex: "1090/2025")
- seiCheadv: SEI do documento CHEADV (análise documental)
- seiProcuracao: SEI da procuração — "NP" se não houver
- seiEmbargo: SEI do embargo — "NP" se não houver
- outro: "Sim" se há outro processo vinculado, "Não" se não
- qualOutro: número do outro processo — "NP" se outro = Não
- embargo: "Sim" ou "Não"
- dataEmb: data do embargo — "NP" se não houver
- tombado: "Sim" se área tombada, "Não" se não
- procuracao: "Sim" se há procuração, "Não" se não
- onerosa: "Sim" se área construída ≥ área do lote E altura do terreno mais baixo à cobertura > 7,5m nos cortes; "Não" caso contrário
- numero_do_sei_da_onerosa: SEI (7 dígitos entre parênteses) do documento de cálculo da outorga onerosa — "NP" se onerosa = Não

VISTORIA (fonte: última vistoria fiscal — "Relatório de Visita Técnica" ou "Termo de Vistoria Fiscal"):
- vistoriaAreaComercial: área ocupada pela atividade comercial em m² (só número)
- vistoriaMais12m: "Sim" se altura > 12m, "Não" se não
- vistoriaOcupaRecuo: "Sim" se ocupa recuo frontal, "Não" se não
- vistoriaEstruturaConcluida: "Sim" se estrutura e telhado concluídos, "Não" se não
- vistoriaAltMax21m: "Sim" se altura máxima ≤ 21m, "Não" se não
- vistoriaOcupaPublica: "Sim" se ocupa área pública, "Não" se não
- vistoriaAreaAeroportuaria: "Sim" se em área aeroportuária, "Não" se não
- vistoriaAreaMilitar: "Sim" se em área militar, "Não" se não
- vistoriaAguasPluviais: "Sim" se lança águas pluviais internamente, "Não" se não
- vistoriaEsquadriaDivisa: "Sim" se há abertura de esquadrias na divisa, "Não" se não
- vistoriaCalcadas: "Sim" se respeita calçadas, "Não" se não
- vistoriaLevante: "Sim" se levantamento confere com vistoria, "Não" se não
- vistoriaMultaVerticalizacao: "Sim" se há multa de verticalização, "Não" se não
- vistoriaMultaRecuo: "Sim" se há multa de recuo frontal, "Não" se não
- vistoriaMax7Pav: "Sim" se máximo 7 pavimentos, "Não" se não

OBSERVAÇÕES:
- observacoes: relatório em texto com: 1) STATUS da leitura desta janela 2) INVENTÁRIO dos documentos identificados (tipo | código SEI | páginas) 3) INCOMPATIBILIDADES entre documentos 4) ALERTAS

RESPONDA APENAS JSON VÁLIDO SEM MARKDOWN:
{
  "proprietario":              {"valor": null, "fonte": null},
  "logradouro":                {"valor": null, "fonte": null},
  "quadra":                    {"valor": null, "fonte": null},
  "lote":                      {"valor": null, "fonte": null},
  "bairro":                    {"valor": null, "fonte": null},
  "iptu":                      {"valor": null, "fonte": null},
  "processoFisico":            {"valor": null, "fonte": null},
  "processo":                 {"valor": null, "fonte": null},
  "nome_responsavel_eng":                   {"valor": null, "fonte": null},
  "crea":                   {"valor": null, "fonte": null},
  "nome_responsavel_arq":                   {"valor": null, "fonte": null},
  "cau":                    {"valor": null, "fonte": null},
  "areaTotal":                 {"valor": null, "fonte": null},
  "areaForaFrontal":           {"valor": null, "fonte": null},
  "areaRecuo":                 {"valor": null, "fonte": null},
  "areaTerreno":               {"valor": null, "fonte": null},
  "areaImpermeavel":           {"valor": null, "fonte": null},
  "areaAprovada":              {"valor": null, "fonte": null},
  "areaVertical":             {"valor": null, "fonte": null},
  "tipoUso":                   {"valor": null, "fonte": null},
  "usoDefinido":               {"valor": null, "fonte": null},
  "numeroUso":                 {"valor": null, "fonte": null},
  "vistoriaUnidadeTerritorial":       {"valor": null, "fonte": null},
  "corredor":                  {"valor": null, "fonte": null},
  "faixa":                     {"valor": null, "fonte": null},
  "cnae1":                     {"valor": null, "fonte": null},
  "cnae2":                     {"valor": null, "fonte": null},
  "cnae3":                     {"valor": null, "fonte": null},
  "cnae4":                     {"valor": null, "fonte": null},
  "cnae5":                     {"valor": null, "fonte": null},
  "caixa":                     {"valor": null, "fonte": null},
  "volMin":                    {"valor": null, "fonte": null},
  "volAt":                     {"valor": null, "fonte": null},
  "caixas":                    {"valor": null, "fonte": null},
  "pav":                       {"valor": null, "fonte": null},
  "unid":                      {"valor": null, "fonte": null},
  "existente":                 {"valor": null, "fonte": null},
  "certidao":                  {"valor": null, "fonte": null},
  "levantamento":              {"valor": null, "fonte": null},
  "artLev":                    {"valor": null, "fonte": null},
  "artCx":                     {"valor": null, "fonte": null},
  "laudo":                     {"valor": null, "fonte": null},
  "vistoria":                  {"valor": null, "fonte": null},
  "foto":                      {"valor": null, "fonte": null},
  "usoSolo":                   {"valor": null, "fonte": null},
  "despacho":                  {"valor": null, "fonte": null},
  "seiCheadv":                 {"valor": null, "fonte": null},
  "seiProcuracao":             {"valor": null, "fonte": null},
  "seiEmbargo":                {"valor": null, "fonte": null},
  "outro":                     {"valor": null, "fonte": null},
  "qualOutro":                 {"valor": null, "fonte": null},
  "embargo":                   {"valor": null, "fonte": null},
  "dataEmb":                   {"valor": null, "fonte": null},
  "tombado":                   {"valor": null, "fonte": null},
  "procuracao":                {"valor": null, "fonte": null},
  "onerosa":                   {"valor": null, "fonte": null},
  "numero_do_sei_da_onerosa": {"valor": null, "fonte": null},
  "vistoriaAreaComercial":         {"valor": null, "fonte": null},
  "vistoriaMais12m":                 {"valor": null, "fonte": null},
  "vistoriaOcupaRecuo":         {"valor": null, "fonte": null},
  "vistoriaEstruturaConcluida": {"valor": null, "fonte": null},
  "vistoriaAltMax21m":                 {"valor": null, "fonte": null},
  "vistoriaOcupaPublica":          {"valor": null, "fonte": null},
  "vistoriaAreaAeroportuaria":         {"valor": null, "fonte": null},
  "vistoriaAreaMilitar":               {"valor": null, "fonte": null},
  "vistoriaAguasPluviais": {"valor": null, "fonte": null},
  "vistoriaEsquadriaDivisa":  {"valor": null, "fonte": null},
  "vistoriaCalcadas":  {"valor": null, "fonte": null},
  "vistoriaLevante":     {"valor": null, "fonte": null},
  "vistoriaMultaVerticalizacao":       {"valor": null, "fonte": null},
  "vistoriaMultaRecuo":         {"valor": null, "fonte": null},
  "vistoriaMax7Pav":            {"valor": null, "fonte": null},
  "observacoes":               {"valor": null, "fonte": null}
}

Texto do processo (janela ${numero}/${total}):
${janela}`;
}

async function chamarIA(prompt: string): Promise<Record<string, any>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const json = await response.json();
    const txt = json?.content?.[0]?.text ?? "";
    const match = txt.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try { return JSON.parse(match[0]); } catch { return {}; }
  } catch { return {}; } finally { clearTimeout(timer); }
}

function mesclar(resultados: Record<string, any>[]): Record<string, any> {
  const final: Record<string, any> = {};
  const cnaes: string[] = [];

  for (const resultado of resultados) {
    for (const chave of Object.keys(resultado)) {
      const item = resultado[chave];
      if (!item?.valor || ["null","n/a","","não identificado"].includes(String(item.valor).toLowerCase())) continue;

      if (/^cnae\d$/.test(chave)) {
        const val = String(item.valor).trim();
        if (val !== "NP" && !cnaes.includes(val)) cnaes.push(val);
        continue;
      }

      if (!final[chave]?.valor) final[chave] = item;
    }
  }

  cnaes.slice(0, 5).forEach((val, i) => {
    final[`cnae${i + 1}`] = { valor: val, fonte: "CNPJ/Uso do Solo" };
  });

  return final;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
const { url } = body;
if (!url) return NextResponse.json({ ok: false, erro: "URL não informada" }, { status: 400 });

const pdfRes = await fetch(url);
if (!pdfRes.ok) return NextResponse.json({ ok: false, erro: "Erro ao baixar PDF do R2" }, { status: 500 });

const buffer = new Uint8Array(await pdfRes.arrayBuffer());
const { texto, paginas } = await lerPdf(buffer);

    if (!texto || texto.trim().length < 50) {
      return NextResponse.json({ ok: false, erro: "PDF sem texto extraível." }, { status: 422 });
    }

    console.log(`[LIP] PDF: ${paginas} páginas, ${texto.length} chars`);
    const janelas = dividirEmJanelas(texto);
    console.log(`[LIP] ${janelas.length} janela(s) em paralelo...`);

    const resultados = await Promise.all(
      janelas.map((j, i) => chamarIA(montarPrompt(j, i + 1, janelas.length)))
    );

    const mesclado = mesclar(resultados);

    const camposNP = ["cnae1","cnae2","cnae3","cnae4","cnae5","faixa",
      "volMin","volAt","caixas","qualOutro","dataEmb","artCx","foto",
      "despacho","seiCheadv","seiProcuracao","seiEmbargo","areaAprovada","usoSolo"];

    const campos: Record<string, { valor: string; fonte: string } | null> = {};
    for (const chave of Object.keys(mesclado)) {
      const item = mesclado[chave];
      const val = item?.valor?.toString().trim();
      if (!val || ["null","n/a","não identificado",""].includes(val.toLowerCase())) {
        campos[chave] = camposNP.includes(chave) ? { valor: "NP", fonte: "Não identificado" } : null;
      } else {
        campos[chave] = { valor: val, fonte: item.fonte ? String(item.fonte).trim() : "Processo SEI" };
      }
    }
    for (const c of camposNP) {
      if (!campos[c]) campos[c] = { valor: "NP", fonte: "Não identificado" };
    }

    // Somatório de áreas — validação automática
    const toNum = (k: string) => parseFloat((campos[k]?.valor ?? "0").toString().replace(",", ".")) || 0;
    const total = toNum("areaTotal");
    const somaPartes = toNum("areaForaFrontal") + toNum("areaRecuo") + toNum("areaVertical");
    const diff = Math.abs(total - somaPartes);
    const obsAtual = campos["observacoes"]?.valor ?? "";
    let obsExtra = "";
    if (total > 0) {
      if (diff <= 0.1) {
        obsExtra = `\n\n✅ SOMATÓRIO DE ÁREAS OK: ForaFrontal(${toNum("areaForaFrontal")}) + Recuo(${toNum("areaRecuo")}) + Vertical(${toNum("areaVertical")}) = ${somaPartes.toFixed(2)} = Total(${total})`;
      } else {
        obsExtra = `\n\n⚠️ DIVERGÊNCIA NO SOMATÓRIO DE ÁREAS: ForaFrontal(${toNum("areaForaFrontal")}) + Recuo(${toNum("areaRecuo")}) + Vertical(${toNum("areaVertical")}) = ${somaPartes.toFixed(2)} ≠ Total(${total}). Diferença: ${diff.toFixed(2)}m². Verificar carimbo do projeto.`;
      }
    }
    if (obsExtra) {
      campos["observacoes"] = { valor: (obsAtual + obsExtra).trim(), fonte: "Validação automática" };
    }

    const preenchidos = Object.keys(campos).filter(k => campos[k]?.valor && campos[k]?.valor !== "NP").length;
    console.log(`[LIP] Concluído. ${preenchidos} campos preenchidos.`);

    return NextResponse.json({ ok: true, campos, paginas, janelas: janelas.length });

  } catch (e: any) {
    console.error("[LIP] Erro:", e?.message);
    return NextResponse.json({ ok: false, erro: e?.message || "Erro interno" }, { status: 500 });
  }
}