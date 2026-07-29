/**
 * lib/visao/index.ts — executa a visão localizada e devolve resultado no formato do LIP.
 *
 * ── ORDEM DAS DEFESAS ───────────────────────────────────────────────────────────
 *   interruptor → chave → documento → CACHE POR CONTEÚDO → orçamento → recorte → modelo → validação
 *
 * O cache vem ANTES do orçamento de propósito: reaproveitar não custa nada, então não deve ser
 * bloqueado por teto. Bloquear leitura gratuita seria punir quem relê a mesma pasta.
 *
 * ── NADA AQUI PODE DERRUBAR A LEITURA DA PASTA ──────────────────────────────────
 * Toda falha vira `pulos[]` e o campo cai para o estado que `fecharResultados` já daria. Um número
 * de vaga que não foi lido é um campo pendente; uma leitura derrubada é o trabalho do analista
 * perdido. Esta função NUNCA lança.
 */

import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import type { ResultadoCampo } from "@/lib/lerPastaSlot5";
import { RECEITAS, hashReceita, hashRegiao } from "./receitas";
import { recortar, contarPaginas } from "./rasterizar";
import { localizar } from "./localizar";
import { interpretarResposta } from "./interpretar";
import { abstevesseTudo, type Interpretacao, type LeituraCampo, type MotivoPulo, type Receita } from "./tipos";

export type EntradaVisao = { hash: string; papeis: string[]; buffer: Uint8Array };

export type ResumoVisao = {
  campos: Record<string, ResultadoCampo>;
  /** para gravar em mhd_resultados_campo junto com o resultado */
  meta: Record<string, { confianca: number | null; custoIA: number; interpretacaoId?: string }>;
  pulos: { receita: string; motivo: MotivoPulo; detalhe: string }[];
  chamadas: number;
  reaproveitadas: number;
  custoTotal: number;
  msTotal: number;
};

/**
 * Preço por token do Gemini 2.5 Flash, em dólares. CONFERIR na tabela oficial antes de usar este
 * número para qualquer coisa que não seja ordem de grandeza — preço de modelo muda, e um valor
 * desatualizado aqui vira relatório de custo errado.
 */
const USD_POR_TOKEN_ENTRADA = 0.30 / 1_000_000;
const USD_POR_TOKEN_SAIDA = 2.50 / 1_000_000;

/** Tetos. Baixos de propósito: o endpoint de leitura é chamável à vontade pelo analista. */
const TETO_POR_PROCESSO = 40;   // chamadas de visão por processo, por hora
const TETO_POR_USUARIO = 120;   // idem, por usuário

/**
 * O interruptor OPERACIONAL. Só desliga — nunca altera regra.
 *
 * Existe porque regra em código exige deploy, e há um caso em que deploy é lento demais: o provedor
 * muda o comportamento do modelo e a leitura passa a errar em produção. Desligar faz o campo cair
 * para NAO_IMPLEMENTADO, que é estado previsto e testado; mudar a regra sem revisão, não.
 */
async function visaoLigada(): Promise<boolean> {
  const { data, error } = await supabase
    .from("urbis_config").select("visao_ligada").eq("id", 1).maybeSingle();
  if (error) return true;                       // coluna ainda não existe: comportamento normal
  return (data as any)?.visao_ligada !== false;  // só `false` explícito desliga
}

async function dentroDoOrcamento(processoCodigo: string, usuarioId: string | null) {
  const desde = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: doProcesso } = await supabase
    .from("mhd_resultados_campo")
    .select("*", { count: "exact", head: true })
    .eq("processo_codigo", processoCodigo).gte("criado_em", desde).not("interpretacao_id", "is", null);
  if ((doProcesso ?? 0) >= TETO_POR_PROCESSO) {
    return { ok: false, detalhe: `teto de ${TETO_POR_PROCESSO} interpretações/hora neste processo` };
  }
  if (usuarioId) {
    const { count: doUsuario } = await supabase
      .from("mhd_resultados_campo")
      .select("*", { count: "exact", head: true })
      .eq("autor_manual_id", usuarioId).gte("criado_em", desde);
    if ((doUsuario ?? 0) >= TETO_POR_USUARIO) {
      return { ok: false, detalhe: `teto de ${TETO_POR_USUARIO} interpretações/hora para este usuário` };
    }
  }
  return { ok: true, detalhe: "" };
}

/**
 * Interpretação já feita para este conteúdo+receita+modelo, em QUALQUER processo.
 *
 * A região NÃO entra na busca porque ela é RESULTADO da localização, não entrada: descobri-la
 * custaria a varredura que o cache existe para evitar. A pergunta certa é "o que já concluímos
 * sobre este documento com esta receita?" — a região fica guardada como parte da resposta.
 */
async function doCache(hashDoc: string, r: Receita): Promise<Interpretacao | null> {
  const { data, error } = await supabase
    .from("mhd_interpretacoes_visao").select("*")
    .eq("hash_documento", hashDoc).eq("receita_hash", hashReceita(r)).eq("modelo", r.modelo)
    .order("criado_em", { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return null;
  const d = data as any;
  return {
    // `valores` guarda o mapa porCampo inteiro — inclusive quais campos falharam e por quê,
    // para que o reaproveitamento reproduza a abstenção individual, não só os acertos
    porCampo: (d.valores ?? {}) as Record<string, LeituraCampo>,
    bruto: d.bruto ?? "", custoIA: 0, msRecorte: 0, msModelo: 0,
    reaproveitada: true, interpretacaoId: d.id,
  };
}

/**
 * Sobrecarga do provedor NÃO é falha de leitura — é fila.
 *
 * Medido em 29/07/2026: o Gemini devolveu 503 "experiencing high demand" numa execução real, e sem
 * retentativa isso derrubava a visão inteira de uma pasta. A rota `s3` já tratava esse caso desde
 * antes; aqui faltava. Só se retenta o que é transitório: 503, 429 e 5xx. Resposta 400 (prompt ou
 * imagem inválidos) é erro nosso e não melhora tentando de novo.
 */
const TENTATIVAS = 3;
const transitorio = (status: number, corpo: string) =>
  status === 503 || status === 429 || status >= 500
  || /overloaded|high demand|unavailable/i.test(corpo);

async function chamarModelo(png: Uint8Array, r: Receita): Promise<{ texto: string; custo: number; ms: number }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY não configurada");
  const t0 = performance.now();
  const corpo = JSON.stringify({
    contents: [{
      role: "user",
      parts: [
        { inline_data: { mime_type: "image/png", data: Buffer.from(png).toString("base64") } },
        { text: r.prompt },
      ],
    }],
    // temperatura zero: não se quer criatividade lendo número de vaga de estacionamento
    generationConfig: { temperature: 0, maxOutputTokens: 512, responseMimeType: "application/json" },
  });

  let ultimoErro = "";
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${r.modelo}:generateContent?key=${apiKey}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: corpo },
    );
    if (res.ok) {
      const data = await res.json();
      const texto = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
      const u = data.usageMetadata ?? {};
      const custo = (u.promptTokenCount ?? 0) * USD_POR_TOKEN_ENTRADA
        + (u.candidatesTokenCount ?? 0) * USD_POR_TOKEN_SAIDA;
      return { texto, custo, ms: performance.now() - t0 };
    }
    const texto = (await res.text()).slice(0, 300);
    ultimoErro = `modelo respondeu ${res.status}: ${texto}`;
    if (!transitorio(res.status, texto) || tentativa === TENTATIVAS) break;
    await new Promise((r) => setTimeout(r, tentativa * 1500)); // 1,5s, depois 3s
  }
  throw new Error(ultimoErro);
}

export async function executarVisao(args: {
  entradas: EntradaVisao[];
  processoCodigo: string;
  usuarioId?: string | null;
  jaResolvidos: Record<string, ResultadoCampo>;
}): Promise<ResumoVisao> {
  const t0 = performance.now();
  const out: ResumoVisao = {
    campos: {}, meta: {}, pulos: [], chamadas: 0, reaproveitadas: 0, custoTotal: 0, msTotal: 0,
  };
  const pular = (r: Receita, motivo: MotivoPulo, detalhe: string) =>
    out.pulos.push({ receita: r.id, motivo, detalhe });

  try {
    const ligada = await visaoLigada();

    for (const receita of RECEITAS) {
      // campo já resolvido por outro caminho não vale uma chamada paga
      if (receita.chaves.every((c) => out.campos[c] || args.jaResolvidos[c]?.valor)) continue;

      if (!ligada) { pular(receita, "DESLIGADA", "visão desligada em urbis_config"); continue; }
      if (!process.env.GEMINI_API_KEY) { pular(receita, "SEM_CHAVE", "GEMINI_API_KEY ausente"); continue; }

      const doc = args.entradas.find((e) => e.papeis.includes(receita.papel));
      if (!doc) { pular(receita, "DOCUMENTO_AUSENTE", `nenhum documento com papel "${receita.papel}"`); continue; }

      let interpretacao: Interpretacao | null = null;
      try {
        interpretacao = await doCache(doc.hash, receita);

        if (!interpretacao) {
          const orcamento = await dentroDoOrcamento(args.processoCodigo, args.usuarioId ?? null);
          if (!orcamento.ok) { pular(receita, "ORCAMENTO", orcamento.detalhe); continue; }

          /* LOCALIZAR antes de recortar: a receita diz O QUE procurar, nunca ONDE. Varre as
           * páginas do documento — podem ser 1 ou 10 — e só então recorta em alta resolução. */
          const paginas = await contarPaginas(doc.buffer);
          const achado = await localizar(doc.buffer, paginas, receita,
            (png, prompt) => chamarModelo(png, { ...receita, prompt }));
          out.chamadas += achado?.chamadas ?? paginas;
          out.custoTotal += achado?.custo ?? 0;
          if (!achado) {
            pular(receita, "FALHA", `"${receita.localizacao.alvo.slice(0, 60)}…" não encontrado em nenhuma das ${paginas} página(s)`);
            for (const chave of receita.chaves) {
              out.campos[chave] = {
                resultado: "NAO_ENCONTRADO", fonte: `visão localizada — ${receita.id}`,
                tentativa: {
                  documento: receita.papel, hash: doc.hash,
                  procurou: [`varredura visual em ${paginas} página(s): ${receita.localizacao.alvo}`],
                  motivo: "o quadro não foi localizado em nenhuma página do documento",
                },
              };
            }
            continue;
          }

          const recorte = await recortar(doc.buffer, achado.regiao);
          const { texto, custo, ms } = await chamarModelo(recorte.png, receita);
          const porCampo = interpretarResposta(texto, receita);

          interpretacao = {
            porCampo, bruto: texto, custoIA: custo + achado.custo,
            msRecorte: recorte.ms, msModelo: ms, reaproveitada: false,
          };
          out.chamadas++;
          out.custoTotal += custo;

          // grava para reuso ANTES de decidir os campos: a interpretação é do CONTEÚDO, não do
          // processo — o mesmo recorte do mesmo PDF vale em qualquer processo que traga o arquivo
          const confiancas = Object.values(porCampo)
            .filter((c): c is Extract<LeituraCampo, { ok: true }> => c.ok)
            .map((c) => c.confianca).filter((c): c is number => c != null);
          const { data: gravada, error: erroGravar } = await supabase.from("mhd_interpretacoes_visao").insert({
            hash_documento: doc.hash, pagina: achado.regiao.pagina,
            regiao: { ...recorte.pontos, dpi: recorte.dpiEfetivo, px: [recorte.larguraPx, recorte.alturaPx] },
            regiao_hash: hashRegiao(achado.regiao), receita_versao: receita.versao,
            receita_hash: hashReceita(receita), modelo: receita.modelo,
            abstencao: abstevesseTudo(interpretacao),
            valores: porCampo,
            // confiança do recorte = a MENOR entre os campos lidos: um quadro vale o seu elo mais fraco
            confianca: confiancas.length ? Math.min(...confiancas) : null,
            bruto: texto.slice(0, 4000), custo_ia: custo,
            ms_recorte: Math.round(recorte.ms), ms_modelo: Math.round(ms),
          }).select("id").single();
          // falha ao gravar não invalida a leitura: só significa que a próxima não reaproveita
          if (erroGravar) out.pulos.push({ receita: receita.id, motivo: "FALHA", detalhe: `cache não gravado: ${erroGravar.message}` });
          interpretacao.interpretacaoId = (gravada as any)?.id;
        } else {
          out.reaproveitadas++;
        }
      } catch (e: any) {
        pular(receita, "FALHA", e?.message ?? String(e));
        continue;
      }

      /* Um resultado POR CAMPO, saindo de UMA interpretação compartilhada.
       * Parte do quadro pode ter sido lida e parte não — abstenção é individual. */
      for (const chave of receita.chaves) {
        const leitura = interpretacao.porCampo[chave];
        if (!leitura) continue;

        if (!leitura.ok) {
          out.campos[chave] = {
            resultado: "FONTE_ILEGIVEL",
            fonte: `visão localizada — ${receita.id}`,
            tentativa: {
              documento: receita.papel, hash: doc.hash,
              procurou: [`recorte ${receita.id} (${receita.estrategia})`],
              temCamadaTexto: false,
              motivoIlegivel: "CONTEUDO_NAO_INTERPRETAVEL",
              motivo: leitura.motivo,
            },
          };
          continue;
        }

        out.campos[chave] = {
          // INFERIDO, jamais ENCONTRADO: não foi lido, foi deduzido — ver tipos.ts da matriz
          resultado: "INFERIDO",
          valor: leitura.valor,
          fonte: `visão localizada (${receita.modelo}) — ${receita.id} v${receita.versao}`,
          evidencia: `recorte localizado por varredura visual — ${receita.id} v${receita.versao}`
            + (leitura.confianca != null ? ` · confiança ${leitura.confianca}` : "")
            + (interpretacao.reaproveitada ? " · reaproveitado do conteúdo já interpretado" : ""),
        };
        out.meta[chave] = {
          confianca: leitura.confianca,
          // o custo é do RECORTE, não do campo: atribuí-lo inteiro a cada um dos três triplicaria
          // o total. Fica no primeiro e zero nos demais.
          custoIA: out.meta[receita.chaves[0]] ? 0 : interpretacao.custoIA,
          interpretacaoId: interpretacao.interpretacaoId,
        };
      }
    }
  } catch (e: any) {
    // rede caiu, banco fora, o que for: a leitura da pasta segue sem visão
    out.pulos.push({ receita: "(todas)", motivo: "FALHA", detalhe: e?.message ?? String(e) });
  }

  out.msTotal = performance.now() - t0;
  return out;
}
