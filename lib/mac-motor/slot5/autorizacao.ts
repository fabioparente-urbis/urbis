/**
 * lib/mac-motor/slot5/autorizacao.ts — resolução de processo e visibilidade, EXCLUSIVA do Slot 5.
 *
 * `lib/autorizacao.ts` (compartilhado — usado por outras rotas do Slot 5, como ler-pasta, e
 * potencialmente por outros slots) resolve o processo só por `codigo`, com `.maybeSingle()`. O
 * URBIS admite o MESMO código em `tipo_processo` diferentes — essa resolução genérica pode achar
 * o processo ERRADO (de outro slot) quando o código se repete. Não alteramos `lib/autorizacao.ts`
 * (é compartilhado, e o Slot 1 é intocável): este arquivo busca o processo pelo trio exato
 * (codigo, assunto_id, tipo_processo) e reaplica A MESMA regra de visibilidade já usada em
 * `podeAcessarProcesso` — duplicada aqui de propósito, não importada, porque a fonte de dados
 * (a query) precisa ser diferente.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { usuarioDaRequisicao, type UsuarioReq } from "@/lib/autorizacao";
import { ASSUNTO_ID_SLOT5, TIPO_PROCESSO_SLOT5 } from "./constantes";
import type { DadosProcesso } from "./camposLip";

export { usuarioDaRequisicao };
export type { UsuarioReq };

export type ProcessoSlot5 = {
  id: string;
  dados: DadosProcesso;
};

export type ResolucaoProcessoSlot5 =
  | { ok: true; processo: ProcessoSlot5 }
  | { ok: false; status: 403 | 404; erro: string };

/**
 * Recebe o usuário JÁ resolvido (ver usuarioDaRequisicao) — não autentica de novo. Busca o
 * processo pelo trio exato e aplica a mesma regra de visibilidade de `podeAcessarProcesso`:
 * irrestrito vê tudo; dono (analista_id) e gerência veem o seu; processo sem dono é visível a
 * qualquer autenticado; o resto é 403.
 */
export async function resolverProcessoSlot5(usuario: UsuarioReq, codigo: string): Promise<ResolucaoProcessoSlot5> {
  if (!codigo?.trim()) {
    return { ok: false, status: 404, erro: "Processo não informado" };
  }

  const { data: proc, error } = await supabaseAdmin
    .from("processos")
    .select("id, analista_id, gerencia, dados")
    .eq("codigo", codigo)
    .eq("assunto_id", ASSUNTO_ID_SLOT5)
    .eq("tipo_processo", TIPO_PROCESSO_SLOT5)
    .maybeSingle();
  if (error) {
    return { ok: false, status: 404, erro: `erro ao buscar processo: ${error.message}` };
  }
  if (!proc) {
    return {
      ok: false,
      status: 404,
      erro: "processo não encontrado no Slot 5 — Aprovação de Projeto (o mesmo código pode existir em outro slot; este piloto só enxerga o do Slot 5)",
    };
  }

  if (!usuario.irrestrito) {
    const semDono = !proc.analista_id && !proc.gerencia;
    const meu = proc.analista_id === usuario.id;
    const daMinhaGerencia = !!usuario.gerenciaDoPerfil && proc.gerencia === usuario.gerenciaDoPerfil;
    if (!semDono && !meu && !daMinhaGerencia) {
      return { ok: false, status: 403, erro: "Sem permissão para este processo" };
    }
  }

  return { ok: true, processo: { id: proc.id, dados: proc.dados ?? null } };
}
