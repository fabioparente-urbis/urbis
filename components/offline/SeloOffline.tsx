"use client";
/**
 * SeloOffline — URBIS OFFLINE, Etapa 1. Componente genérico (sem regra de slot).
 * 🟢 tudo enviado · 🟡 N alterações aguardando (offline/servidor fora) · 🔴 conflito ou recusa.
 * Cuida também de: reenviar a fila (volta da internet + a cada 30s enquanto houver pendência) e do
 * backup automático em arquivo a cada 30 min com pendência (R3). Só aparece quando há algo a dizer
 * (pendência, conflito ou rede fora) — com tudo em dia fica calado, para não mexer na tela de quem
 * trabalha online.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { exportarPendencias, guardarDeLado, listarFila, resolver, sincronizar, tentarDeNovo } from "@/lib/offline/fila";
import type { ItemFila } from "@/lib/offline/armazem";

const BACKUP_MS = 30 * 60 * 1000;

export default function SeloOffline({ uid, aoResolver }: { uid: string | null; aoResolver?: () => void }) {
  const [fila, setFila] = useState<ItemFila[]>([]);
  const [semRede, setSemRede] = useState(false);
  const [aberto, setAberto] = useState(false);
  const ultimoBackup = useRef(0);

  const atualizar = useCallback(async () => {
    if (!uid) return;
    setFila(await listarFila(uid));
  }, [uid]);

  const tentar = useCallback(async () => {
    if (!uid) return;
    const r = await sincronizar(uid);
    setSemRede(r.semConexao);
    await atualizar();
    if (r.enviados > 0) aoResolver?.();
  }, [uid, atualizar, aoResolver]);

  useEffect(() => {
    if (!uid) return;
    void atualizar();
    const aoMudar = () => { void atualizar(); };
    const aoVoltar = () => { setSemRede(false); void tentar(); };
    const aoCair = () => setSemRede(true);
    window.addEventListener("urbis-offline-mudou", aoMudar);
    window.addEventListener("online", aoVoltar);
    window.addEventListener("offline", aoCair);
    void tentar(); // pendência que sobrou de uma sessão anterior
    const t = setInterval(async () => {
      const f = await listarFila(uid);
      if (f.some((i) => i.estado === "pendente" || i.estado === "aguarda_login")) void tentar();
      if (f.length && Date.now() - ultimoBackup.current >= BACKUP_MS) {
        ultimoBackup.current = Date.now();
        void exportarPendencias(uid);
      }
    }, 30_000);
    return () => {
      window.removeEventListener("urbis-offline-mudou", aoMudar);
      window.removeEventListener("online", aoVoltar);
      window.removeEventListener("offline", aoCair);
      clearInterval(t);
    };
  }, [uid, atualizar, tentar]);

  const problemas = fila.filter((i) => i.estado === "conflito" || i.estado === "recusado");
  const esperando = fila.filter((i) => i.estado === "pendente" || i.estado === "aguarda_login");
  if (!uid || (!fila.length && !semRede)) return null;

  const cor = problemas.length ? "var(--error)" : "var(--warning)";
  const texto = problemas.length
    ? `🔴 ${problemas.length} precisa de você`
    : esperando.length
      ? `🟡 ${esperando.length} alteração(ões) aguardando envio`
      : "🟡 sem conexão com o servidor";

  return (
    <div className="relative text-xs">
      <button onClick={() => setAberto((v) => !v)} className="px-2 py-1 rounded border font-medium" style={{ color: cor, borderColor: cor }}>
        {texto}
      </button>
      {aberto && (
        <div className="absolute right-0 z-50 mt-1 w-96 max-w-[90vw] rounded border p-3 shadow-lg bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-primary)]">
          {!fila.length && <p>Nada pendente. O URBIS está esperando a conexão voltar.</p>}
          {fila.map((i) => (
            <div key={i.chave} className="mb-3 border-b border-[var(--border)] pb-2 last:border-0">
              <p className="font-semibold">{i.rotulo ?? `Processo ${String(i.corpo.id ?? "")}`}</p>
              {i.estado === "aguarda_login" && <p>Aguardando você entrar de novo (a sessão expirou). Nada foi perdido.</p>}
              {i.estado === "pendente" && <p>Guardado neste computador, será enviado sozinho.</p>}
              {i.estado === "conflito" && (
                <>
                  <p>Estes campos mudaram no servidor enquanto você estava sem conexão:</p>
                  <ul className="list-disc pl-4 my-1">
                    {(i.conflitos ?? []).map((c) => (
                      <li key={c.campo}><b>{c.campo}</b>: o seu “{String(c.local)}” × servidor “{String(c.servidor)}”</li>
                    ))}
                  </ul>
                  <div className="flex gap-2">
                    <button className="px-2 py-1 rounded bg-[var(--bg-secondary)]" onClick={async () => { await resolver(i.chave, "meu"); await tentar(); aoResolver?.(); }}>Manter o meu</button>
                    <button className="px-2 py-1 rounded bg-[var(--bg-secondary)]" onClick={async () => { await resolver(i.chave, "servidor"); await atualizar(); aoResolver?.(); }}>Usar o do servidor</button>
                  </div>
                </>
              )}
              {i.estado === "recusado" && (
                <>
                  <p>O servidor recusou: {i.motivo}</p>
                  <div className="flex gap-2 mt-1">
                    <button className="px-2 py-1 rounded bg-[var(--bg-secondary)]" onClick={async () => { await tentarDeNovo(i.chave); await tentar(); }}>Tentar de novo</button>
                    <button className="px-2 py-1 rounded bg-[var(--bg-secondary)]" onClick={async () => { await guardarDeLado(i.chave); await atualizar(); }}>Guardar de lado</button>
                  </div>
                </>
              )}
            </div>
          ))}
          {fila.length > 0 && (
            <button className="underline" onClick={() => { void exportarPendencias(uid); }}>Exportar pendências para arquivo</button>
          )}
        </div>
      )}
    </div>
  );
}
