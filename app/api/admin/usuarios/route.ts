import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { exigirAdministradorAtivo, type UsuarioAtivo } from "@/lib/autorizacao";
import { registrarIntencao, registrarResultado, diferencas, type AcaoAdmin } from "@/lib/adminAuditoria";
import {
  buscarContaAuthPorEmail, banirConta, desbanirConta, definirSenha, senhaDescartavel, ErroAuth,
  criarConta, contaEstaBloqueada, excluirConta,
} from "@/lib/contasAuth";
import { PERFIS_DISPONIVEIS } from "@/lib/perfis";

/**
 * Administração de contas — exclusiva do Administrador ATIVO, em todos os métodos (C1, 21/10/2026).
 *
 * Até esta data a rota não tinha autenticação nenhuma: qualquer pessoa na internet listava os
 * cadastros, trocava a senha de qualquer conta (inclusive a do Administrador), criava e excluía
 * usuários. Agora:
 *   · toda chamada passa por `exigirAdministradorAtivo` (sessão validada no Auth + cadastro
 *     ativo + perfil Administrador; nas que alteram, também origem do URBIS e corpo JSON);
 *   · toda alteração registra intenção e resultado em `admin_auditoria` (lib/adminAuditoria.ts);
 *   · não existe mais exclusão — só desativação, que preserva identidade e histórico (D4);
 *   · e-mail não muda por aqui até a etapa E4 (identidade estável + confirmação, D5).
 *
 * A Pilha, que lia esta rota para mostrar nomes, passou a usar `analista_nome` em
 * `/api/processos` e o diretório `/api/usuarios/diretorio`.
 */

const ADMIN_FIXO = "Fábio Parente Martins Santos";

/** Só o que as telas de administração usam (usuários, BDI, aba Auditoria) — nunca `*`. */
const COLUNAS = [
  "id", "nome", "email", "matricula", "telefone", "cargo", "cau_crea",
  "perfil", "perfis", "gerencia", "status", "reducao_meta",
  "urbi_ativo", "urbi_modo_audio", "criado_em", "ultimo_acesso", "descadastrado_em",
].join(", ");

const STATUS_VALIDOS = ["Ativo", "Inativo"] as const;

/** Linha de `usuarios` como a rota a lê (mesmas colunas de COLUNAS). */
type LinhaUsuario = {
  id: string; nome: string; email: string;
  matricula: string | null; telefone: string | null; cargo: string | null; cau_crea: string | null;
  perfil: string | null; perfis: string[] | null; gerencia: string | null; status: string;
  reducao_meta: number | null; urbi_ativo: boolean | null; urbi_modo_audio: string | null;
  criado_em: string; ultimo_acesso: string | null; descadastrado_em: string | null;
};
/** Corpo JSON recebido do navegador — nada é confiável até ser validado campo a campo. */
type Corpo = Record<string, unknown>;

function mensagemDe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SENHA_MINIMA = 8;

// Modo de voz do URBI. O Administrador é quem CONCEDE ou REMOVE essa
// permissão pra qualquer usuário — ele mesmo incluído; não é obrigado a ter
// voz e não tem tratamento especial aqui. "nenhum" é o padrão pra todo mundo:
// voz é opt-in, nunca liga sozinha por omissão ou valor inválido (ver
// supabase/migrations/2026_09_01_urbi_modo_audio.sql).
const MODOS_AUDIO_VALIDOS = ["nenhum", "navegador"] as const;
function normalizarModoAudio(v: unknown): typeof MODOS_AUDIO_VALIDOS[number] {
  return (MODOS_AUDIO_VALIDOS as readonly string[]).includes(v as string)
    ? (v as typeof MODOS_AUDIO_VALIDOS[number])
    : "nenhum";
}

// Perfis de chefia sem meta de produtividade. Administrador NÃO entra:
// acumula chefia e produção.
const PERFIS_SEM_META = [
  "Diretora", "Diretor", "Gerente",
  "Gerência GERECCO", "Gerência GERAED", "Gerência GERAGP", "Gerência GERAP",
];

function ehChefia(perfis: string[]): boolean {
  return perfis.some((p) => PERFIS_SEM_META.includes(p));
}

/**
 * Registra a virada de meta quando alguém entra ou sai da chefia.
 * A vigência começa no dia 1º do mês corrente: meses já fechados continuam
 * avaliados pela regra que valia neles. Sem isso, promover um analista a
 * gerente apagaria retroativamente a meta dos meses em que ele produziu —
 * e rebaixar um gerente criaria meta em meses que ele não tinha.
 *
 * C1 (21/10/2026): antes, a falha aqui ia só para o log e a edição respondia "ok" — o perfil
 * mudava e o MRP ficava com a meta errada, em silêncio. Agora:
 *   · é chamada ANTES de gravar o cadastro; se falhar, LANÇA e nada é alterado;
 *   · devolve `desfazer()`, para a rota reverter a vigência se o cadastro falhar depois.
 * Devolve null quando não há virada (nada a gravar).
 */
async function aplicarViradaDeMeta(
  usuarioId: string, perfisAntes: string[], perfisDepois: string[],
): Promise<{ desfazer: () => Promise<string | null>; isento: boolean } | null> {
  const antes = ehChefia(perfisAntes);
  const depois = ehChefia(perfisDepois);
  if (antes === depois) return null;
  const hoje = new Date();
  const vigenteDesde = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-01`;
  // A unicidade por pessoa é índice PARCIAL (WHERE usuario_id IS NOT NULL) e
  // ON CONFLICT não infere índice parcial (42P10) — busca e decide na mão.
  const { data: jaExiste, error: errBusca } = await supabase
    .from("mrp_meta_historico")
    .select("id, isento, meta")
    .eq("usuario_id", usuarioId)
    .eq("vigente_desde", vigenteDesde)
    .maybeSingle();
  if (errBusca) throw new Error(`consulta da vigência de meta falhou: ${errBusca.message}`);
  const anterior = jaExiste as { id: string; isento: boolean | null; meta: number | null } | null;

  if (anterior) {
    const { error } = await supabase.from("mrp_meta_historico").update({ isento: depois, meta: null }).eq("id", anterior.id);
    if (error) throw new Error(`gravação da vigência de meta falhou: ${error.message}`);
    return {
      isento: depois,
      desfazer: async () => {
        const { error: e } = await supabase.from("mrp_meta_historico")
          .update({ isento: anterior.isento, meta: anterior.meta }).eq("id", anterior.id);
        return e ? e.message : null;
      },
    };
  }
  const { data: criada, error } = await supabase.from("mrp_meta_historico")
    .insert({ usuario_id: usuarioId, isento: depois, meta: null, vigente_desde: vigenteDesde })
    .select("id").single();
  if (error || !criada) throw new Error(`gravação da vigência de meta falhou: ${error?.message ?? "sem retorno"}`);
  const idCriada = (criada as { id: string }).id;
  return {
    isento: depois,
    desfazer: async () => {
      const { error: e } = await supabase.from("mrp_meta_historico").delete().eq("id", idCriada);
      return e ? e.message : null;
    },
  };
}

/**
 * Normaliza os perfis recebidos do client: dedup, remove vazios,
 * e garante "Administrador" no array quando o nome for o ADMIN_FIXO.
 * `perfil` (singular) é tratado como fallback quando `perfis` não vem.
 */
function normalizarPerfis(input: { nome?: string; perfil?: unknown; perfis?: unknown }): string[] {
  const raw: string[] = Array.isArray(input.perfis)
    ? (input.perfis as unknown[]).map((p) => String(p).trim()).filter(Boolean)
    : input.perfil
      ? [String(input.perfil).trim()]
      : [];
  const set = new Set(raw);
  if (input.nome && input.nome.trim() === ADMIN_FIXO) {
    set.add("Administrador");
  }
  // "Administrador" sempre em primeiro: `perfil` (legado) = perfis[0], e telas como o BDI ainda
  // conferem `perfil === "Administrador"`. Sem isso, o Administrador que marcasse também
  // "Analista" antes passava a ter perfil principal "Analista" e era barrado dessas telas.
  const lista = Array.from(set);
  return lista.includes("Administrador")
    ? ["Administrador", ...lista.filter((p) => p !== "Administrador")]
    : lista;
}

// Normaliza usuarios.gerencia: aceita 'GERECCO'|'GERAED'|'GERAGP'|'GERAP' ou null. Qualquer outro
// valor (incluindo ''/undefined/'DIRAAP') vira null = analista DIRAAP direto.
function normalizarGerencia(v: unknown): "GERECCO" | "GERAED" | "GERAGP" | "GERAP" | null {
  if (v === "GERECCO" || v === "GERAED" || v === "GERAGP" || v === "GERAP") return v;
  return null;
}

function normalizarEmail(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

/** Texto livre opcional: aparado, vazio vira null, limitado a 200 caracteres. */
function textoOpcional(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.slice(0, 200) : null;
}

function perfisDe(linha: Pick<LinhaUsuario, "perfil" | "perfis"> | null): string[] {
  const arr: string[] = Array.isArray(linha?.perfis) ? linha.perfis.filter(Boolean) : [];
  if (linha?.perfil && !arr.includes(linha.perfil)) arr.push(linha.perfil);
  return arr;
}

function erro(status: number, mensagem: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, erro: mensagem, ...extra }, { status });
}

/** Perfis aceitos: o catálogo oficial + os que a pessoa JÁ tem (legados, ex.: "Diretor"). */
function perfisInvalidos(perfis: string[], jaTinha: string[] = []): string[] {
  const aceitos = new Set<string>([...PERFIS_DISPONIVEIS, ...jaTinha]);
  return perfis.filter((p) => !aceitos.has(p));
}

/** Quantos OUTROS Administradores ativos existem além de `exceto`. */
async function outrosAdminsAtivos(exceto: string): Promise<number> {
  const { data } = await supabase
    .from("usuarios")
    .select("id")
    .eq("status", "Ativo")
    .or("perfil.eq.Administrador,perfis.cs.{Administrador}")
    .neq("id", exceto);
  return (data ?? []).length;
}

function baseUrlDoApp(req: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || req.nextUrl.origin;
}

async function enviarResetSenha(req: NextRequest, email: string): Promise<string | null> {
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { error } = await anon.auth.resetPasswordForEmail(email, {
    redirectTo: `${baseUrlDoApp(req)}/redefinir-senha`,
  });
  return error ? error.message : null;
}

async function lerCorpo(req: NextRequest): Promise<Corpo | null> {
  try {
    const b: unknown = await req.json();
    return b && typeof b === "object" && !Array.isArray(b) ? (b as Corpo) : null;
  } catch {
    return null;
  }
}

// ─── GET: lista para as telas de administração ─────────────────────────────
export async function GET(req: NextRequest) {
  const b = await exigirAdministradorAtivo(req, { acao: "listar" });
  if (!b.ok) return b.resposta;

  const { data, error } = await supabase.from("usuarios").select(COLUNAS).order("nome");
  if (error) {
    console.error("[admin/usuarios GET]", error.message);
    return erro(500, "Falha ao carregar usuários.");
  }
  return NextResponse.json({ ok: true, data });
}

// ─── POST: cadastrar ───────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const b = await exigirAdministradorAtivo(req, { mutacao: true, acao: "criar" });
  if (!b.ok) return b.resposta;
  const ator = b.usuario;

  const body = await lerCorpo(req);
  if (!body) return erro(400, "Corpo inválido.");

  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  const email = normalizarEmail(body.email);
  const senha = typeof body.senha === "string" ? body.senha : "";
  if (!nome || !email || !senha) return erro(400, "Nome, email e senha obrigatórios");
  if (!EMAIL.test(email)) return erro(400, "E-mail inválido.");
  if (senha.length < SENHA_MINIMA) return erro(400, `A senha deve ter pelo menos ${SENHA_MINIMA} caracteres.`);

  const perfis = normalizarPerfis({ nome, perfil: body.perfil, perfis: body.perfis });
  if (perfis.length === 0) return erro(400, "Selecione ao menos um perfil.");
  const invalidos = perfisInvalidos(perfis);
  if (invalidos.length) return erro(400, `Perfil não reconhecido: ${invalidos.join(", ")}.`);

  const status = body.status === undefined || body.status === "" ? "Ativo" : String(body.status);
  if (!(STATUS_VALIDOS as readonly string[]).includes(status)) return erro(400, "Status inválido (use Ativo ou Inativo).");

  // Regra: perfil Administrador só para o nome fixo
  if (perfis.includes("Administrador") && nome !== ADMIN_FIXO)
    return erro(400, `O perfil Administrador é exclusivo de "${ADMIN_FIXO}".`);

  // Regra: só pode existir 1 administrador no sistema
  if (perfis.includes("Administrador")) {
    const { data: admins } = await supabase
      .from("usuarios")
      .select("id")
      .or("perfil.eq.Administrador,perfis.cs.{Administrador}");
    if (admins && admins.length > 0) return erro(400, "Já existe um Administrador cadastrado no sistema.");
  }

  // Comparação sem diferenciar maiúsculas (cadastros antigos podem ter e-mail com maiúscula);
  // `%` e `_` escapados para o ilike não virar curinga.
  const { data: emailUsado } = await supabase
    .from("usuarios").select("id").ilike("email", email.replace(/[\\%_]/g, (c) => `\\${c}`)).limit(1);
  if (emailUsado && emailUsado.length > 0) return erro(409, "Já existe um cadastro com este e-mail.");

  const perfilPrincipal = perfis[0];
  // gerencia faz sentido apenas para analistas (DIRAAP). Para os demais, null.
  const gerencia = perfis.includes("Analista") ? normalizarGerencia(body.gerencia) : null;
  const novo = {
    nome,
    email,
    matricula: textoOpcional(body.matricula),
    telefone: textoOpcional(body.telefone),
    cargo: textoOpcional(body.cargo),
    perfil: perfilPrincipal,
    perfis,
    gerencia,
    status,
    urbi_ativo: body.urbi_ativo === true,
    urbi_modo_audio: normalizarModoAudio(body.urbi_modo_audio),
  };

  let reg;
  try {
    reg = await registrarIntencao(req, ator, "criar", { id: null, nome }, diferencas({}, novo));
  } catch {
    return erro(503, "Registro de auditoria indisponível — nada foi alterado. Tente novamente.");
  }

  // 1. Conta de acesso. Cadastro Inativo: a conta já nasce bloqueada.
  const inativo = status === "Inativo";
  let authId: string;
  let reaproveitada = false;
  try {
    authId = await criarConta(email, senha, inativo);
  } catch (e) {
    if (!(e instanceof ErroAuth && e.jaExiste)) {
      await registrarResultado(reg, "falha", {}, mensagemDe(e));
      return erro(502, "Nada foi criado: a conta de acesso não pôde ser criada no Auth. Tente novamente.");
    }
    // O e-mail já tem conta no Auth, mas não tem cadastro no URBIS (conferido acima): conta
    // órfã, sobra de um cadastro interrompido. Só é reaproveitada com confirmação explícita.
    if (body.reaproveitarContaOrfa !== true) {
      await registrarResultado(reg, "falha", {}, "conta de acesso órfã encontrada — aguardando confirmação para reaproveitar");
      return erro(409, `Já existe uma conta de acesso para ${email} no Auth, sem cadastro no URBIS (sobra de um cadastro interrompido). Nada foi criado. Para reaproveitá-la com a senha informada, confirme a operação.`, { code: "CONTA_ORFA" });
    }
    let orfa: { id: string } | null = null;
    try { orfa = await buscarContaAuthPorEmail(email); } catch (e2) {
      await registrarResultado(reg, "falha", {}, mensagemDe(e2));
      return erro(502, "Nada foi criado: não foi possível consultar a conta de acesso órfã. Tente novamente.");
    }
    if (!orfa) {
      await registrarResultado(reg, "falha", {}, "conta órfã não localizada na releitura");
      return erro(502, "Nada foi criado: a conta de acesso órfã não foi localizada. Tente cadastrar de novo.");
    }
    try {
      await definirSenha(orfa.id, senha);
      if (inativo) await banirConta(orfa.id); else await desbanirConta(orfa.id);
    } catch (e3) {
      await registrarResultado(reg, "falha", {}, mensagemDe(e3));
      return erro(502, "Nada foi criado: a conta de acesso órfã não pôde ser preparada (senha/bloqueio). A conta continua órfã, sem cadastro — tente de novo.");
    }
    authId = orfa.id;
    reaproveitada = true;
  }

  /** Desfaz a conta de acesso criada nesta chamada. Devolve a mensagem de erro, ou null se desfez. */
  const desfazerConta = async (): Promise<string | null> => {
    if (reaproveitada) return null; // conta já existia antes desta chamada: continua órfã, como estava
    try { await excluirConta(authId); return null; } catch (e) { return mensagemDe(e); }
  };
  const estadoOrfa = (motivo: string) =>
    `ESTADO PARCIAL: ${motivo} A conta de acesso de ${email} ficou criada no Auth SEM cadastro no URBIS` +
    `${inativo ? " e SEM bloqueio confirmado" : ""}. Ela não consegue usar o URBIS (sem cadastro, toda rota recusa), mas existe. ` +
    `Recuperação: cadastre de novo com o mesmo e-mail — o sistema detecta a conta órfã e oferece reaproveitá-la.`;

  // 2. Cadastro Inativo: confirma no Auth que a conta está mesmo bloqueada (nem toda versão do
  //    Auth aplica o bloqueio na criação); se não estiver, bloqueia; se não der, desfaz tudo.
  if (inativo) {
    let bloqueada = false;
    let motivo = "";
    try {
      bloqueada = await contaEstaBloqueada(authId);
      if (!bloqueada) { await banirConta(authId); bloqueada = await contaEstaBloqueada(authId); }
    } catch (e) { motivo = mensagemDe(e); }
    if (!bloqueada) {
      const falhaDesfazer = await desfazerConta();
      if (falhaDesfazer) {
        await registrarResultado(reg, "falha_parcial", {}, `bloqueio não confirmado (${motivo || "conta continua livre"}); desfazer a conta falhou: ${falhaDesfazer}`);
        return erro(502, estadoOrfa("o bloqueio da conta de acesso não pôde ser confirmado e desfazer a conta também falhou."), { parcial: true, code: "CONTA_ORFA_CRIADA" });
      }
      await registrarResultado(reg, "falha", {}, `bloqueio não confirmado (${motivo || "conta continua livre"}); conta desfeita`);
      return erro(502, "Nada foi criado: não foi possível confirmar o bloqueio da conta de acesso de um cadastro Inativo. Tente novamente.");
    }
  }

  // 3. Cadastro no URBIS.
  const { data: inserido, error: dbError } = await supabase.from("usuarios").insert(novo).select("id").single();
  if (dbError || !inserido) {
    const falhaDesfazer = await desfazerConta();
    if (falhaDesfazer) {
      await registrarResultado(reg, "falha_parcial", {}, `cadastro não gravado (${dbError?.message ?? "sem retorno"}); desfazer a conta falhou: ${falhaDesfazer}`);
      return erro(502, estadoOrfa("o cadastro não foi gravado e desfazer a conta de acesso falhou."), { parcial: true, code: "CONTA_ORFA_CRIADA" });
    }
    await registrarResultado(reg, "falha", {}, `${dbError?.message ?? "cadastro não inserido"}${reaproveitada ? " (conta órfã reaproveitada continua órfã)" : "; conta de acesso desfeita"}`);
    // Propaga code (23505 = unique_violation) para a UI tratar.
    return erro(500, reaproveitada
      ? "Nada foi criado: o cadastro não pôde ser gravado. A conta de acesso órfã continua existindo, como antes — tente de novo."
      : "Nada foi criado: o cadastro não pôde ser gravado e a conta de acesso foi desfeita. Tente novamente.", { code: dbError?.code });
  }

  const idNovo = (inserido as { id: string }).id;
  const avisos = reaproveitada ? [`A conta de acesso que já existia para ${email} foi reaproveitada, com a senha informada.`] : [];
  await registrarResultado({ ...reg, alvo: { id: idNovo, nome } }, "sucesso", { ...diferencas({}, novo), ...(reaproveitada ? { conta_orfa_reaproveitada: true } : {}) });
  return NextResponse.json({ ok: true, id: idNovo, ...(avisos.length ? { avisos } : {}) });
}

// ─── PUT: editar / desativar / reativar / trocar senha ─────────────────────
export async function PUT(req: NextRequest) {
  const b = await exigirAdministradorAtivo(req, { mutacao: true, acao: "editar" });
  if (!b.ok) return b.resposta;
  const ator: UsuarioAtivo = b.usuario;

  const body = await lerCorpo(req);
  if (!body) return erro(400, "Corpo inválido.");
  const id = typeof body.id === "string" ? body.id : "";
  if (!UUID.test(id)) return erro(400, "ID obrigatório");

  const { data: atual } = await supabase.from("usuarios").select(COLUNAS).eq("id", id).maybeSingle();
  if (!atual) return erro(404, "Usuário não encontrado.");
  const a = atual as unknown as LinhaUsuario;
  const perfisAtuais = perfisDe(a);

  // D5: troca de e-mail só na etapa E4 (identidade estável + confirmação pelo novo endereço).
  if (body.email !== undefined && normalizarEmail(body.email) !== normalizarEmail(a.email)) {
    return erro(400, "A alteração de e-mail ainda não está disponível. Ela exige confirmação pelo novo endereço e será liberada numa próxima etapa.");
  }

  const nome = body.nome !== undefined ? String(body.nome ?? "").trim() : a.nome;
  if (!nome) return erro(400, "Nome obrigatório.");

  const perfis = body.perfis !== undefined || body.perfil !== undefined
    ? normalizarPerfis({ nome, perfil: body.perfil, perfis: body.perfis })
    : perfisAtuais;
  if (perfis.length === 0) return erro(400, "Selecione ao menos um perfil.");
  const invalidos = perfisInvalidos(perfis, perfisAtuais);
  if (invalidos.length) return erro(400, `Perfil não reconhecido: ${invalidos.join(", ")}.`);

  // Regra: não permite remover/alterar o admin fixo
  const atualEraAdmin = perfisAtuais.includes("Administrador");
  if (atualEraAdmin && a.nome === ADMIN_FIXO) {
    if (!perfis.includes("Administrador"))
      return erro(400, "Não é permitido remover o perfil Administrador do usuário fixo.");
    if (nome !== ADMIN_FIXO)
      return erro(400, "O nome do Administrador não pode ser alterado.");
  }
  // Regra: perfil Administrador só para o nome fixo
  if (perfis.includes("Administrador") && nome !== ADMIN_FIXO)
    return erro(400, `O perfil Administrador é exclusivo de "${ADMIN_FIXO}".`);

  const status = body.status !== undefined ? String(body.status) : a.status;
  if (!(STATUS_VALIDOS as readonly string[]).includes(status) && status !== a.status)
    return erro(400, "Status inválido (use Ativo ou Inativo).");

  // Ninguém desativa a si mesmo nem tira o próprio perfil de Administrador.
  if (id === ator.id) {
    if (status !== "Ativo") return erro(400, "Você não pode desativar a sua própria conta.");
    if (!perfis.includes("Administrador")) return erro(400, "Você não pode retirar o seu próprio perfil de Administrador.");
  }
  // Nenhuma operação pode deixar o sistema sem Administrador ativo.
  const eraAdminAtivo = atualEraAdmin && a.status === "Ativo";
  const seraAdminAtivo = perfis.includes("Administrador") && status === "Ativo";
  if (eraAdminAtivo && !seraAdminAtivo && (await outrosAdminsAtivos(id)) === 0) {
    return erro(400, "Operação recusada: o sistema ficaria sem nenhum Administrador ativo.");
  }

  let reducaoMeta: number = Number(a.reducao_meta ?? 0);
  if (body.reducao_meta !== undefined && body.reducao_meta !== "") {
    reducaoMeta = typeof body.reducao_meta === "number" ? body.reducao_meta : parseFloat(String(body.reducao_meta));
    if (!Number.isFinite(reducaoMeta) || reducaoMeta < 0 || reducaoMeta > 100)
      return erro(400, "Redução de meta deve estar entre 0 e 100.");
  }

  const senha = typeof body.senha === "string" && body.senha !== "" ? body.senha : null;
  if (senha !== null && senha.length < SENHA_MINIMA)
    return erro(400, `A senha deve ter pelo menos ${SENHA_MINIMA} caracteres.`);

  const ehAnalista = perfis.includes("Analista");
  const gerencia = ehAnalista
    ? (body.gerencia !== undefined ? normalizarGerencia(body.gerencia) : (a.gerencia ?? null))
    : null;

  const novo: Record<string, unknown> = {
    nome,
    matricula: body.matricula !== undefined ? textoOpcional(body.matricula) : a.matricula,
    telefone: body.telefone !== undefined ? textoOpcional(body.telefone) : a.telefone,
    cargo: body.cargo !== undefined ? textoOpcional(body.cargo) : a.cargo,
    cau_crea: body.cau_crea !== undefined ? textoOpcional(body.cau_crea) : a.cau_crea,
    perfil: perfis[0],
    perfis,
    gerencia,
    status,
    reducao_meta: reducaoMeta,
    urbi_ativo: body.urbi_ativo !== undefined ? body.urbi_ativo === true : a.urbi_ativo,
    urbi_modo_audio: body.urbi_modo_audio !== undefined ? normalizarModoAudio(body.urbi_modo_audio) : a.urbi_modo_audio,
  };
  const desativando = a.status === "Ativo" && status === "Inativo";
  const reativando = a.status !== "Ativo" && status === "Ativo";
  if (desativando) novo.descadastrado_em = new Date().toISOString();
  if (reativando) novo.descadastrado_em = null;

  const acao: AcaoAdmin = desativando ? "desativar" : reativando ? "reativar" : "editar";
  const alteracoes: Record<string, unknown> = diferencas(a, novo);
  if (senha) alteracoes.senha = "alterada";
  const criarContaAcesso = body.criarContaAcesso === true;

  // ── Conta de acesso conferida ANTES de gravar qualquer coisa. ──
  const precisaConta = desativando || reativando || !!senha || Object.keys(alteracoes).length === 0;
  let conta: { id: string } | null = null;
  let consultaFalhou: string | null = null;
  if (precisaConta) {
    try {
      conta = await buscarContaAuthPorEmail(a.email);
    } catch (e) {
      consultaFalhou = mensagemDe(e);
    }
    // Senha (e "salvar sem alterar") dependem da conta: sem consultar, nada é feito.
    // Desativar NÃO é barrado: é a ação de segurança mais urgente; o status vale na hora e o
    // bloqueio no Auth vira pendência explícita logo abaixo.
    if (consultaFalhou && (senha || Object.keys(alteracoes).length === 0)) {
      return erro(502, `Nada foi alterado: não foi possível consultar a conta de acesso (${consultaFalhou}). Tente novamente.`);
    }
    if (!conta && senha && !criarContaAcesso) {
      return erro(409, `Nada foi alterado: este cadastro não tem conta de acesso no Auth, então a senha não tem onde ser gravada. Para criar a conta de acesso com a senha informada, confirme a operação.`, { code: "SEM_CONTA_AUTH" });
    }
  }

  // ── Nenhum campo mudou: "salvar de novo" é o caminho de recuperação de uma falha parcial
  //    anterior — reaplica no Auth o bloqueio (Inativo) ou o desbloqueio (Ativo). ──
  if (Object.keys(alteracoes).length === 0) {
    if (!conta) return NextResponse.json({ ok: true, semAlteracao: true });
    let bloqueada: boolean;
    try { bloqueada = await contaEstaBloqueada(conta.id); } catch (e) {
      return erro(502, `Nada foi alterado: não foi possível conferir o bloqueio da conta de acesso (${mensagemDe(e)}).`);
    }
    const deveEstarBloqueada = status === "Inativo";
    if (bloqueada === deveEstarBloqueada) return NextResponse.json({ ok: true, semAlteracao: true });
    let regSync;
    try {
      regSync = await registrarIntencao(req, ator, deveEstarBloqueada ? "desativar" : "reativar", { id, nome: a.nome }, { bloqueio_no_auth: { antes: bloqueada, depois: deveEstarBloqueada } });
    } catch {
      return erro(503, "Registro de auditoria indisponível — nada foi alterado. Tente novamente.");
    }
    try {
      if (deveEstarBloqueada) await banirConta(conta.id); else await desbanirConta(conta.id);
    } catch (e) {
      await registrarResultado(regSync, "falha", {}, mensagemDe(e));
      return erro(502, `Nada foi alterado: o ${deveEstarBloqueada ? "bloqueio" : "desbloqueio"} da conta de acesso falhou de novo (${mensagemDe(e)}). Tente mais tarde.`);
    }
    await registrarResultado(regSync, "sucesso", { bloqueio_no_auth: { antes: bloqueada, depois: deveEstarBloqueada } });
    return NextResponse.json({ ok: true, avisos: [deveEstarBloqueada
      ? "O bloqueio da conta de acesso, que estava pendente, foi aplicado agora."
      : "O desbloqueio da conta de acesso, que estava pendente, foi aplicado agora."] });
  }

  let reg;
  try {
    reg = await registrarIntencao(req, ator, acao, { id, nome: a.nome }, alteracoes);
  } catch {
    return erro(503, "Registro de auditoria indisponível — nada foi alterado. Tente novamente.");
  }

  // ── 1. Vigência de meta (MRP) ANTES do cadastro: se falhar, nada foi alterado. ──
  let virada: Awaited<ReturnType<typeof aplicarViradaDeMeta>> = null;
  try {
    virada = await aplicarViradaDeMeta(id, perfisAtuais, perfis);
  } catch (e) {
    await registrarResultado(reg, "falha", {}, mensagemDe(e));
    return erro(502, "Nada foi alterado: não foi possível registrar a vigência da meta (MRP) que acompanha a mudança de chefia. Tente novamente.");
  }

  // ── 2. Cadastro. Se falhar, desfaz a vigência de meta. ──
  const { error: dbError } = await supabase.from("usuarios").update(novo).eq("id", id);
  if (dbError) {
    const falhaDesfazer = virada ? await virada.desfazer() : null;
    if (falhaDesfazer) {
      await registrarResultado(reg, "falha_parcial", {}, `cadastro não gravado (${dbError.message}); desfazer a vigência de meta falhou: ${falhaDesfazer}`);
      return erro(502,
        `ESTADO PARCIAL: o cadastro NÃO foi alterado, mas a vigência de meta deste mês ficou registrada como ${virada!.isento ? "ISENTA (chefia)" : "COM meta (não chefia)"}, ` +
        `e desfazê-la falhou. Recuperação: salve o usuário de novo com o perfil desejado (a vigência é regravada). ` +
        `Se a intenção era manter o perfil antigo, salve uma vez com a mudança e depois outra sem ela — cada salvamento regrava a vigência do mês.`,
        { parcial: true, code: dbError.code });
    }
    await registrarResultado(reg, "falha", {}, dbError.message);
    // Propaga code (23505 = unique_violation) para a UI tratar.
    return erro(500, "Nada foi alterado: o cadastro não pôde ser gravado.", { code: dbError.code });
  }

  // ── 3. Conta de acesso (Auth). Cadastro e meta já estão gravados e coerentes entre si: se algo
  //       aqui falhar, a resposta diz exatamente o que NÃO foi aplicado e como recuperar. ──
  const avisos: string[] = [];
  const pendentes: string[] = [];
  const recuperar: string[] = [];
  if (consultaFalhou && (desativando || reativando)) {
    pendentes.push(`${desativando ? "bloqueio" : "desbloqueio"} do acesso (consulta à conta falhou: ${consultaFalhou})`);
    recuperar.push(`abra o usuário e clique em Salvar sem alterar nada — o sistema reaplica o ${desativando ? "bloqueio" : "desbloqueio"}`);
  } else if (desativando) {
    if (!conta) avisos.push("Este cadastro não tem conta de acesso no Auth — não havia acesso a bloquear.");
    else {
      try { await banirConta(conta.id); } catch (e) {
        pendentes.push(`bloqueio do acesso (${mensagemDe(e)})`);
        recuperar.push("abra o usuário e clique em Salvar sem alterar nada — o sistema reaplica o bloqueio. Enquanto isso, a pessoa já está barrada no login e nas telas de gestão, Pilha e atribuição");
      }
    }
  }
  if (reativando && !consultaFalhou) {
    if (!conta && !(senha && criarContaAcesso)) avisos.push("Este cadastro não tem conta de acesso no Auth — para a pessoa entrar, defina uma nova senha (o sistema oferece criar a conta).");
    else if (conta) {
      try {
        await desbanirConta(conta.id);
        // P5: reativar exige nova senha — a antiga pode ter vazado no período inativo.
        if (!senha) {
          await definirSenha(conta.id, senhaDescartavel());
          const falhaEnvio = await enviarResetSenha(req, a.email);
          avisos.push(falhaEnvio
            ? "Conta reativada, mas o e-mail de redefinição de senha não foi enviado. Defina uma senha em Editar → Nova senha, ou use o botão Senha."
            : "Conta reativada. A pessoa recebeu um e-mail para criar uma nova senha.");
        }
      } catch (e) {
        pendentes.push(`desbloqueio do acesso (${mensagemDe(e)})`);
        recuperar.push("abra o usuário e clique em Salvar sem alterar nada — o sistema reaplica o desbloqueio; depois defina uma nova senha");
      }
    }
  }
  if (senha) {
    try {
      if (conta) await definirSenha(conta.id, senha);
      else {
        await criarConta(a.email, senha, status === "Inativo");
        avisos.push("A conta de acesso, que não existia, foi criada com a senha informada.");
        alteracoes.conta_acesso = "criada";
      }
    } catch (e) {
      pendentes.push(conta ? `nova senha (${mensagemDe(e)})` : `criação da conta de acesso (${mensagemDe(e)})`);
      recuperar.push("digite a nova senha de novo e salve");
    }
  }

  if (desativando) {
    const { count } = await supabase
      .from("processos")
      .select("id", { count: "exact", head: true })
      .eq("analista_id", id)
      .is("excluido_em", null);
    if (count && count > 0) avisos.push(`${count} processo(s) continuam atribuídos a esta pessoa — redistribua pela Pilha.`);
  }

  if (pendentes.length) {
    await registrarResultado(reg, "falha_parcial", alteracoes, pendentes.join("; "));
    return erro(502,
      `ESTADO PARCIAL: o cadastro foi salvo${virada ? " (com a vigência de meta)" : ""}, mas NÃO foi aplicado na conta de acesso: ${pendentes.join("; ")}. ` +
      `Recuperação: ${recuperar.join("; ")}.`,
      { parcial: true, ...(avisos.length ? { avisos } : {}) });
  }

  await registrarResultado(reg, "sucesso", alteracoes);
  return NextResponse.json({ ok: true, ...(avisos.length ? { avisos } : {}) });
}

// ─── DELETE: exclusão física desativada (D4) ───────────────────────────────
export async function DELETE(req: NextRequest) {
  const b = await exigirAdministradorAtivo(req, { mutacao: true, acao: "excluir" });
  if (!b.ok) return b.resposta;

  const body = await lerCorpo(req);
  const id = typeof body?.id === "string" && UUID.test(body.id) ? body.id : null;
  let nomeAlvo: string | null = null;
  if (id) {
    const { data } = await supabase.from("usuarios").select("nome").eq("id", id).maybeSingle();
    nomeAlvo = (data as { nome: string } | null)?.nome ?? null;
  }
  try {
    const reg = await registrarIntencao(req, b.usuario, "exclusao_bloqueada", { id, nome: nomeAlvo });
    await registrarResultado(reg, "falha", {}, "exclusão física desativada (D4)");
  } catch { /* a recusa sai de qualquer jeito */ }

  return erro(405, "A exclusão de usuários foi desativada para preservar o histórico. Para impedir o acesso, edite o usuário e mude o status para Inativo.");
}
