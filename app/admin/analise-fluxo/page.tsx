"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, Loader2 } from "lucide-react";
import { isPerfilIrrestrito } from "@/lib/perfis";

/**
 * /admin/analise-fluxo — Fase 12 do plano de leitura de PDF (§4.5, "Painel de gestão").
 *
 * Módulo de Análise de Fluxo (Módulo B do plano): mostra, a partir de `fluxo_processo_eventos`
 * (Fase 10) e `agregarPortfolio` (Fase 11), quantos processos ficam em cada faixa de tempo, onde
 * o processo típico trava (mediana por setor — não média, pra um outlier isolado não distorcer o
 * retrato do caso comum) e o retrabalho típico.
 *
 * Mesmo padrão de /admin/mhd: cliente, gate isPerfilIrrestrito redirecionando pra Home, dado vem
 * de uma rota própria (`/api/admin/fluxo/portfolio`). Só leitura — esta tela não escreve nada.
 *
 * Base de dados ainda pequena (5 processos em 11/09/2026, carga do acervo em andamento) — os
 * números aqui são reais, mas a amostra é pequena até a Fase 10 escalar.
 */

type FaixaTempo = "menos de 30 dias" | "30 a 90 dias" | "90 a 365 dias" | "mais de 1 ano";

type Portfolio = {
  totalProcessos: number;
  processosComDuracaoMedida: number;
  contagemPorFaixa: Record<FaixaTempo, number>;
  tempoTipicoPorSetor: { setor: string; medianaDias: number; processos: number }[];
  retrabalhoMedio: number;
};

const ORDEM_FAIXAS: FaixaTempo[] = ["menos de 30 dias", "30 a 90 dias", "90 a 365 dias", "mais de 1 ano"];

export default function AnaliseFluxoPage() {
  const router = useRouter();
  const [autorizado, setAutorizado] = useState<boolean | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        const json = await res.json().catch(() => null);
        const perfis = json?.data?.perfis?.length ? json.data.perfis : json?.data?.perfil;
        if (!json?.ok || !isPerfilIrrestrito(perfis)) { router.push("/"); return; }
        setAutorizado(true);
      } catch { router.push("/"); }
    })();
  }, [router]);

  useEffect(() => {
    if (autorizado !== true) return;
    fetch("/api/admin/fluxo/portfolio")
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) { setErro(j.erro ?? "Erro ao carregar."); return; }
        setPortfolio(j.portfolio);
      })
      .catch(() => setErro("Erro ao carregar."))
      .finally(() => setCarregando(false));
  }, [autorizado]);

  if (autorizado !== true) return null;

  const maxFaixa = portfolio ? Math.max(1, ...ORDEM_FAIXAS.map((f) => portfolio.contagemPorFaixa[f])) : 1;
  const maxSetor = portfolio?.tempoTipicoPorSetor.length
    ? Math.max(...portfolio.tempoTipicoPorSetor.map((s) => s.medianaDias))
    : 1;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center gap-2">
        <Activity className="h-5 w-5 text-[var(--accent)]" />
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Análise de Fluxo</h1>
      </div>

      {carregando && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      )}
      {erro && <p className="text-sm text-[var(--error)]">{erro}</p>}

      {portfolio && !carregando && (
        <div className="space-y-8">
          <p className="text-sm text-[var(--text-muted)]">
            {portfolio.totalProcessos} processo(s) carregados pela carga do acervo (Fase 10) — amostra ainda pequena, os números tendem a mudar conforme mais processos entrarem.
          </p>

          <section>
            <h2 className="mb-3 text-sm font-medium text-[var(--text-primary)]">Processos por tempo parado</h2>
            <div className="space-y-2">
              {ORDEM_FAIXAS.map((faixa) => {
                const n = portfolio.contagemPorFaixa[faixa];
                return (
                  <div key={faixa} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 text-xs text-[var(--text-muted)]">{faixa}</span>
                    <div className="h-4 flex-1 overflow-hidden rounded bg-[var(--bg-secondary)]">
                      <div
                        className="h-full rounded bg-[var(--accent)]"
                        style={{ width: `${(n / maxFaixa) * 100}%` }}
                      />
                    </div>
                    <span className="w-6 shrink-0 text-right text-xs text-[var(--text-primary)]">{n}</span>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <h2 className="mb-1 text-sm font-medium text-[var(--text-primary)]">Onde trava (típico por setor)</h2>
            <p className="mb-3 text-xs text-[var(--text-muted)]">
              Mediana entre os processos que passaram por cada setor — não média, pra um processo esquecido anos num setor não distorcer o retrato do caso comum.
            </p>
            {portfolio.tempoTipicoPorSetor.length === 0 && (
              <p className="text-sm text-[var(--text-muted)]">Sem dado suficiente ainda.</p>
            )}
            <div className="space-y-2">
              {portfolio.tempoTipicoPorSetor.slice(0, 10).map((s) => (
                <div key={s.setor} className="flex items-center gap-3">
                  <span className="w-48 shrink-0 truncate text-xs text-[var(--text-muted)]" title={s.setor}>{s.setor}</span>
                  <div className="h-4 flex-1 overflow-hidden rounded bg-[var(--bg-secondary)]">
                    <div
                      className="h-full rounded bg-[var(--info)]"
                      style={{ width: `${(s.medianaDias / maxSetor) * 100}%` }}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right text-xs text-[var(--text-primary)]">{s.medianaDias} dias</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-1 text-sm font-medium text-[var(--text-primary)]">Retrabalho</h2>
            <p className="text-sm text-[var(--text-primary)]">
              Mediana de {portfolio.retrabalhoMedio} despacho(s) de pendência/diligência por processo.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
