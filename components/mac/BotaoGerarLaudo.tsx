// components/mac/BotaoGerarLaudo.tsx
"use client";

import { useState } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ROTULOS_AREA, type VeredictoCompatibilidadeArea } from "@/lib/compatibilidadeArea";

interface Props {
  processoId: string;
  disabled?: boolean;
  mrpData?: { assuntoNome?: string; interessado?: string | null; areaConstruida?: number; bairro?: string | null; numeroSei?: string | null; numeroFisico?: string | null; };
  // Callback opcional disparado APÓS o download bem-sucedido do laudo.
  // Usado, por exemplo, para gravar uma tag permanente no processo.
  onSuccess?: () => void;
}

export function BotaoGerarLaudo({ processoId, disabled, onSuccess, mrpData }: Props) {
  const [gerando, setGerando] = useState(false);
  // Só é preenchido quando o backend recusa gerar (409) por área
  // divergente — Slot 1 (Regularização SEI). Ver lib/compatibilidadeArea.ts.
  const [alertaArea, setAlertaArea] = useState<VeredictoCompatibilidadeArea | null>(null);

  async function handleGerar(confirmarDivergenciaArea = false) {
    if (!processoId || gerando) return;
    setGerando(true);
    try {
      const res = await fetch("/api/mac/gerar-laudo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processoId, confirmarDivergenciaArea }),
      });

      if (res.status === 409) {
        const err = await res.json();
        if (err.precisaConfirmar && err.veredictoArea) {
          setAlertaArea(err.veredictoArea as VeredictoCompatibilidadeArea);
          return;
        }
      }

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detalhe ?? err.erro ?? "Erro desconhecido");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = cd.match(/filename="?([^"]+)"?/);
      a.download = match?.[1] ?? "laudo.xlsm";
      a.href = url;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Laudo gerado com sucesso!");
      onSuccess?.();
      // Registro MRP
      if (mrpData) {
        fetch("/api/mrp/registros", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            processo_codigo: processoId,
            tipo_despacho: "laudo",
            assunto: mrpData.assuntoNome ?? "Regularização SEI",
            interessado: mrpData.interessado ?? null,
            area_construida: mrpData.areaConstruida ?? 0,
            bairro: mrpData.bairro ?? null,
            numero_sei: mrpData.numeroSei ?? processoId,
            numero_fisico: mrpData.numeroFisico ?? null,
            auto_gerado: true,
          }),
        }).then(async r => { const j = await r.json(); console.log("[MRP-LAUDO]", r.status, JSON.stringify(j)); }).catch(e => console.error("[MRP-LAUDO] ERRO:", e?.message));
      }
      // Registro MAP
      fetch("/api/auditoria/registrar", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modulo: "DESPACHO", acao: "LAUDO_EXCEL_GERADO", processo_codigo: processoId, origem: "MANUAL" }),
      }).catch(() => {});
    } catch (e: any) {
      toast.error(`Erro ao gerar laudo: ${e.message}`);
    } finally {
      setGerando(false);
    }
  }

  return (
    <>
      <button
        onClick={() => handleGerar()}
        disabled={disabled || gerando}
        className="w-full bg-[var(--success)] hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-[var(--primary-text)] font-bold py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
      >
        {gerando
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : <FileSpreadsheet className="h-4 w-4" />}
        {gerando ? "⏳ Gerando..." : "📊 Gerar Laudo Excel"}
      </button>

      {alertaArea && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-card)] border-2 border-red-600 rounded-xl p-6 w-full max-w-lg shadow-2xl">
            <h2 className="text-lg font-bold text-red-400 mb-1">🚨 ÁREA DIVERGENTE ENTRE DOCUMENTOS</h2>
            <p className="text-xs text-[var(--text-muted)] mb-4">
              Verificação de compatibilidade de área — Regularização SEI
            </p>
            <p className="text-sm text-[var(--text-primary)] mb-3">
              A área a regularizar não está igual em todos os documentos do processo:
            </p>
            <div className="bg-[var(--bg-secondary)] rounded-lg p-3 mb-4 text-xs space-y-2">
              {alertaArea.divergencias.map((d, i) => (
                <p key={i} className="text-[var(--text-secondary)]">
                  <strong className="text-[var(--text-primary)]">{ROTULOS_AREA[d.a]}</strong>: {d.valorA.toFixed(2)}m²
                  {" "}<span className="text-[var(--text-muted)]">×</span>{" "}
                  <strong className="text-[var(--text-primary)]">{ROTULOS_AREA[d.b]}</strong>: {d.valorB.toFixed(2)}m²
                  {" "}<span className="text-[var(--text-muted)]">(diferença de {d.diferenca.toFixed(2)}m²)</span>
                </p>
              ))}
            </div>
            {alertaArea.criticoFiscalizacao && (
              <p className="text-sm text-red-300 font-semibold mb-4">
                A área apontada pela FISCALIZAÇÃO (Termo de Vistoria) deve prevalecer — é a medição feita
                in loco pelo fiscal. Confira os documentos antes de emitir o laudo.
              </p>
            )}
            <p className="text-xs text-[var(--text-muted)] mb-4">
              Você pode corrigir os campos de área no LIP antes de gerar o laudo, ou seguir mesmo assim —
              a divergência ficará registrada nas observações do documento.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setAlertaArea(null)}
                className="flex-1 bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] font-bold py-2 rounded-lg text-sm">
                Cancelar e revisar
              </button>
              <button onClick={() => { setAlertaArea(null); void handleGerar(true); }}
                className="flex-1 bg-red-700 hover:bg-red-600 text-white font-bold py-2 rounded-lg text-sm">
                Gerar mesmo assim
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
