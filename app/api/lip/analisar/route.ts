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

ÁREAS (só o número em m², ex: "148,77"):
- areaTotal: buscar "ÁREA TOTAL DA CONSTRUÇÃO" ou "ÁREA A SER REGULARIZADA" (total)
- areaForaFrontal: buscar "ÁREA A SER REGULARIZADA COM OCUPAÇÃO NORMAL"
- areaRecuo: buscar "ÁREA A SER REGULARIZADA QUE OCUPA RECUO FRONTAL"
- areaTerreno: buscar "ÁREA DO LOTE" ou "ÁREA DO TERRENO ORIGINAL" (só o número)
- areaImpermeavel: buscar "ÁREA IMPERMEÁVEL" (só o número em m²)
- areaAprovada: área existente já aprovada anteriormente, se houver

CORREDOR E CAIXA:
- corredor: "Sim" se mencionar corredor viário, "Não" se "NÃO POSSUI CORREDOR"
- caixa: "Sim" se mencionar caixa de infiltração/recarga no carimbo, "Não" se não houver
- volMin: volume mínimo da caixa em m³ (só número)
- volAt: volume atendido em m³ (só número)
- caixas: número de caixas (só número)

EDIFICAÇÃO:
- pav: número de pavimentos como NÚMERO (térreo = "1", dois pavimentos = "2")
- unid: número de unidades (só número)
- existente: "Sim" ou "Não" — se há área existente aprovada

USO DO SOLO (buscar no documento "Parecer" ou "Informação de Uso do Solo - COMTEC"):
- tipoUso: tipo de uso — buscar "TIPO DE USO" no Uso do Solo (ex: "APROVAÇÃO DE PROJETO")
- usoDefinido: "Sim" se uso definido, "Não" se "SEM USO DEFINIDO"
- numeroUso: número SEI do Uso do Solo — número de 7 dígitos entre parênteses após "Parecer" ou "Uso do Solo"
- cnae1 a cnae5: descrição do CNAE (ex: "68.10-2-01 - Compra e venda de imóveis próprios"), ou "NP"

DOCUMENTOS SEI — retornar APENAS o número de 7 dígitos entre parênteses:
- certidao: número SEI da "Certidão" no índice
- levantamento: número SEI do "Projeto" no índice
- artLev: número SEI da "ART" ou "RRT" de levantamento no índice
- artCx: número SEI da ART/RRT da Caixa, ou "NP"
- laudo: número SEI do "Laudo Técnico" no índice
- vistoria: número SEI da "Vistoria Simples" no índice
- foto: número SEI da "Fotografia" no índice
- usoSolo: número SEI do documento de Uso do Solo no índice

PROCESSO E SEIs ESPECÍFICOS:
- despacho: número SEI do "Despacho" da CHEADV
- seiCheadv: número SEI da "Análise Documental" ou "CHEADV" no índice
- seiProcuracao: número SEI da "Procuração" no índice, ou "NP"
- seiEmbargo: número SEI do "Embargo" no índice, ou "NP"
- outro: "Sim" se há outro processo vinculado, "Não" se não
- qualOutro: número do outro processo ou "NP"
- embargo: "Sim" ou "Não"
- dataEmb: data do embargo ou "NP"
- tombado: "Sim" se área tombada, "Não" se não
- procuracao: "Sim" se há procuração, "Não" se não, "NP" se não aplicável
- onerosa: "Sim" ou "Não"

RESPONDA APENAS JSON VÁLIDO SEM MARKDOWN:
{
  "proprietario":            {"valor": null, "fonte": null},
  "logradouro":              {"valor": null, "fonte": null},
  "quadra":                  {"valor": null, "fonte": null},
  "lote":                    {"valor": null, "fonte": null},
  "bairro":                  {"valor": null, "fonte": null},
  "iptu":                    {"valor": null, "fonte": null},
  "areaTotal":               {"valor": null, "fonte": null},
  "areaForaFrontal":         {"valor": null, "fonte": null},
  "areaRecuo":               {"valor": null, "fonte": null},
  "areaTerreno":             {"valor": null, "fonte": null},
  "areaImpermeavel":         {"valor": null, "fonte": null},
  "areaAprovada":            {"valor": null, "fonte": null},
  "tipoUso":                 {"valor": null, "fonte": null},
  "usoDefinido":             {"valor": null, "fonte": null},
  "numeroUso":               {"valor": null, "fonte": null},
  "corredor":                {"valor": null, "fonte": null},
  "faixa":                   {"valor": null, "fonte": null},
  "cnae1":                   {"valor": null, "fonte": null},
  "cnae2":                   {"valor": null, "fonte": null},
  "cnae3":                   {"valor": null, "fonte": null},
  "cnae4":                   {"valor": null, "fonte": null},
  "cnae5":                   {"valor": null, "fonte": null},
  "caixa":                   {"valor": null, "fonte": null},
  "volMin":                  {"valor": null, "fonte": null},
  "volAt":                   {"valor": null, "fonte": null},
  "caixas":                  {"valor": null, "fonte": null},
  "pav":                     {"valor": null, "fonte": null},
  "unid":                    {"valor": null, "fonte": null},
  "existente":               {"valor": null, "fonte": null},
  "despacho":                {"valor": null, "fonte": null},
  "seiCheadv":               {"valor": null, "fonte": null},
  "seiProcuracao":           {"valor": null, "fonte": null},
  "seiEmbargo":              {"valor": null, "fonte": null},
  "outro":                   {"valor": null, "fonte": null},
  "qualOutro":               {"valor": null, "fonte": null},
  "embargo":                 {"valor": null, "fonte": null},
  "dataEmb":                 {"valor": null, "fonte": null},
  "tombado":                 {"valor": null, "fonte": null},
  "procuracao":              {"valor": null, "fonte": null},
  "onerosa":                 {"valor": null, "fonte": null},
  "certidao":                {"valor": null, "fonte": null},
  "levantamento":            {"valor": null, "fonte": null},
  "artLev":                  {"valor": null, "fonte": null},
  "artCx":                   {"valor": null, "fonte": null},
  "laudo":                   {"valor": null, "fonte": null},
  "vistoria":                {"valor": null, "fonte": null},
  "usoSolo":                 {"valor": null, "fonte": null},
  "foto":                    {"valor": null, "fonte": null}
}

TRECHO (janela ${numero}/${total}):
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
        max_tokens: 1500,
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
    const formData = await req.formData();
    const arquivo = formData.get("pdf") as File | null;
    if (!arquivo) return NextResponse.json({ ok: false, erro: "Nenhum arquivo enviado" }, { status: 400 });

    const buffer = new Uint8Array(await arquivo.arrayBuffer());
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

    const preenchidos = Object.keys(campos).filter(k => campos[k]?.valor && campos[k]?.valor !== "NP").length;
    console.log(`[LIP] Concluído. ${preenchidos} campos preenchidos.`);

    return NextResponse.json({ ok: true, campos, paginas, janelas: janelas.length });

  } catch (e: any) {
    console.error("[LIP] Erro:", e?.message);
    return NextResponse.json({ ok: false, erro: e?.message || "Erro interno" }, { status: 500 });
  }
}