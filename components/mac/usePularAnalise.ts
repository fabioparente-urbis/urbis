"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * "Pular análise" no MAC dos 5 slots (Fábio, 24/11/2026). A análise N pode ter sido de outro
 * analista ou feita no Excel. Dentro do MAC a marca liga e desliga; ao SAIR do MAC ela fica fixa,
 * sem volta (servidor recusa o desfazer: /api/mac/analise-pulada). Só computador.
 */
export type AnalisePulada = { numero: number; fixada: boolean; numeroDocumento: string | null; data: string | null };
export type DadosPulo = { numeroDocumento: string; data: string };

const AVISO_SAIDA =
  "Você marcou análise(s) como PULADA. Ao sair do MAC essa marca fica FIXA e não poderá mais ser desfeita. Sair mesmo assim?";

// Evita fixar à toa quando o React remonta a tela (modo de desenvolvimento): o cancelamento é no mount.
const fixarPendente = new Map<string, ReturnType<typeof setTimeout>>();

function fixarAgora(codigo: string) {
  try {
    void fetch("/api/mac/analise-pulada", {
      method: "POST", credentials: "include", keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo, acao: "fixar" }),
    });
  } catch { /* sem rede: a marca segue desfazível até a próxima saída */ }
}

export function usePularAnalise(codigo: string) {
  const [puladas, setPuladas] = useState<AnalisePulada[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const temPendentesRef = useRef(false);
  temPendentesRef.current = puladas.some((p) => !p.fixada);

  useEffect(() => {
    if (!codigo) return;
    const t = fixarPendente.get(codigo);
    if (t) { clearTimeout(t); fixarPendente.delete(codigo); }
    fetch(`/api/mac/analise-pulada?codigo=${encodeURIComponent(codigo)}`, { credentials: "include" })
      .then((r) => r.json()).then((j) => { if (j?.ok) setPuladas(j.puladas ?? []); }).catch(() => {});
    const aoFechar = () => { if (temPendentesRef.current) fixarAgora(codigo); };
    const aoSair = (e: BeforeUnloadEvent) => { if (temPendentesRef.current) { e.preventDefault(); e.returnValue = AVISO_SAIDA; } };
    window.addEventListener("pagehide", aoFechar);
    window.addEventListener("beforeunload", aoSair);
    return () => {
      window.removeEventListener("pagehide", aoFechar);
      window.removeEventListener("beforeunload", aoSair);
      if (temPendentesRef.current) fixarPendente.set(codigo, setTimeout(() => { fixarPendente.delete(codigo); fixarAgora(codigo); }, 50));
    };
  }, [codigo]);

  /** Marca (ou corrige) a análise como pulada. Nº do despacho/parecer e data são obrigatórios. Devolve true se gravou. */
  const pular = useCallback(async (numero: number, dados: DadosPulo): Promise<boolean> => {
    const atual = puladas.find((p) => p.numero === numero);
    if (atual?.fixada) return false;
    setSalvando(true); setErro("");
    try {
      const r = await fetch("/api/mac/analise-pulada", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo, numero, pulada: true, numero_documento: dados.numeroDocumento, data: dados.data }),
      });
      const j = await r.json();
      if (!j?.ok) { setErro(j?.erro || "Não foi possível alterar."); return false; }
      const nova: AnalisePulada = { numero, fixada: false, numeroDocumento: dados.numeroDocumento.trim(), data: dados.data };
      setPuladas((l) => [...l.filter((p) => p.numero !== numero), nova]);
      return true;
    } catch { setErro("Sem conexão: nada foi alterado."); return false; }
    finally { setSalvando(false); }
  }, [codigo, puladas]);

  const desfazer = useCallback(async (numero: number): Promise<boolean> => {
    const atual = puladas.find((p) => p.numero === numero);
    if (!atual || atual.fixada) return false;
    setSalvando(true); setErro("");
    try {
      const r = await fetch("/api/mac/analise-pulada", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo, numero, pulada: false }),
      });
      const j = await r.json();
      if (!j?.ok) { setErro(j?.erro || "Não foi possível desfazer."); return false; }
      setPuladas((l) => l.filter((p) => p.numero !== numero));
      return true;
    } catch { setErro("Sem conexão: nada foi alterado."); return false; }
    finally { setSalvando(false); }
  }, [codigo, puladas]);

  /**
   * Lista de análises que vai para despachos e pareceres: as puladas entram com a data e o nº do
   * despacho/parecer informados (sobrepõem a data calculada). `ate` = análise que está sendo emitida.
   * Marca antiga sem data (criada antes da regra) não entra: não há o que mostrar.
   */
  const comPuladas = useCallback(<T extends { numero: number; data?: string; despacho?: string }>(lista: T[], ate: number): T[] => {
    const mapa = new Map<number, T>(lista.map((x) => [x.numero, x]));
    for (const p of puladas) {
      if (p.numero > ate || !p.data || !p.numeroDocumento) continue;
      const [y, m, d] = p.data.slice(0, 10).split("-");
      const base = (mapa.get(p.numero) ?? { numero: p.numero }) as T;
      mapa.set(p.numero, { ...base, data: `${d}/${m}/${y}`, despacho: p.numeroDocumento });
    }
    return [...mapa.values()].sort((a, b) => a.numero - b.numero);
  }, [puladas]);

  /** Chame antes de qualquer botão que saia do MAC: pede confirmação quando há marca ainda desfazível. */
  const confirmarSaida = useCallback(() => !temPendentesRef.current || window.confirm(AVISO_SAIDA), []);

  return { puladas, salvando, erro, pular, desfazer, comPuladas, confirmarSaida };
}
