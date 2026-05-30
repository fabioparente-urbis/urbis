"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// ===========================================================================
// Tela de Backup & Restauração — somente Administrador
// ===========================================================================

type Tipo = "processos" | "usuarios" | "prompts" | "config" | "tudo";

type Secao = {
  tipo: Tipo;
  titulo: string;
  emoji: string;
  descricao: string;
  tabelas: string[];
  prefixoArquivo: string; // urbis_backup_<prefixo>_YYYY-MM-DD.json
};

const SECOES: Secao[] = [
  {
    tipo: "processos",
    titulo: "Processos",
    emoji: "📂",
    descricao:
      "Processos abertos, análises MAC, histórico MAC, resultados LIP e documentos vinculados.",
    tabelas: [
      "processos",
      "analises_mac",
      "mac_historico",
      "lip_resultados",
      "documentos",
      "documentos_processo",
      "processo_historico",
    ],
    prefixoArquivo: "processos",
  },
  {
    tipo: "usuarios",
    titulo: "Usuários",
    emoji: "👥",
    descricao: "Cadastro de usuários, perfis e gerências.",
    tabelas: ["usuarios"],
    prefixoArquivo: "usuarios",
  },
  {
    tipo: "prompts",
    titulo: "Prompts",
    emoji: "📝",
    descricao: "Prompts LIP (lip_prompts).",
    tabelas: ["lip_prompts"],
    prefixoArquivo: "prompts",
  },
  {
    tipo: "config",
    titulo: "Configurações e Estrutura",
    emoji: "⚙️",
    descricao:
      "Abas/campos LIP, modelos e itens de checklist MAC, configurações URBI, legislação e logradouros.",
    tabelas: [
      "lip_abas",
      "lip_campos",
      "mac_checklist_modelos",
      "mac_checklist_itens",
      "urbi_config",
      "urbi_legislacao",
      "logradouros",
    ],
    prefixoArquivo: "config",
  },
  {
    tipo: "tudo",
    titulo: "Backup Geral (tudo)",
    emoji: "🗄",
    descricao:
      "Exporta todas as tabelas acima em um único arquivo, com chaves separadas por tabela.",
    tabelas: [],
    prefixoArquivo: "COMPLETO",
  },
];

function hoje(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function baixarJson(nomeArquivo: string, conteudo: unknown) {
  const blob = new Blob([JSON.stringify(conteudo, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function BackupPage() {
  const router = useRouter();
  const [perfis, setPerfis] = useState<string[]>([]);
  const [carregandoPerfil, setCarregandoPerfil] = useState(true);
  const [estado, setEstado] = useState<
    Record<Tipo, { exportando?: boolean; importando?: boolean; msg?: string; erro?: boolean }>
  >({
    processos: {},
    usuarios: {},
    prompts: {},
    config: {},
    tudo: {},
  });
  const inputsRef = useRef<Record<Tipo, HTMLInputElement | null>>({
    processos: null,
    usuarios: null,
    prompts: null,
    config: null,
    tudo: null,
  });

  const souAdmin = perfis.includes("Administrador");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        const json = await res.json();
        if (json.ok) {
          const arr: string[] =
            Array.isArray(json.data?.perfis) && json.data.perfis.length > 0
              ? json.data.perfis
              : json.data?.perfil
                ? [json.data.perfil]
                : [];
          setPerfis(arr);
        }
      } catch {
        /* mantém vazio → bloqueia */
      } finally {
        setCarregandoPerfil(false);
      }
    })();
  }, []);

  function setMsg(tipo: Tipo, msg: string, erro = false) {
    setEstado((prev) => ({ ...prev, [tipo]: { ...prev[tipo], msg, erro } }));
  }

  async function gerarSnapshotBdi(origem: string): Promise<string | null> {
    // Snapshot estático de mrp_registros em bdi_snapshots. Best-effort:
    // qualquer erro é apenas logado e não interrompe o backup principal.
    try {
      const res = await fetch("/api/admin/bdi/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origem }),
      });
      const json = await res.json();
      if (!json.ok) {
        console.warn("Falha ao gerar snapshot BDI:", json.erro);
        return null;
      }
      return ` 📸 Snapshot BDI registrado (${
        (json.snapshot?.total_registros ?? 0).toLocaleString("pt-BR")
      } regs).`;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("Falha de rede ao gerar snapshot BDI:", msg);
      return null;
    }
  }

  async function exportar(secao: Secao) {
    setEstado((prev) => ({
      ...prev,
      [secao.tipo]: { exportando: true, msg: "Gerando backup..." },
    }));
    try {
      const res = await fetch(`/api/admin/backup?tipo=${secao.tipo}`);
      const json = await res.json();
      if (!json.ok) {
        setMsg(secao.tipo, `Erro: ${json.erro || "falha desconhecida"}`, true);
        return;
      }
      const nomeArquivo = `urbis_backup_${secao.prefixoArquivo}_${hoje()}.json`;
      baixarJson(nomeArquivo, json);
      const totalLinhas = Object.values(
        (json.dados as Record<string, unknown[]>) || {},
      ).reduce((acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0), 0);

      // Side effect: consolida mrp_registros em bdi_snapshots (JSON estático).
      const sufixoSnapshot = await gerarSnapshotBdi(`backup_${secao.tipo}`);

      setMsg(
        secao.tipo,
        `✅ Exportado ${totalLinhas.toLocaleString("pt-BR")} registros em ${nomeArquivo}.${
          sufixoSnapshot ?? ""
        }`,
      );
    } catch (e: any) {
      setMsg(secao.tipo, `Erro: ${e?.message || "falha de rede"}`, true);
    } finally {
      setEstado((prev) => ({
        ...prev,
        [secao.tipo]: { ...prev[secao.tipo], exportando: false },
      }));
    }
  }

  function abrirSeletor(tipo: Tipo) {
    inputsRef.current[tipo]?.click();
  }

  async function importar(secao: Secao, file: File) {
    if (
      !confirm(
        `Confirmar importação do arquivo "${file.name}" para a seção "${secao.titulo}"?\n\n` +
          `Atenção: registros com mesmo ID serão SOBRESCRITOS (upsert).`,
      )
    ) {
      return;
    }
    setEstado((prev) => ({
      ...prev,
      [secao.tipo]: { importando: true, msg: "Lendo arquivo..." },
    }));
    try {
      const texto = await file.text();
      let parsed: any;
      try {
        parsed = JSON.parse(texto);
      } catch {
        setMsg(secao.tipo, "Arquivo não é um JSON válido.", true);
        return;
      }
      const dados = parsed?.dados ?? parsed; // aceita { dados: {...} } ou {...} direto
      if (!dados || typeof dados !== "object") {
        setMsg(
          secao.tipo,
          "Estrutura do JSON inválida — esperado { dados: { tabela: [...] } }.",
          true,
        );
        return;
      }
      setMsg(secao.tipo, "Importando para o banco...");
      const res = await fetch("/api/admin/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: secao.tipo, dados }),
      });
      const json = await res.json();
      if (!json.ok && !json.relatorio) {
        setMsg(secao.tipo, `Erro: ${json.erro || "falha na importação"}`, true);
        return;
      }
      const linhas = Object.entries(
        json.relatorio as Record<string, { inseridos: number; erro?: string }>,
      );
      const total = linhas.reduce((acc, [, r]) => acc + (r.inseridos || 0), 0);
      const comErro = linhas.filter(([, r]) => r.erro);
      const resumo = `✅ Importados ${total.toLocaleString("pt-BR")} registros em ${linhas.length} tabela(s).`;
      const detErros = comErro.length
        ? ` ⚠️ ${comErro.length} tabela(s) com erro: ${comErro.map(([t, r]) => `${t} (${r.erro})`).join("; ")}`
        : "";
      setMsg(secao.tipo, resumo + detErros, comErro.length > 0);
    } catch (e: any) {
      setMsg(secao.tipo, `Erro: ${e?.message || "falha de rede"}`, true);
    } finally {
      setEstado((prev) => ({
        ...prev,
        [secao.tipo]: { ...prev[secao.tipo], importando: false },
      }));
      // limpa o input para permitir reimportar o mesmo arquivo
      const input = inputsRef.current[secao.tipo];
      if (input) input.value = "";
    }
  }

  if (carregandoPerfil) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--primary-text)] p-6">
        <p className="text-[var(--text-muted)] text-sm">Carregando...</p>
      </div>
    );
  }

  if (!souAdmin) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--primary-text)] p-6">
        <div className="max-w-xl mx-auto bg-[var(--surface)] border border-red-700 rounded-xl p-6 mt-12">
          <h1 className="text-xl font-bold mb-2">🚫 Acesso restrito</h1>
          <p className="text-[var(--text-secondary)] text-sm mb-4">
            Esta tela é exclusiva do perfil <b>Administrador</b>.
          </p>
          <button
            onClick={() => router.push("/")}
            className="bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--primary-text)] px-4 py-2 rounded-lg text-sm font-medium"
          >
            🏠 Voltar para a home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--primary-text)] p-4 md:p-6">
      <div className="flex items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/")}
            className="bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] px-3 py-1.5 rounded text-sm font-medium transition-colors"
          >
            🏠 Home
          </button>
          <div>
            <h1 className="text-2xl font-bold">🗄 Backup & Restauração</h1>
            <p className="text-[var(--text-muted)] text-sm">
              Exporte os dados do URBIS em arquivos JSON e restaure quando precisar.
              Importação faz <b>upsert por id</b> (registros existentes são sobrescritos).
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {SECOES.map((secao) => {
          const st = estado[secao.tipo];
          const tabelasResumo =
            secao.tipo === "tudo"
              ? "Todas as tabelas das seções acima"
              : secao.tabelas.join(", ");
          const nomeArquivo = `urbis_backup_${secao.prefixoArquivo}_${hoje()}.json`;
          return (
            <div
              key={secao.tipo}
              className={`bg-[var(--surface)] border rounded-xl p-5 flex flex-col gap-3 ${
                secao.tipo === "tudo"
                  ? "border-purple-700 lg:col-span-2"
                  : "border-[var(--border)]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">
                    {secao.emoji} {secao.titulo}
                  </h2>
                  <p className="text-[var(--text-muted)] text-sm mt-1">{secao.descricao}</p>
                </div>
              </div>

              <div className="text-xs text-[var(--text-muted)]">
                <div>
                  <span className="font-semibold text-[var(--text-muted)]">Tabelas:</span>{" "}
                  <span className="font-mono">{tabelasResumo}</span>
                </div>
                <div className="mt-1">
                  <span className="font-semibold text-[var(--text-muted)]">Arquivo:</span>{" "}
                  <span className="font-mono">{nomeArquivo}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mt-1">
                <button
                  onClick={() => exportar(secao)}
                  disabled={st.exportando || st.importando}
                  className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-[var(--primary-text)] font-bold px-4 py-2 rounded-lg text-sm transition-colors"
                  title="Gerar Backup (exporta a seção e registra snapshot BDI)"
                >
                  {st.exportando ? "Gerando backup..." : "⬇ Gerar Backup"}
                </button>
                <button
                  onClick={() => abrirSeletor(secao.tipo)}
                  disabled={st.exportando || st.importando}
                  className="bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-[var(--primary-text)] font-bold px-4 py-2 rounded-lg text-sm transition-colors"
                >
                  {st.importando ? "Importando..." : "⬆ Importar"}
                </button>
                <input
                  ref={(el) => {
                    inputsRef.current[secao.tipo] = el;
                  }}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) importar(secao, f);
                  }}
                />
              </div>

              {st.msg && (
                <div
                  className={`text-xs px-3 py-2 rounded-lg border ${
                    st.erro
                      ? "bg-red-900/50 border-red-700 text-red-200"
                      : "bg-[var(--bg-primary)] border-[var(--border)] text-[var(--text-secondary)]"
                  }`}
                >
                  {st.msg}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-xs text-[var(--text-muted)]">
        <p className="font-semibold text-[var(--text-secondary)] mb-1">⚠️ Cuidados na restauração</p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            A importação faz <b>upsert por id</b>: registros com mesmo id são
            sobrescritos; novos são inseridos.
          </li>
          <li>
            Para uma restauração completa do zero, use o <b>Backup Geral</b> — as
            tabelas são importadas em ordem (pai → filho) para respeitar chaves
            estrangeiras.
          </li>
          <li>
            Faça um Backup Geral antes de qualquer importação grande, para conseguir
            voltar atrás caso algo dê errado.
          </li>
        </ul>
      </div>
    </div>
  );
}
