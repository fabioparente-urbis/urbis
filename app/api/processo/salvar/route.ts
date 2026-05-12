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

export async function POST(req: NextRequest) {
  try {
    const auth = await autenticar(req);
    if (auth instanceof NextResponse) return auth;
    const usuarioId = auth.userId;

    const body = await req.json();
    const { id, dados, camposAlterados } = body;

    if (!id) {
      return NextResponse.json({ ok: false, erro: "ID obrigatorio" }, { status: 400 });
    }

    const { data: existente, error: erroBusca } = await supabase
      .from("processos")
      .select("id, codigo, analista_id")
      .eq("codigo", id)
      .limit(1).then(r => ({ data: r.data?.[0] ?? null, error: r.error }));

    if (erroBusca) {
      return NextResponse.json({ ok: false, erro: erroBusca.message }, { status: 500 });
    }

    let processoId: string | null = null;
    let acao = "inserido";

    if (existente?.id) {
      // UPDATE: so o analista dono (ou perfil irrestrito) pode salvar
      const ownerErr = verificarOwnership(auth, existente.analista_id);
      if (ownerErr) return ownerErr;

      processoId = existente.id;
      acao = "atualizado";
      const { error } = await supabase
        .from("processos")
        .update({
          codigo: id,
          dados: dados,
          status: "CADASTRADO",
          tipo_processo: "REGULARIZACAO",
          edicao_autorizada: true,
          atualizado_em: new Date().toISOString(),
        })
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
          dados: dados,
          status: "CADASTRADO",
          tipo_processo: "REGULARIZACAO",
          edicao_autorizada: true,
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

    // Propaga campos CONFERIR/X do LIP para a última análise do MAC
    // como itens nao_conforme. Não sobrescreve marcações existentes.
    // Requer coluna `chave_lip` em mac_checklist_itens (ver migration).
    try {
      const chavesProblema = chavesVaziasOuX(dados);
      if (chavesProblema.length > 0) {
        const { data: ultima } = await supabase
          .from("analises_mac")
          .select("id, itens, modelo_id, status")
          .eq("processo_codigo", id)
          .order("numero_analise", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (ultima?.id && ultima.modelo_id && ultima.status !== "deferido" && ultima.status !== "indeferido") {
          const { data: itensMap } = await supabase
            .from("mac_checklist_itens")
            .select("id, chave_lip")
            .eq("modelo_id", ultima.modelo_id)
            .eq("ativo", true)
            .in("chave_lip", chavesProblema);

          if (itensMap && itensMap.length > 0) {
            const itensAtuais: Record<string, string | null> = (ultima.itens as any) || {};
            let alterou = false;
            for (const it of itensMap) {
              if (!it?.id) continue;
              // Só pré-marca se ainda não foi avaliado pelo analista.
              if (!itensAtuais[it.id]) {
                itensAtuais[it.id] = "nao_conforme";
                alterou = true;
              }
            }
            if (alterou) {
              await supabase
                .from("analises_mac")
                .update({ itens: itensAtuais, atualizado_em: new Date().toISOString() })
                .eq("id", ultima.id);
            }
          }
        }
      }
    } catch {
      // Falha silenciosa: coluna chave_lip pode não existir ainda.
    }

    return NextResponse.json({ ok: true, acao });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message || "Erro interno" }, { status: 500 });
  }
}
