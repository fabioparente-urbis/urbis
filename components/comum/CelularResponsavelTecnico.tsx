"use client";
import { useEffect, useRef, useState } from "react";

// Campo "Celular do Responsável Técnico" — aparece SÓ para Administrador.
// Para os demais a rota devolve 403 e o componente não renderiza nada.
// O número vive em profissional_celular, fora da ficha (não vai ao MDP,
// URBI, Excel, documentos nem ao mobile).
export default function CelularResponsavelTecnico({ dados }: { dados: Record<string, any> }) {
  const v = (k: string) => String(dados?.[k]?.valor ?? "").trim();
  const q = new URLSearchParams({
    nomeEng: v("nome_responsavel_eng"), crea: v("crea"),
    nomeArq: v("nome_responsavel_arq"), cau: v("cau"),
  });
  const chave = q.toString();
  const [liberado, setLiberado] = useState(false);
  const [celular, setCelular] = useState("");
  const [nome, setNome] = useState("");
  const [orig, setOrig] = useState("");
  const [msg, setMsg] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [aberto, setAberto] = useState(false);
  const ultima = useRef("");

  useEffect(() => {
    if (chave === ultima.current) return;
    const t = setTimeout(async () => {
      ultima.current = chave;
      try {
        const r = await fetch(`/api/admin/profissional-celular?${chave}`);
        if (!r.ok) { setLiberado(false); return; }
        const j = await r.json();
        setLiberado(true); setCelular(j.celular ?? ""); setNome(j.nome ?? ""); setOrig((j.celular ?? "") + "|" + (j.nome ?? "")); setMsg("");
      } catch { setLiberado(false); }
    }, 600);
    return () => clearTimeout(t);
  }, [chave]);

  if (!liberado) return null;

  async function salvar() {
    setOcupado(true); setMsg("");
    try {
      const r = await fetch("/api/admin/profissional-celular", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ celular, nomeContato: nome, nomeEng: v("nome_responsavel_eng"), crea: v("crea"), nomeArq: v("nome_responsavel_arq"), cau: v("cau") }),
      });
      const j = await r.json();
      if (j.ok) { setOrig((j.celular ?? "") + "|" + (j.nome ?? "")); setMsg("Salvo"); }
      else setMsg(j.erro === "SEM_PROFISSIONAL_NO_PROCESSO" ? "Preencha o nome do responsável na ficha primeiro" : "Erro ao salvar");
    } catch { setMsg("Erro ao salvar"); }
    setOcupado(false);
  }

  // Altura zero + posição absoluta: o campo nunca empurra a ficha para baixo.
  // Fica fechado; só abre ao clicar no cadeado.
  return (
    <div className="relative h-0 z-40">
      <div className="absolute right-0 top-0 flex flex-col items-end">
        <button onClick={() => setAberto((a) => !a)} title="Contato do responsável (só você vê)"
          className="rounded bg-[var(--bg-card)] border border-[var(--border)] px-2 py-0.5 text-xs opacity-60 hover:opacity-100">
          🔒{celular || nome ? " contato" : ""}
        </button>
        {aberto && (
          <div className="mt-1 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-xs shadow-xl max-w-[90vw]">
            <label className="font-semibold text-[var(--text-secondary)]">Celular do Responsável Técnico ou outro contato</label>
            <input value={celular} onChange={(e) => setCelular(e.target.value)} placeholder="(00) 00000-0000"
              className="w-44 rounded bg-[var(--bg-secondary)] border border-[var(--border)] px-2 py-1 text-sm" />
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome (responsável, despachante…)"
              className="w-56 rounded bg-[var(--bg-secondary)] border border-[var(--border)] px-2 py-1 text-sm" />
            <button onClick={salvar} disabled={ocupado || celular + "|" + nome === orig}
              className="rounded bg-[var(--bg-secondary)] px-3 py-1 font-bold disabled:opacity-40">Salvar</button>
            <span className="text-[var(--text-muted)]">{msg || "só você vê"}</span>
          </div>
        )}
      </div>
    </div>
  );
}
