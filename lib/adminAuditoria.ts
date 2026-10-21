/**
 * lib/adminAuditoria.ts — registro das ações de administração de contas (C1, etapa E3, 21/10/2026).
 *
 * Grava em `admin_auditoria`, tabela só de acréscimo (migration 2026_10_21_admin_auditoria.sql):
 * o banco recusa UPDATE, DELETE e TRUNCATE nela, inclusive para a service_role.
 *
 * Intenção antes, resultado depois: `registrarIntencao` é chamada ANTES da ação e, se o banco
 * recusar o registro, lança — a rota não executa nada. Assim não existe ato administrativo sem
 * rastro. O resultado (sucesso, falha, falha parcial) é gravado depois, como linha nova.
 *
 * Nunca entra aqui: senha, token, link de redefinição. Para senha, só o marcador "alterada".
 *
 * Satélite MAP: cada ação bem-sucedida também vira um evento resumido em `auditoria_eventos`
 * (módulo ADMIN), apontando para o registro completo pelo `correlacao_id`.
 */

import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type AcaoAdmin =
  | "criar"
  | "editar"
  | "desativar"
  | "reativar"
  | "alterar_senha"
  | "enviar_reset_senha"
  | "exclusao_bloqueada"
  | "acesso_negado";

export type ResultadoAdmin = "intencao" | "sucesso" | "falha" | "falha_parcial" | "recusa";

type Ator = { id: string; nome: string };
type Alvo = { id: string | null; nome: string | null } | null;

/** Eventos do MAP correspondentes (lib/auditoria-tipos.ts, AcaoADMIN). */
const ACAO_MAP: Partial<Record<AcaoAdmin, string>> = {
  criar: "USUARIO_CRIADO",
  editar: "USUARIO_EDITADO",
  desativar: "USUARIO_DESATIVADO",
  reativar: "USUARIO_REATIVADO",
  alterar_senha: "USUARIO_SENHA_ALTERADA",
  enviar_reset_senha: "USUARIO_RESET_SENHA_ENVIADO",
};

function contexto(req: NextRequest) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
  const ua = (req.headers.get("user-agent") ?? "").slice(0, 300) || null;
  return { ator_ip: ip, ator_user_agent: ua };
}

function linha(
  req: NextRequest,
  correlacao: string,
  ator: Ator,
  acao: AcaoAdmin,
  alvo: Alvo,
  resultado: ResultadoAdmin,
  alteracoes: Record<string, unknown>,
  erro: string | null,
) {
  return {
    correlacao_id: correlacao,
    ator_usuario_id: ator.id,
    ator_nome: ator.nome,
    ...contexto(req),
    acao,
    alvo_usuario_id: alvo?.id ?? null,
    alvo_nome: alvo?.nome ?? null,
    alteracoes,
    resultado,
    erro: erro ? erro.slice(0, 500) : null,
  };
}

export type RegistroAdmin = {
  correlacao: string;
  req: NextRequest;
  ator: Ator;
  acao: AcaoAdmin;
  alvo: Alvo;
};

/**
 * Grava a intenção. Lança se o banco recusar — a rota deve abortar sem executar nada.
 */
export async function registrarIntencao(
  req: NextRequest,
  ator: Ator,
  acao: AcaoAdmin,
  alvo: Alvo,
  alteracoes: Record<string, unknown> = {},
): Promise<RegistroAdmin> {
  const correlacao = randomUUID();
  const { error } = await supabaseAdmin
    .from("admin_auditoria")
    .insert(linha(req, correlacao, ator, acao, alvo, "intencao", alteracoes, null));
  if (error) {
    console.error("[admin_auditoria] intenção NÃO gravada — ação abortada:", error.message);
    throw new Error("AUDITORIA_INDISPONIVEL");
  }
  return { correlacao, req, ator, acao, alvo };
}

/**
 * Grava o resultado. Não lança: a ação já aconteceu (ou já falhou) e a resposta ao usuário
 * precisa sair. Falha ao gravar o resultado fica no log do servidor — a intenção já está no banco.
 */
export async function registrarResultado(
  reg: RegistroAdmin,
  resultado: Exclude<ResultadoAdmin, "intencao" | "recusa">,
  alteracoes: Record<string, unknown> = {},
  erro: string | null = null,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("admin_auditoria")
    .insert(linha(reg.req, reg.correlacao, reg.ator, reg.acao, reg.alvo, resultado, alteracoes, erro));
  if (error) console.error("[admin_auditoria] resultado não gravado:", reg.correlacao, error.message);

  const acaoMap = ACAO_MAP[reg.acao];
  if (resultado === "sucesso" && acaoMap) {
    const { error: errMap } = await supabaseAdmin.from("auditoria_eventos").insert({
      analista_id: reg.ator.id,
      analista_nome: reg.ator.nome,
      modulo: "ADMIN",
      acao: acaoMap,
      origem: "MANUAL",
      detalhe: {
        correlacao_id: reg.correlacao,
        alvo_usuario_id: reg.alvo?.id ?? null,
        alvo_nome: reg.alvo?.nome ?? null,
        campos: Object.keys(alteracoes),
      },
    });
    if (errMap) console.warn("[admin_auditoria] evento do MAP não gravado:", errMap.message);
  }
}

/** Tentativa de quem está logado mas não tem poder para a ação. Não lança. */
export async function registrarRecusa(
  req: NextRequest,
  ator: Ator,
  acao: string,
  motivo: string,
  alvo: Alvo = null,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("admin_auditoria")
    .insert(linha(req, randomUUID(), ator, "acesso_negado", alvo, "recusa", { acao_pretendida: acao }, motivo));
  if (error) console.error("[admin_auditoria] recusa não gravada:", error.message);
}

/**
 * Diferença entre o cadastro antes e depois, só dos campos que mudaram. Campos sensíveis
 * nunca levam valor.
 */
export function diferencas(
  antes: Record<string, unknown>,
  depois: Record<string, unknown>,
): Record<string, { antes: unknown; depois: unknown }> {
  const out: Record<string, { antes: unknown; depois: unknown }> = {};
  for (const k of Object.keys(depois)) {
    if (k === "senha" || k === "password") continue;
    const a = antes[k] ?? null;
    const d = depois[k] ?? null;
    if (JSON.stringify(a) !== JSON.stringify(d)) out[k] = { antes: a, depois: d };
  }
  return out;
}
