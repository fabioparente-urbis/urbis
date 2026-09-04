import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { AuthContext } from "@/lib/auth";
import { PERFIS_IRRESTRITOS, PERFIS_GERENCIA } from "@/lib/perfis";

/**
 * Réplica SERVER-SIDE do `podeEditar` que já existe em app/admin/checklists/page.tsx — o gate
 * de lá era só do lado do cliente (a tela escondia o botão, mas a API nunca checava nada, nem
 * autenticação). Usa as constantes reais de perfil (`lib/perfis.ts`), confirmadas em auditoria
 * de 03/09/2026 contra `usuarios`: Administrador, Diretora, Gerência GERECCO/GERAED/GERAGP/GERAP,
 * Analista. A lista anterior ("Diretor"/"Gerência PP"/"Gerência MP"/"Gerência GP") não
 * correspondia a nenhum perfil real — nenhum gerente conseguia editar modelo padrão, apesar de
 * ser essa a intenção original da regra.
 */
const PERFIS_QUE_PODEM_EDITAR_MODELO_PADRAO = new Set<string>([
  ...PERFIS_IRRESTRITOS,
  ...PERFIS_GERENCIA,
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
