import { NextRequest, NextResponse } from "next/server";
import { autorizar } from "@/lib/autorizacao";
import { matriz, hashFuncional } from "@/lib/rastreabilidade";
import { fecharResultados } from "@/lib/rastreabilidade/fechar";
import { registrarResultados } from "@/lib/mhd";
import type { ResultadoCampo } from "@/lib/lerPastaSlot5";

/**
 * POST /api/lip/aceitar-pasta — grava o RESULTADO dos 136 campos no MHD, no momento do aceite.
 *
 * `observacoes` só nasce aqui (preenchidoPor "tela") — é por isso que `fecharResultados` não a
 * sintetiza em `/api/lip/ler-pasta`. Com ela presente, esta é a única execução em que o total
 * fecha em 136: as demais 135 já vieram fechadas da leitura.
 *
 * Isto NÃO grava `processos.dados` — quem faz isso é `/api/processo/salvar`, chamado à parte pela
 * tela. Esta rota só persiste a rastreabilidade (resultado, tentativa, evidência) no MHD.
 */

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const processoCodigo = String(body.processoCodigo ?? "");
    const modulo: "LIP" | "MAC" = body.modulo === "MAC" ? "MAC" : "LIP";
    const slot = String(body.slot ?? "slot_05");
    const campos = (body.campos ?? {}) as Record<string, ResultadoCampo>;
    const observacoes = typeof body.observacoes === "string" ? body.observacoes : "";

    if (!processoCodigo) {
      return NextResponse.json({ ok: false, erro: "processoCodigo obrigatório" }, { status: 400 });
    }

    const permissao = await autorizar(req, processoCodigo);
    if (!permissao.ok) {
      return NextResponse.json({ ok: false, erro: permissao.erro }, { status: permissao.status });
    }

    const m = matriz(modulo, slot);
    if (!m?.campos) {
      return NextResponse.json({ ok: false, erro: `matriz ${modulo}:${slot} não encontrada` }, { status: 404 });
    }

    const comObservacoes: Record<string, ResultadoCampo> = { ...campos };
    if (observacoes.trim()) {
      comObservacoes.observacoes = { resultado: "CALCULADO", valor: observacoes, fonte: "aceite da leitura da pasta" };
    }
    const fechados = fecharResultados(m.campos, comObservacoes);

    const porChave = new Map(m.campos.map((c) => [c.chave, c]));
    const resultados = Object.entries(fechados).map(([chave, r]) => {
      const c = porChave.get(chave);
      return {
        chave, resultado: r.resultado, valor: r.valor, fonte: r.fonte,
        tentativa: r.tentativa, evidencia: r.evidencia,
        versao: c?.versao ?? 0, hash: c ? hashFuncional(c) : "",
      };
    });

    const resumo = await registrarResultados({ processoCodigo, modulo, slot, resultados });

    return NextResponse.json({ ok: true, total: resultados.length, ...resumo });
  } catch (e: any) {
    console.error("[aceitar-pasta]", e);
    return NextResponse.json({ ok: false, erro: e?.message ?? "falha ao registrar resultados" }, { status: 500 });
  }
}
