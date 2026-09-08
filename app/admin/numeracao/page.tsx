"use client";
// Estorno de numeração — desfaz uma emissão feita por engano.
//
// O admin digita processo + tipo + número; a tela consulta o que existe
// (préviamente, sem apagar nada) e só libera o botão de estornar quando é
// o ÚLTIMO número consumido daquela faixa — reverter um número no meio
// deixaria buraco ou colidiria com o que já foi emitido depois (regra de
// numeração do CLAUDE.md).
//
// Nascida do pedido do Fábio em 08/09/2026, depois de reverter à mão (via
// script) o Despacho Interno nº 1663 do processo 24.5.000024350-0.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, AlertTriangle } from "lucide-react";
import { useAuditoria } from "@/hooks/useAuditoria";

type Levantamento = {
  ok: boolean;
  erro?: string;
  uso: { id: string; faixa_id: string; emitido_em: string; numero_analise: number | null } | null;
  faixa: { id: string; numero_inicial: number; numero_final: number; proximo: number; usuario_id: string } | null;
  seguro: boolean;
  motivoInseguro: string | null;
  mdp: { id: string; tipo: string; destinatario: string | null; criado_em: string }[];
  mrp: { id: string; tipo_despacho: string; criado_em: string }[];
  tags: number;
  analises: { id: string; numero_analise: number; coluna: string }[];
};

const dt = (v: string | null) =>
  v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

export default function NumeracaoEstornoPage() {
  const router = useRouter();
  const { registrar } = useAuditoria();

  const [processo, setProcesso] = useState("");
  const [tipo, setTipo] = useState<"despacho" | "parecer">("despacho");
  const [numero, setNumero] = useState("");
  const [consultando, setConsultando] = useState(false);
  const [estornando, setEstornando] = useState(false);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<Levantamento | null>(null);
  const [feito, setFeito] = useState<{ mensagem: string } | null>(null);

  async function consultar() {
    setErro(""); setResultado(null); setFeito(null);
    if (!processo.trim() || !numero.trim()) { setErro("Informe processo e número."); return; }
    setConsultando(true);
    try {
      const r = await fetch(`/api/admin/numeracao/estornar?processo=${encodeURIComponent(processo.trim())}&tipo=${tipo}&numero=${encodeURIComponent(numero.trim())}`, { credentials: "include" });
      const j = await r.json();
      if (!j.ok) { setErro(j.erro || "Falha ao consultar."); return; }
      setResultado(j);
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado.");
    } finally {
      setConsultando(false);
    }
  }

  async function estornar() {
    if (!resultado?.seguro) return;
    const qtdVestigios = resultado.mdp.length + resultado.mrp.length + resultado.tags + resultado.analises.length;
    const aviso = qtdVestigios
      ? `\n\nIsso apaga ${resultado.mdp.length} registro(s) de MDP, ${resultado.mrp.length} de MRP, ${resultado.tags} tag(s) do processo e limpa ${resultado.analises.length} coluna(s) de análise do MAC.`
      : "";
    if (!confirm(`Estornar o número ${numero} (${tipo}) do processo ${processo}?${aviso}\n\nNão há como desfazer.`)) return;
    if (!confirm("Última confirmação. Confirma o estorno?")) return;

    setEstornando(true); setErro("");
    try {
      const r = await fetch("/api/admin/numeracao/estornar", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processo: processo.trim(), tipo, numero: Number(numero) }),
      });
      const j = await r.json();
      if (!j.ok) { setErro(j.erro || "Falha ao estornar."); return; }
      setFeito({ mensagem: `Estornado. Próximo número livre da faixa: ${j.proximo}.` });
      setResultado(null);
      registrar({ modulo: "ADMIN", acao: "NUMERACAO_ESTORNADA", processo_codigo: processo.trim(), detalhe: { tipo, numero: Number(numero), relatorio: j.relatorio } });
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado.");
    } finally {
      setEstornando(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <header className="bg-[var(--bg-primary)] border-b border-[var(--border)] px-8 py-4 flex items-center gap-2">
        <button onClick={() => router.push("/")} className="bg-[var(--primary)] hover:bg-[var(--accent-hover)] text-white font-bold px-3 py-1.5 rounded text-sm">🏠 Home</button>
        <button onClick={() => router.push("/admin/configuracoes")} className="bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] px-3 py-1.5 rounded text-sm">← Configurações</button>
        <h1 className="text-xl font-semibold inline-flex items-center gap-2 ml-4"><RotateCcw size={20} /> Estorno de Numeração</h1>
      </header>

      <main className="p-8 max-w-3xl mx-auto">
        <p className="text-sm text-[var(--text-muted)] mb-4">
          Devolve um número já consumido à faixa e apaga seu rastro no MDP, no MRP, na tag do
          processo e na coluna da análise no MAC. Só funciona para o <b>último</b> número emitido
          da faixa — reverter um número no meio deixaria buraco ou colidiria com o que já saiu
          depois. Nada disso é reversível.
        </p>

        {erro && <div className="mb-4 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200 flex items-center gap-2"><AlertTriangle size={16} /> {erro}</div>}
        {feito && <div className="mb-4 rounded-lg border border-emerald-800 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">✅ {feito.mensagem}</div>}

        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-5 flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1 col-span-2">
              <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide">Processo (código)</label>
              <input value={processo} onChange={(e) => { setProcesso(e.target.value); setResultado(null); }} placeholder="Ex: 24.5.000024350-0"
                className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide">Série</label>
              <select value={tipo} onChange={(e) => { setTipo(e.target.value as "despacho" | "parecer"); setResultado(null); }}
                className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="despacho">Despacho (interno ou ao interessado)</option>
                <option value="parecer">Parecer / Arquivamento</option>
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide">Número a estornar</label>
            <input value={numero} onChange={(e) => { setNumero(e.target.value.replace(/\D/g, "")); setResultado(null); }} placeholder="Ex: 1663" inputMode="numeric"
              className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-indigo-500 max-w-[160px]" />
          </div>
          <button onClick={consultar} disabled={consultando}
            className="self-start bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] disabled:opacity-50 border border-[var(--border)] text-[var(--text-primary)] font-bold px-4 py-2 rounded-lg text-sm transition-colors">
            {consultando ? "⏳ Consultando..." : "🔎 Consultar"}
          </button>
        </div>

        {resultado && (
          <div className="mt-5 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-5 flex flex-col gap-3">
            {!resultado.seguro ? (
              <div className="rounded-lg border border-amber-800 bg-amber-950/40 px-4 py-3 text-sm text-amber-200 flex items-start gap-2">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>{resultado.motivoInseguro}</span>
              </div>
            ) : (
              <>
                <p className="text-sm text-[var(--text-primary)]">
                  Número <b>{numero}</b> ({tipo}) do processo <b>{processo}</b>, emitido em {dt(resultado.uso?.emitido_em ?? null)} — é o último consumido da faixa (próximo atual: {resultado.faixa?.proximo}). Pode ser estornado.
                </p>
                <ul className="text-sm text-[var(--text-secondary)] list-disc list-inside">
                  <li>MDP: {resultado.mdp.length} registro(s) {resultado.mdp.map(m => m.tipo).join(", ")}</li>
                  <li>MRP: {resultado.mrp.length} registro(s)</li>
                  <li>Tag do processo: {resultado.tags} entrada(s)</li>
                  <li>Análise do MAC: {resultado.analises.length} coluna(s) {resultado.analises.map(a => `#${a.numero_analise}.${a.coluna}`).join(", ")}</li>
                </ul>
                <button onClick={estornar} disabled={estornando}
                  className="self-start bg-red-950/60 hover:bg-red-900 disabled:opacity-50 border border-red-800 text-red-200 font-bold px-4 py-2 rounded-lg text-sm transition-colors">
                  {estornando ? "⏳ Estornando..." : "🗑️ Estornar definitivamente"}
                </button>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
