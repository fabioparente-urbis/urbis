import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { AuthContext } from "@/lib/auth";

/**
 * Réplica SERVER-SIDE do `podeEditar` que já existe em app/admin/checklists/page.tsx (linhas
 * ~117-124) — o gate de lá era só do lado do cliente (a tela escondia o botão, mas a API
 * nunca checava nada, nem autenticação). Reproduz exatamente a mesma regra, inclusive os
 * perfis "Diretor"/"Gerência PP"/"Gerência MP"/"Gerência GP" que hoje não correspondem a
 * nenhum perfil realmente atribuído no banco (confirmado em auditoria de 03/09/2026: só
 * existem Administrador, Diretora, Gerente, Gerência GERECCO/GERAED/GERAGP, Analista) — não é
 * bug desta rodada consertar a lista, é preservar o comportamento que já existia.
 */
const PERFIS_QUE_PODEM_EDITAR_MODELO_PADRAO = new Set([
  "Administrador",
  "Diretora",
  "Diretor",
  "Gerência PP",
  "Gerência MP",
  "Gerência GP",
]);

export type ResultadoAutorizacaoChecklist = { ok: true } | { ok: false; status: number; erro: string };

/**
 * Modelo com dono_id === null é "padrão" (compartilhado entre processos do slot) — só quem
 * está na lista acima pode editar. Modelo com dono é pessoal/customizado — qualquer usuário
 * autenticado pode editar (mesma regra que a tela já aplicava).
 */
export async function podeEditarModeloChecklist(
  ctx: AuthContext,
  modeloId: string | null | undefined,
): Promise<ResultadoAutorizacaoChecklist> {
  if (!modeloId) return { ok: false, status: 400, erro: "modelo_id obrigatório." };

  const { data: modelo, error } = await supabaseAdmin
    .from("mac_checklist_modelos")
    .select("dono_id")
    .eq("id", modeloId)
    .maybeSingle();
  if (error) return { ok: false, status: 500, erro: error.message };
  if (!modelo) return { ok: false, status: 404, erro: "Modelo de checklist não encontrado." };

  const isPadrao = modelo.dono_id === null;
  if (!isPadrao) return { ok: true };

  const podeEditarPadrao = ctx.perfis.some((p) => PERFIS_QUE_PODEM_EDITAR_MODELO_PADRAO.has(p));
  if (!podeEditarPadrao) {
    return { ok: false, status: 403, erro: "Só Administrador, Diretora ou gerência pode editar um modelo padrão de checklist." };
  }
  return { ok: true };
}
