"use client";
// Lixeira do admin — processos e análises excluídos.
//
// Excluir deixou de apagar. Aqui o administrador vê o que foi para o
// lixo, com quem criou, quem excluiu e, principalmente, SE SAIU
// DOCUMENTO: processo que já gerou despacho ou parecer chegou ao
// interessado, e apagar isso de vez apaga a prova.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, RotateCcw, Loader2, AlertTriangle } from "lucide-react";

type Registro = {
  id: string;
  codigo: string;
  assunto: string;
  interessado?: string | null;
  numero_analise?: number;
  status?: string;
  criado_em: string | null;
  criado_por: string | null;
  excluido_em: string | null;
  excluido_por: string | null;
  excluido_motivo: string | null;
  analises?: number;
  documentos: string[];
};

const dt = (v: string | null) =>
  v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

export default function LixeiraPage() {
  const router = useRouter();
  const [aba, setAba] = useState<"processos" | "analises">("processos");
  const [dados, setDados] = useState<Registro[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function carregar(qual = aba) {
    setCarregando(true); setErro("");
    try {
      const res = await fetch(`/api/admin/lixeira${qual === "analises" ? "?tipo=analises" : ""}`);
      const json = await res.json();
      if (!json.ok) { setErro(json.erro || "Falha ao carregar."); setDados([]); return; }
      setDados(json.data ?? []);
    } catch (e: any) { setErro(e?.message || "Erro inesperado."); } finally { setCarregando(false); }
  }
  useEffect(() => { carregar(aba); }, [aba]);

  async function restaurar(r: Registro) {
    setOcupado(r.id);
    const res = await fetch("/api/admin/lixeira", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: r.id, tipo: aba }),
    });
    const json = await res.json();
    setOcupado(null);
    if (!json.ok) { setErro(json.erro || "Falha ao restaurar."); return; }
    carregar();
  }

  async function apagarDeVez(r: Registro) {
    const aviso = r.documentos.length
      ? `\n\nATENÇÃO: este registro tem documento emitido (${r.documentos.join(", ")}). Apagar remove a prova de que ele saiu.`
      : "";
    if (!confirm(`Apagar DEFINITIVAMENTE ${r.codigo}?\n\nNão há como desfazer.${aviso}`)) return;
    setOcupado(r.id);
    const res = await fetch("/api/admin/lixeira", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: r.id, tipo: aba }),
    });
    const json = await res.json();
    setOcupado(null);
    if (!json.ok) { setErro(json.erro || "Falha ao apagar."); return; }
    carregar();
  }

  async function esvaziar() {
    const comDoc = dados.filter((d) => d.documentos.length).length;
    if (!confirm(`Esvaziar a lixeira: ${dados.length} registro(s) apagados para sempre.${comDoc ? `\n\n${comDoc} tem documento emitido.` : ""}\n\nConfirma?`)) return;
    if (!confirm("Última confirmação. Não há como desfazer.")) return;
    setOcupado("tudo");
    const res = await fetch("/api/admin/lixeira", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tudo: true, tipo: aba }),
    });
    const json = await res.json();
    setOcupado(null);
    if (!json.ok) { setErro(json.erro || "Falha ao esvaziar."); return; }
    carregar();
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <header className="bg-[var(--bg-primary)] border-b border-[var(--border)] px-8 py-4 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button onClick={() => router.push("/")} className="bg-[var(--primary)] hover:bg-[var(--accent-hover)] text-white font-bold px-3 py-1.5 rounded text-sm">🏠 Home</button>
          <button onClick={() => router.push("/admin/configuracoes")} className="bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] px-3 py-1.5 rounded text-sm">← Configurações</button>
          <h1 className="text-xl font-semibold inline-flex items-center gap-2 ml-4"><Trash2 size={20} /> Lixeira</h1>
        </div>
        <div className="flex gap-1">
          {(["processos", "analises"] as const).map((k) => (
            <button key={k} onClick={() => setAba(k)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${aba === k ? "bg-[var(--accent)] text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:bg-[var(--surface)]"}`}>
              {k === "processos" ? "📁 Processos" : "📋 Análises"}
            </button>
          ))}
        </div>
      </header>

      <main className="p-8 max-w-6xl mx-auto">
        <p className="text-sm text-[var(--text-muted)] mb-4">
          Nada aqui foi apagado do banco — tudo pode voltar. Só o botão “Apagar de vez” é irreversível, e ele é exclusivo do Administrador.
        </p>
        {erro && <div className="mb-4 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200">{erro}</div>}

        {carregando ? (
          <div className="text-[var(--text-muted)] text-sm inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Carregando…</div>
        ) : dados.length === 0 ? (
          <div className="text-[var(--text-muted)] text-sm border border-dashed border-[var(--border)] rounded-xl px-4 py-10 text-center">
            Lixeira vazia.
          </div>
        ) : (<>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <span className="text-sm text-[var(--text-secondary)]">{dados.length} registro(s)</span>
            <button onClick={esvaziar} disabled={ocupado === "tudo"}
              className="inline-flex items-center gap-1.5 border border-[var(--error)] text-[var(--error)] hover:bg-[var(--error)] hover:text-white px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50">
              <Trash2 size={13} /> Esvaziar lixeira
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {dados.map((r) => (
              <div key={r.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 flex gap-4 items-start flex-wrap">
                <div className="flex-1 min-w-[260px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-[var(--accent)]">{r.codigo}</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-[var(--bg-secondary)] text-[var(--text-secondary)]">{r.assunto}</span>
                    {r.numero_analise !== undefined && (
                      <span className="text-xs px-2 py-0.5 rounded bg-[var(--bg-secondary)] text-[var(--text-secondary)]">Análise {r.numero_analise}</span>
                    )}
                  </div>
                  {r.interessado && <p className="text-sm text-[var(--text-secondary)] mt-1">{r.interessado}</p>}
                  <p className="text-xs text-[var(--text-muted)] mt-2">
                    Criado em {dt(r.criado_em)}{r.criado_por ? ` por ${r.criado_por}` : ""}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    Excluído em {dt(r.excluido_em)}{r.excluido_por ? ` por ${r.excluido_por}` : ""}
                    {r.excluido_motivo ? ` — ${r.excluido_motivo}` : ""}
                  </p>
                  {r.analises !== undefined && r.analises > 0 && (
                    <p className="text-xs text-[var(--text-muted)]">{r.analises} análise(s) vinculada(s)</p>
                  )}
                  {r.documentos.length > 0 && (
                    <p className="text-xs text-[var(--warning)] mt-1 inline-flex items-center gap-1">
                      <AlertTriangle size={12} /> Documento emitido: {r.documentos.join(" · ")}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => restaurar(r)} disabled={ocupado === r.id}
                    className="inline-flex items-center gap-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50">
                    <RotateCcw size={13} /> Restaurar
                  </button>
                  <button onClick={() => apagarDeVez(r)} disabled={ocupado === r.id}
                    className="inline-flex items-center gap-1.5 border border-[var(--error)] text-[var(--error)] hover:bg-[var(--error)] hover:text-white px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50">
                    <Trash2 size={13} /> Apagar de vez
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>)}
      </main>
    </div>
  );
}
