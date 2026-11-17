"use client";
/**
 * "Enviou no SEI?" — modo "popup" (MAC): janela piscando com o botão SIM, aparece ao abrir a tela
 * se houver documento pendente e logo após emitir (evento "urbis:documento-emitido").
 * Modo "faixa" (LIP): aviso "NÃO ENVIADO" com botão para confirmar. Só aparece nos slots liberados.
 */
import { useCallback, useEffect, useState } from "react";

type Pend = { id: string; tipo: string; numero: string | null };
const ROTULO: Record<string, string> = { despacho: "Despacho", interno: "Despacho interno", indeferimento: "Parecer de indeferimento", arquivamento: "Parecer de arquivamento" };
const nome = (p: Pend) => `${ROTULO[p.tipo] ?? p.tipo}${p.numero ? ` nº ${p.numero}` : ""}`;

export default function AvisoEnviadoSei({ codigo, modo }: { codigo: string; modo: "popup" | "faixa" }) {
  const [pend, setPend] = useState<Pend[]>([]);
  const [fechado, setFechado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    if (!codigo) return;
    try {
      const r = await fetch(`/api/mdp/enviado-sei?processo=${encodeURIComponent(codigo)}`, { credentials: "include" });
      const j = await r.json();
      if (j?.ok) setPend(j.pendentes ?? []);
    } catch {}
  }, [codigo]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    // o registro no MDP é gravado em segundo plano: espera um instante antes de reconsultar
    const h = () => { setFechado(false); setTimeout(carregar, 1500); setTimeout(carregar, 5000); };
    window.addEventListener("urbis:documento-emitido", h);
    return () => window.removeEventListener("urbis:documento-emitido", h);
  }, [carregar]);

  async function confirmar(id: string) {
    setSalvando(true); setErro("");
    try {
      const r = await fetch("/api/mdp/enviado-sei", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.erro ?? `HTTP ${r.status}`);
      setPend((p) => p.filter((x) => x.id !== id));
    } catch (e: any) { setErro(e?.message ?? "Falha ao confirmar"); }
    setSalvando(false);
  }

  if (pend.length === 0) return null;
  const atual = pend[0];

  if (modo === "faixa") {
    return (
      <div role="alert" style={{ margin: "8px 0", padding: "10px 14px", borderRadius: 8, background: "#fee2e2", border: "1px solid #dc2626", color: "#7f1d1d", fontWeight: 700, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <span>🚫 NÃO ENVIADO AO SEI — {pend.map(nome).join("; ")}</span>
        <button disabled={salvando} onClick={() => confirmar(atual.id)} style={{ padding: "4px 12px", borderRadius: 6, border: "none", background: "#dc2626", color: "#fff", fontWeight: 700, cursor: "pointer" }}>Enviei: {nome(atual)}</button>
        {erro && <span style={{ fontWeight: 400 }}>{erro}</span>}
      </div>
    );
  }

  if (fechado) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{`@keyframes urbisPisca{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.55;transform:scale(1.03)}}`}</style>
      <div style={{ background: "#fff", color: "#111", borderRadius: 14, padding: "28px 36px", textAlign: "center", maxWidth: 420, boxShadow: "0 10px 40px rgba(0,0,0,.4)", animation: "urbisPisca 1.1s infinite" }}>
        <div style={{ fontSize: 26, fontWeight: 800, marginBottom: 8 }}>Enviou no SEI?</div>
        <div style={{ fontSize: 14, marginBottom: 18 }}>{nome(atual)}{pend.length > 1 ? ` (+${pend.length - 1} pendente${pend.length > 2 ? "s" : ""})` : ""}</div>
        <button disabled={salvando} onClick={() => confirmar(atual.id)} style={{ padding: "12px 48px", fontSize: 18, fontWeight: 800, borderRadius: 10, border: "none", background: "#16a34a", color: "#fff", cursor: "pointer" }}>SIM</button>
        {erro && <div style={{ color: "#b91c1c", marginTop: 10, fontSize: 13 }}>{erro}</div>}
        <div><button onClick={() => setFechado(true)} style={{ marginTop: 14, background: "none", border: "none", color: "#6b7280", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>responder depois</button></div>
      </div>
    </div>
  );
}
