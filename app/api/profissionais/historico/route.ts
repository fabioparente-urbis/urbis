import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const SENTINELAS = new Set([
  "NP", "N.P.", "N.P", "CAU-NP", "CREA-NP", "N/A", "NA", "-", "--", "",
  "NAO POSSUI", "NÃO POSSUI", "SEM", "SEM RESPONSAVEL", "SEM RESPONSÁVEL",
]);

function normalizarNome(nome: string): string {
  return nome
    .toUpperCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function ehSentinela(valor?: string | null): boolean {
  if (!valor) return true;
  const norm = valor.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  return SENTINELAS.has(norm);
}

const ROTULO_PAPEL: Record<string, string> = {
  autor_arquiteto: "autor do projeto",
  responsavel_engenheiro: "responsável técnico (engenheiro)",
};

/**
 * Rotina padrão de dicas do URBI — histórico factual do responsável
 * técnico, SEM nota nem julgamento. Nunca conclui, nunca sugere
 * indeferimento; apenas relata o que já existe no banco.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const cau = searchParams.get("cau");
    const crea = searchParams.get("crea");
    const nome = searchParams.get("nome");
    const processoAtualCodigo = searchParams.get("processo_atual");

    if (ehSentinela(cau) && ehSentinela(crea) && ehSentinela(nome)) {
      return NextResponse.json({ ok: true, encontrado: false });
    }

    let profissional: any = null;

    if (!ehSentinela(cau)) {
      const { data } = await supabaseAdmin
        .from("profissionais")
        .select("id, nome_original, merged_into_id")
        .eq("cau", cau!.toUpperCase().trim())
        .limit(1).maybeSingle();
      profissional = data;
    }
    if (!profissional && !ehSentinela(crea)) {
      const { data } = await supabaseAdmin
        .from("profissionais")
        .select("id, nome_original, merged_into_id")
        .eq("crea", crea!.toUpperCase().trim())
        .limit(1).maybeSingle();
      profissional = data;
    }
    if (!profissional && !ehSentinela(nome)) {
      const { data } = await supabaseAdmin
        .from("profissionais")
        .select("id, nome_original, merged_into_id")
        .eq("nome_normalizado", normalizarNome(nome!))
        .limit(1).maybeSingle();
      profissional = data;
    }

    if (!profissional) return NextResponse.json({ ok: true, encontrado: false });

    // Soft merge: segue a cadeia até o profissional "vivo".
    let profId = profissional.id;
    let nomeExibicao = profissional.nome_original;
    let voltas = 0;
    while (profissional?.merged_into_id && voltas < 5) {
      const { data: destino } = await supabaseAdmin
        .from("profissionais")
        .select("id, nome_original, merged_into_id")
        .eq("id", profissional.merged_into_id)
        .maybeSingle();
      if (!destino) break;
      profissional = destino;
      profId = destino.id;
      nomeExibicao = destino.nome_original;
      voltas++;
    }

    const { data: vinculos } = await supabaseAdmin
      .from("processo_profissionais")
      .select("processo_id, papel, processos!inner(codigo, tipo_processo)")
      .eq("profissional_id", profId)
      .eq("ativo", true);

    const outros = (vinculos ?? []).filter((v: any) => v.processos?.codigo !== processoAtualCodigo);

    if (outros.length === 0) {
      return NextResponse.json({ ok: true, encontrado: false });
    }

    // Um mesmo processo pode gerar 2 vínculos (ex: arquiteto E engenheiro
    // no mesmo processo) — contar processos distintos, não vínculos.
    const codigos = [...new Set(outros.map((v: any) => v.processos.codigo))];
    const { data: analises } = await supabaseAdmin
      .from("analises_mac")
      .select("processo_codigo, status")
      .in("processo_codigo", codigos);

    const indeferidos = new Set((analises ?? []).filter((a: any) => a.status === "indeferido").map((a: any) => a.processo_codigo)).size;
    const papeis = [...new Set(outros.map((v: any) => ROTULO_PAPEL[v.papel] ?? v.papel))];

    const partes: string[] = [];
    partes.push(`Uai, esse eu já vi. ${nomeExibicao} aparece em ${codigos.length} processo${codigos.length > 1 ? "s" : ""} anterior${codigos.length > 1 ? "es" : ""} como ${papeis.join(" e ")}.`);
    if (indeferidos > 0) {
      partes.push(`${indeferidos} deles foi${indeferidos > 1 ? "ram" : ""} indeferido${indeferidos > 1 ? "s" : ""}.`);
    } else {
      partes.push("Nenhum indeferido até agora.");
    }
    partes.push("Isso é só informativo, sô — a análise deste processo é independente, com base na legislação e nos documentos apresentados aqui.");

    return NextResponse.json({
      ok: true,
      encontrado: true,
      mensagem: partes.join(" "),
      total_processos: codigos.length,
      total_indeferidos: indeferidos,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message }, { status: 500 });
  }
}
