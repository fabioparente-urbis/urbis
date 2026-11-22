/**
 * lib/offline/fila.ts — fila de salvamento do URBIS OFFLINE (Etapa 1). Genérica: não conhece slot.
 *
 * Regras vindas do estudo (docs/URBIS_OFFLINE_ESTUDO_VIABILIDADE.md, seções 5, 6, 8):
 *  - a fila guarda a AÇÃO (o POST de sempre) e reenvia pela MESMA rota, com o token real do
 *    momento — então MRP/MDP/MAP/tags recebem o fato normalmente, só que atrasado;
 *  - o servidor manda: 401 não descarta nem troca de usuário, a fila ESPERA novo login;
 *  - nada some em silêncio: se o campo mudou no servidor desde que foi baixado, vira conflito 🔴
 *    e o analista escolhe (R2); o que ele descartar fica guardado, nunca é apagado (R4);
 *  - um item por (rota, processo): o último salvar vale, mas a "base" e o `criadoEm` do primeiro ficam.
 */
import {
  avisarMudanca, gravarItem, guardarDescartado, lerItem, listarFila, removerItem,
  type Campos, type ConflitoCampo, type ItemFila,
} from "./armazem";

const LS_UID = "urbis_offline_uid";

/** Quem é o usuário deste computador. Online confirma no servidor; offline usa o último conhecido. */
export async function identificarUsuario(): Promise<string | null> {
  try {
    const r = await fetch("/api/auth/me", { credentials: "include" });
    if (r.ok) {
      const j = await r.json();
      const id = j?.data?.id;
      if (id) { try { localStorage.setItem(LS_UID, String(id)); } catch { /* */ } return String(id); }
    }
  } catch { /* offline */ }
  try { return localStorage.getItem(LS_UID); } catch { return null; }
}

/** Erro de conexão ou servidor/banco fora do ar: é o caso de guardar na fila (não é recusa do servidor). */
export function ehQueda(status: number | null): boolean {
  return status === null || status >= 500 || status === 401 || status === 408 || status === 429;
}

export function valoresDe(campos: Campos | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(campos ?? {})) out[k] = campos![k]?.valor ?? "";
  return out;
}

export async function enfileirar(p: {
  uid: string; rota: string; rotaConferir: string; id: string; tipo: string;
  corpo: ItemFila["corpo"]; base: Record<string, unknown>; motivo?: string;
  metodo?: "POST" | "PUT"; conferir?: "ficha" | "mac"; rotulo?: string;
}): Promise<void> {
  const chave = `${p.uid}|${p.rota}|${p.id}|${p.tipo}`;
  const antes = await lerItem(chave);
  const agora = Date.now();
  await gravarItem({
    chave, usuarioId: p.uid, rota: p.rota, rotaConferir: p.rotaConferir,
    metodo: p.metodo, conferir: p.conferir, rotulo: p.rotulo,
    corpo: p.corpo,
    base: antes?.base ?? p.base,
    estado: antes?.estado === "conflito" ? "conflito" : "pendente",
    conflitos: antes?.conflitos,
    motivo: p.motivo,
    criadoEm: antes?.criadoEm ?? agora,
    atualizadoEm: agora,
  });
}

/** Valor mais novo que o analista deixou na fila para este processo (a tela mostra ISTO, não a cópia velha). */
export async function pendenciaDoProcesso(uid: string, rota: string, id: string, tipo: string): Promise<ItemFila | null> {
  return lerItem(`${uid}|${rota}|${id}|${tipo}`);
}

/** Campo da ficha vem como {valor}; item do checklist vem como string solta. */
const valorDe = (x: unknown): unknown =>
  x && typeof x === "object" && "valor" in (x as object) ? (x as { valor?: unknown }).valor ?? "" : x ?? "";

function conflitosDe(item: ItemFila, servidor: Record<string, unknown>): ConflitoCampo[] {
  const local = ((item.conferir === "mac" ? item.corpo.itens : item.corpo.dados) ?? {}) as Record<string, unknown>;
  const out: ConflitoCampo[] = [];
  for (const campo of Object.keys(local)) {
    const meu = valorDe(local[campo]);
    const base = item.base[campo] ?? "";
    if (meu === base) continue; // não foi editado offline
    const srv = valorDe(servidor[campo]);
    if (srv !== base && srv !== meu) out.push({ campo, local: meu, servidor: srv });
  }
  return out;
}

let sincronizando = false;

export type Resultado = { enviados: number; restantes: number; conflitos: number; semConexao: boolean; aguardaLogin: boolean };

/** Reenvia a fila. Seguro de chamar à vontade (evento online, timer, depois de um salvar bom). */
export async function sincronizar(uid: string): Promise<Resultado> {
  const r: Resultado = { enviados: 0, restantes: 0, conflitos: 0, semConexao: false, aguardaLogin: false };
  if (sincronizando) return r;
  sincronizando = true;
  try {
    for (const item of await listarFila(uid)) {
      if (item.estado === "conflito" || item.estado === "recusado") continue; // espera a escolha do analista
      // 1) o campo mudou no servidor desde que foi baixado? (R2 — avisa, nunca sobrescreve calado)
      if (!item.corpo.__forcar) {
        let resp: Response;
        try { resp = await fetch(item.rotaConferir, { credentials: "include" }); }
        catch { r.semConexao = true; break; }
        if (resp.status === 401) { await gravarItem({ ...item, estado: "aguarda_login" }); r.aguardaLogin = true; break; }
        if (resp.status >= 500) { r.semConexao = true; break; }
        if (resp.ok) {
          const j = await resp.json().catch(() => null);
          const srv: Record<string, unknown> | null = item.conferir === "mac"
            ? (((j?.data ?? []) as { id?: string; itens?: Record<string, unknown> }[]).find((a) => a.id === item.corpo.id)?.itens ?? null)
            : (j?.data?.dados ?? null);
          if (srv) {
            const conf = conflitosDe(item, srv);
            if (conf.length) {
              await gravarItem({ ...item, estado: "conflito", conflitos: conf });
              r.conflitos++;
              continue;
            }
          }
        }
      }
      // 2) envia pela mesma rota de sempre
      const { __forcar, ...corpo } = item.corpo;
      void __forcar;
      let resp: Response;
      try {
        resp = await fetch(item.rota, {
          method: item.metodo ?? "POST", credentials: "include", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(corpo),
        });
      } catch { r.semConexao = true; break; }
      if (resp.status === 401) { await gravarItem({ ...item, estado: "aguarda_login" }); r.aguardaLogin = true; break; }
      if (resp.status >= 500) { r.semConexao = true; break; }
      const j = await resp.json().catch(() => null);
      if (resp.ok && j?.ok !== false) {
        // só apaga se ninguém salvou de novo no meio do envio
        const atual = await lerItem(item.chave);
        if (atual && atual.atualizadoEm === item.atualizadoEm) await removerItem(item.chave);
        r.enviados++;
      } else {
        await gravarItem({ ...item, estado: "recusado", motivo: String(j?.erro ?? `HTTP ${resp.status}`) });
      }
    }
    const resto = await listarFila(uid);
    r.restantes = resto.length;
    r.conflitos = resto.filter((i) => i.estado === "conflito").length;
    return r;
  } finally {
    sincronizando = false;
    avisarMudanca();
  }
}

/** Conflito resolvido pelo analista. "meu" reenvia forçado; "servidor" guarda o dele (não apaga) e some da fila. */
export async function resolver(chave: string, escolha: "meu" | "servidor"): Promise<void> {
  const item = await lerItem(chave);
  if (!item) return;
  if (escolha === "meu") {
    await gravarItem({ ...item, estado: "pendente", conflitos: undefined, corpo: { ...item.corpo, __forcar: true }, atualizadoEm: Date.now() });
  } else {
    await guardarDescartado(item.usuarioId, item, "conflito: analista escolheu o valor do servidor");
    await removerItem(item.chave);
  }
}

/** Recusado pelo servidor: o analista pode tentar de novo ou guardar de lado (vai p/ descartados). */
export async function tentarDeNovo(chave: string): Promise<void> {
  const item = await lerItem(chave);
  if (item) await gravarItem({ ...item, estado: "pendente", motivo: undefined, atualizadoEm: Date.now() });
}
export async function guardarDeLado(chave: string): Promise<void> {
  const item = await lerItem(chave);
  if (!item) return;
  await guardarDescartado(item.usuarioId, item, `recusado pelo servidor: ${item.motivo ?? ""}`);
  await removerItem(chave);
}

/** Backup em arquivo (R3: a cada 30 min enquanto houver pendência). Precisa ser testado no Chrome/Safari do Mac. */
export async function exportarPendencias(uid: string): Promise<boolean> {
  const fila = await listarFila(uid);
  if (!fila.length) return false;
  const blob = new Blob([JSON.stringify({ geradoEm: new Date().toISOString(), fila }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `urbis-pendencias-offline-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return true;
}

export { listarFila };
export { avisarMudanca };
