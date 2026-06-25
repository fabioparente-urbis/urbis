import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { autenticar, verificarOwnership } from "@/lib/auth";

/**
 * Retorna as chaves do objeto `dados` cujos campos estão marcados como
 * "CONFERIR" (origem padrão + valor vazio) ou têm valor literal "X".
 * Essas chaves disparam pré-marcação dos itens do MAC como naoConforme.
 */
function chavesVaziasOuX(dados: any): string[] {
  if (!dados || typeof dados !== "object") return [];
  const out: string[] = [];
  for (const chave of Object.keys(dados)) {
    const c = dados[chave];
    if (!c || typeof c !== "object") continue;
    const valor = String(c.valor ?? "").trim();
    const origem = c.origem;
    const ehConferir = origem === "padrao" && valor === "";
    const ehX = valor.toUpperCase() === "X";
    if (ehConferir || ehX) out.push(chave);
  }
  return out;
}

/**
 * Normaliza tipo_processo para os valores canônicos do banco.
 * Aceita formas vindas do front ("Regularização" / "Aceite" / "Aprovação")
 * e formas em caixa-alta ("REGULARIZACAO" / "ACEITE" / "APROVACAO").
 */
function normalizarTipo(tipo: unknown): "ACEITE" | "REGULARIZACAO" | "APROVACAO" {
  const t = String(tipo ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim();
  if (t === "ACEITE") return "ACEITE";
  if (t === "APROVACAO") return "APROVACAO";
  return "REGULARIZACAO";
}

export async function POST(req: NextRequest) {
  try {
    const auth = await autenticar(req);
    if (auth instanceof NextResponse) return auth;
    const usuarioId = auth.userId;

    const body = await req.json();
    const { id, dados, camposAlterados } = body;
    const tipoProcesso = normalizarTipo(body.tipo);

    if (!id) {
      return NextResponse.json({ ok: false, erro: "ID obrigatorio" }, { status: 400 });
    }

    // Busca processo EXATAMENTE do par (codigo, tipo). Sem o tipo, REG e
    // ACEITE do mesmo SEI colidem.
    const { data: existente, error: erroBusca } = await supabase
      .from("processos")
      .select("id, codigo, analista_id, tipo_processo, assunto_id")
      .eq("codigo", id)
      .eq("tipo_processo", tipoProcesso)
      .limit(1).then(r => ({ data: r.data?.[0] ?? null, error: r.error }));

    if (erroBusca) {
      return NextResponse.json({ ok: false, erro: erroBusca.message }, { status: 500 });
    }

    // Sessão 4: resolve assunto_id a partir do tipo_processo (slug uppercase).
    // O `tipoProcesso` aqui é "REGULARIZACAO" | "ACEITE" | "APROVACAO"; o
    // slug em `assuntos` é minúsculo, então comparamos lowercase. Para
    // assuntos novos (slot_02..slot_15), o front já envia o slug uppercase
    // como `tipo`, então o lookup continua valendo.
    const slugMap: Record<string, string> = {
      "REGULARIZACAO": "regularizacao",
      "ACEITE": "aceite_sei",
      "APROVACAO": "aprovacao_pp",
    };
    const slugAlvo = slugMap[tipoProcesso] ?? tipoProcesso.toLowerCase();
    const { data: assuntoRow } = await supabase
      .from("assuntos")
      .select("id")
      .eq("slug", slugAlvo)
      .maybeSingle();
    const assuntoIdResolvido: string | null = assuntoRow?.id ?? null;

    let processoId: string | null = null;
    let acao = "inserido";

    if (existente?.id) {
      // UPDATE: so o analista dono (ou perfil irrestrito) pode salvar
      const ownerErr = verificarOwnership(auth, existente.analista_id);
      if (ownerErr) return ownerErr;

      processoId = existente.id;
      acao = "atualizado";
      const update: any = {
        codigo: id,
        status: "CADASTRADO",
        tipo_processo: tipoProcesso,
        edicao_autorizada: true,
        atualizado_em: new Date().toISOString(),
      };
      // Só sobrescreve `dados` quando o cliente envia (a Home cria o
      // processo só com tipo + id; o LIP envia depois com `dados`).
      if (dados !== undefined) update.dados = dados;
      // Sessão 4: backfill de assunto_id. Não rebatiza processos que já
      // têm um assunto (proteção contra trocar assunto no meio do
      // caminho); apenas preenche quando ainda está NULL e o lookup
      // resolveu.
      if (!existente.assunto_id && assuntoIdResolvido) {
        update.assunto_id = assuntoIdResolvido;
      }

      const { error } = await supabase
        .from("processos")
        .update(update)
        .eq("id", existente.id);

      if (error) {
        return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
      }
    } else {
      // INSERT: atribui o criador como analista responsavel.
      // Sem isso, o processo recem-criado nasceria com analista_id=null
      // e sumiria da lista do proprio criador (que e Analista, nao irrestrito).
      const { data, error } = await supabase
        .from("processos")
        .insert([{
          codigo: id,
          dados: dados ?? {},
          status: "CADASTRADO",
          tipo_processo: tipoProcesso,
          edicao_autorizada: true,
          analista_id: usuarioId,
          // Sessão 4: grava o vínculo com o assunto. Pode ser NULL se o
          // slug não bater com nenhum registro em `assuntos` (não deveria
          // acontecer, mas não bloqueia o insert).
          assunto_id: assuntoIdResolvido,
        }])
        .select();

      if (error) {
        return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
      }
      processoId = data?.[0]?.id ?? null;
    }

    if (processoId && camposAlterados && camposAlterados.length > 0) {
      await supabase
        .from("processo_historico")
        .insert([{
          processo_id: processoId,
          usuario_id: usuarioId,
          acao: acao === "inserido" ? "Processo criado" : "Auto-save",
          detalhe: { campos: camposAlterados },
        }]);
    }

    // Propaga campos CONFERIR/X do LIP para a análise MAC ativa
    // (status != 'deferido' && status != 'indeferido') como itens
    // 'nao_conforme'. NÃO cria análise se não existir e NÃO sobrescreve
    // marcações manuais do analista — apenas itens nulos ou
    // 'nao_respondido' são alterados.
    //
    // O equivalente conceitual do "UPSERT em analise_itens com
    // ON CONFLICT (analise_id, checklist_item_id) DO UPDATE SET
    // status = 'nao_conforme'" é implementado sobre o jsonb
    // `analises_mac.itens` (mapa item_id → status), já que essa é a
    // estrutura efetiva no banco. Filtra por tipo_processo via
    // modelo_id da análise + colunas explícitas.
    try {
      const chavesProblema = dados ? chavesVaziasOuX(dados) : [];
      if (chavesProblema.length > 0) {
        // 3. Buscar a análise MAC ativa (não deferida e não indeferida).
        const { data: ultima } = await supabase
          .from("analises_mac")
          .select("id, itens, modelo_id, status")
          .eq("processo_codigo", id)
          .eq("tipo_processo", tipoProcesso)
          .order("numero_analise", { ascending: false })
          .limit(1)
          .maybeSingle();

        const ativa =
          ultima?.id &&
          ultima.modelo_id &&
          ultima.status !== "deferido" &&
          ultima.status !== "indeferido";

        if (ativa) {
          // 2. Itens do MAC cuja `chave_lip` cai na lista de campos
          //    vazios/X, restritos ao modelo da análise ativa
          //    (que, por sua vez, está vinculado ao tipo_processo).
          const { data: itensMap } = await supabase
            .from("mac_checklist_itens")
            .select("id, chave_lip")
            .eq("modelo_id", ultima!.modelo_id)
            .eq("ativo", true)
            .in("chave_lip", chavesProblema);

          if (itensMap && itensMap.length > 0) {
            const itensAtuais: Record<string, string | null> =
              (ultima!.itens as any) || {};
            let alterou = false;
            for (const it of itensMap) {
              if (!it?.id) continue;
              const atual = itensAtuais[it.id];
              // 4. UPSERT lógico: só pré-marca se status atual for
              //    null/undefined, vazio ou 'nao_respondido'. Marcações
              //    manuais ('conforme', 'nao_conforme', 'nao_aplica')
              //    NÃO são sobrescritas.
              const livreParaPreMarcar =
                atual === null ||
                atual === undefined ||
                atual === "" ||
                atual === "nao_respondido";
              if (livreParaPreMarcar) {
                itensAtuais[it.id] = "nao_conforme";
                alterou = true;
              }
            }
            if (alterou) {
              await supabase
                .from("analises_mac")
                .update({
                  itens: itensAtuais,
                  atualizado_em: new Date().toISOString(),
                })
                .eq("id", ultima!.id);
            }
          }
        }
      }
    } catch {
      // Falha silenciosa: coluna chave_lip/tipo_processo pode não existir ainda.
    }

    return NextResponse.json({ ok: true, acao, tipo: tipoProcesso });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message || "Erro interno" }, { status: 500 });
  }
}
