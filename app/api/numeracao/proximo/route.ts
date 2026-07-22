import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUsuarioId(req: NextRequest): Promise<string | null> {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const token = cookieHeader.match(/urbis_token=([^;]+)/)?.[1];
  const userId = cookieHeader.match(/urbis_id=([^;]+)/)?.[1];
  if (!token || !userId) return null;
  return userId;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tipo = searchParams.get("tipo") as "despacho" | "parecer" | null;
  const processo = searchParams.get("processo") ?? "";
  const modo = searchParams.get("modo") ?? "commit";
  const numeroForcado = parseInt(searchParams.get("numero") ?? "", 10);
  // Vínculo com a análise que está consumindo o número. Ausentes em
  // documentos que não nascem de uma análise (ex: Despacho Interno).
  const analiseId = searchParams.get("analise_id") || null;
  const analiseNumero = parseInt(searchParams.get("analise_numero") ?? "", 10);

  if (!tipo || !["despacho", "parecer"].includes(tipo))
    return NextResponse.json({ ok: false, motivo: "TIPO_INVALIDO" }, { status: 400 });

  const usuarioId = await getUsuarioId(req);
  if (!usuarioId) return NextResponse.json({ ok: false, motivo: "NAO_AUTENTICADO" }, { status: 401 });

  const ano = new Date().getFullYear();

  const { data: faixas, error } = await supabase
    .from("urbis_numeracao_faixas")
    .select("*")
    .eq("usuario_id", usuarioId)
    .eq("tipo", tipo)
    .eq("ano", ano)
    .order("criado_em", { ascending: true });

  if (error) return NextResponse.json({ ok: false, motivo: "ERRO_BD" }, { status: 500 });

  if (!faixas || faixas.length === 0)
    return NextResponse.json({
      ok: false,
      motivo: tipo === "despacho" ? "SOLICITAR_NUMERO_DESPACHO" : "SOLICITAR_NUMERO_PARECER",
    });

  const faixaDisponivel = faixas.find(f => f.proximo <= f.numero_final);

  if (!faixaDisponivel)
    return NextResponse.json({
      ok: false,
      motivo: tipo === "despacho" ? "SOLICITAR_NUMERO_DESPACHO" : "SOLICITAR_NUMERO_PARECER",
      esgotado: true,
    });

  const numeroForcadoValido = Number.isFinite(numeroForcado) &&
    numeroForcado >= faixaDisponivel.proximo &&
    numeroForcado <= faixaDisponivel.numero_final;
  const numero = (modo === "commit" && numeroForcadoValido)
    ? numeroForcado
    : faixaDisponivel.proximo;
  if (modo === "commit") {
    // Compare-and-swap: só avança o contador se `proximo` ainda for o valor
    // que lemos. Em concorrência (dois cliques/abas), a 2ª tentativa casa 0
    // linhas — devolvemos 409 em vez de deixar o contador dessincronizar.
    const { data: atualizadas, error: erroUpdate } = await supabase
      .from("urbis_numeracao_faixas")
      .update({ proximo: Math.max(faixaDisponivel.proximo, numero + 1) })
      .eq("id", faixaDisponivel.id)
      .eq("proximo", faixaDisponivel.proximo)
      .select("id");

    if (erroUpdate)
      return NextResponse.json({ ok: false, motivo: "ERRO_BD" }, { status: 500 });
    if (!atualizadas || atualizadas.length === 0)
      return NextResponse.json(
        { ok: false, motivo: "NUMERO_EM_USO", detalhe: "O contador mudou durante a gravação. Recarregue e tente novamente." },
        { status: 409 },
      );

    const { error: erroUso } = await supabase.from("urbis_numeracao_uso").insert({
      faixa_id: faixaDisponivel.id,
      usuario_id: usuarioId,
      numero,
      processo_codigo: processo,
      tipo_documento: tipo,
      ...(Number.isInteger(analiseNumero) ? { numero_analise: analiseNumero } : {}),
    });
    // Contador já avançou; se o log de uso falhar, registramos mas não
    // reprovamos (o número foi legitimamente consumido).
    if (erroUso)
      console.error("[numeracao] falha ao gravar urbis_numeracao_uso:", erroUso.message);

    // Prende o número à própria análise. Segundo registro, independente da
    // tag em processos.tags — se a tag falhar ou for apagada, o vínculo
    // sobrevive aqui e em urbis_numeracao_uso.
    //
    // Despacho e parecer são séries independentes: a mesma análise pode
    // emitir os dois, então cada um tem sua coluna. Gravar ambos na mesma
    // faria o segundo documento apagar o número do primeiro.
    if (analiseId) {
      const coluna = tipo === "parecer" ? "numero_parecer" : "numero_despacho";
      const { error: erroAnalise } = await supabase
        .from("analises_mac")
        .update({ [coluna]: String(numero) })
        .eq("id", analiseId);
      if (erroAnalise)
        console.error("[numeracao] falha ao vincular número à análise:", erroAnalise.message);
    }
  }

  const restantes = faixas.reduce((acc, f) => {
    if (f.id === faixaDisponivel.id) return acc + Math.max(0, f.numero_final - numero);
    if (f.proximo <= f.numero_final) return acc + (f.numero_final - f.proximo + 1);
    return acc;
  }, 0);

  return NextResponse.json({ ok: true, numero, restantes });
}
