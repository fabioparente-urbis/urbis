/**
 * lib/documentosSei/rascunhoFatiador.ts — pedido do Fábio (14/09/2026): "quero que sempre guarde
 * as informações e dados do último fatiamento". Confirmado por ele: POR USUÁRIO — cada analista só
 * vê o próprio rascunho em andamento, nunca o de outro logado na mesma máquina.
 *
 * Guarda UM rascunho por usuário (o mais recente sobrescreve o anterior — "o último fatiamento",
 * singular, não um histórico). Vive no IndexedDB do navegador, chave = `usuarioId`: nunca sobe pro
 * servidor, mesma regra do resto do fatiador ("o arquivo não é enviado para servidor nenhum").
 *
 * Módulo NOVO, separado de `cachePdfNavegador.ts` (que guarda só o PDF, por processo, pros dois
 * Organizadores): aqui precisa guardar também a EDIÇÃO em andamento (itens corrigidos, mapa de
 * eventos brutos) — não só o arquivo — e é indexado por analista, não por processo.
 */

import type { ItemFatiado } from "./estadoEdicao";

const DB_NOME = "urbis_fatiador_rascunho";
const DB_VERSAO = 1;
const LOJA = "rascunhos"; // keyPath: usuarioId — um registro por analista

export type RascunhoFatiador = {
  usuarioId: string;
  processoCodigo: string;
  slot: string;
  numeroProcesso: string;
  /** Eventos como o servidor devolveu (ver EventoSei em TelaFatiamento.tsx) — tipo solto aqui de
   * propósito, pra este módulo não depender do componente de tela. */
  eventosBrutos: unknown[];
  itens: ItemFatiado[];
  arquivoNome: string;
  arquivoTipo: string;
  arquivoBlob: Blob;
  /**
   * Resultado de "Enviar marcados para leitura" (ResultadoLote de lerComGemini.ts, tipo solto
   * aqui pelo mesmo motivo de `eventosBrutos`) — achado do Fábio, 15/09/2026: recarregar a tela
   * (ex. pra pegar uma correção) jogava fora uma leitura que já tinha rodado (e custado) no
   * Gemini, porque só ficava em estado do React. `null`/ausente em rascunho antigo, de antes
   * deste campo existir, ou quando ainda não rodou nenhuma leitura.
   */
  resultadoLeitura?: unknown;
  guardadoEm: number;
};

function abrirDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOME, DB_VERSAO);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(LOJA)) db.createObjectStore(LOJA, { keyPath: "usuarioId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Grava (substitui) o rascunho deste usuário. Falha (quota, modo privado) nunca derruba a tela. */
export async function salvarRascunho(
  usuarioId: string,
  dados: Omit<RascunhoFatiador, "usuarioId" | "guardadoEm">,
): Promise<void> {
  try {
    const db = await abrirDb();
    const registro: RascunhoFatiador = { usuarioId, ...dados, guardadoEm: Date.now() };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(LOJA, "readwrite");
      tx.objectStore(LOJA).put(registro);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // melhor esforço — o pior caso é voltar a pedir o PDF na próxima vez, nunca travar a tela
  }
}

export async function carregarRascunho(usuarioId: string): Promise<RascunhoFatiador | null> {
  try {
    const db = await abrirDb();
    const registro = await new Promise<RascunhoFatiador | undefined>((resolve, reject) => {
      const tx = db.transaction(LOJA, "readonly");
      const req = tx.objectStore(LOJA).get(usuarioId);
      req.onsuccess = () => resolve(req.result as RascunhoFatiador | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return registro ?? null;
  } catch {
    return null;
  }
}

export async function limparRascunho(usuarioId: string): Promise<void> {
  try {
    const db = await abrirDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(LOJA, "readwrite");
      tx.objectStore(LOJA).delete(usuarioId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // idem — limpeza que falha não é motivo pra travar nada
  }
}
