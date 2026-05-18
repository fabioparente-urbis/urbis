"use client";

// app/admin/bdi/leis/page.tsx
//
// UI de indexacao das leis do BDI. Lista todas as entradas de
// `bdi_documentos_lei`, mostra status_indexacao e contagem de fragmentos,
// e expoe um botao "Upload PDF" por lei que envia o arquivo para
// /api/bdi/indexar-lei. Apos a indexacao, recarrega a lista.
//
// Acesso: apenas perfis irrestritos (Administrador / Diretora). O gate
// final esta no endpoint GET; aqui fazemos um redirect cliente para evitar
// que o usuario sem permissao caia em um 403 mudo.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isPerfilIrrestrito } from "@/lib/perfis";

type Lei = {
  id: string;
  titulo: string;
  tipo?: string | null;
  numero?: string | null;
  status_indexacao?: "pendente" | "indexado" | "erro" | string | null;
  fragmentos_count?: number;
  [k: string]: any;
};

type IndexResp = {
  ok: boolean;
  documento_id?: string;
  titulo?: string;
  arquivo?: string;
  paginas?: number;
  fragmentos_indexados?: number;
  duracao_ms?: number;
  erro?: string;
};

const S: Record<string, any> = {
  page: {
    background: "#0a0a0f",
    minHeight: "100vh",
    fontFamily: "'JetBrains Mono', monospace",
    color: "#e2e8f0",
  },
  header: {
    borderBottom: "1px solid #d946ef33",
    padding: "14px 28px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "#0d0d14",
  },
  content: { padding: "24px 28px" },
  card: {
    background: "#0d0d14",
    border: "1px solid #ffffff11",
    borderRadius: 8,
    padding: 18,
    marginBottom: 12,
  },
  label: { color: "#ffffff44", fontSize: 10, letterSpacing: 2, marginBottom: 6 },
  titulo: { color: "#f0f0f0", fontSize: 13, fontWeight: 600, marginBottom: 4 },
  meta: { color: "#ffffff55", fontSize: 11 },
  badge: (cor: string): React.CSSProperties => ({
    background: cor + "22",
    border: `1px solid ${cor}55`,
    color: cor,
    fontSize: 9,
    padding: "2px 10px",
    borderRadius: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  }),
  btn: (cor: string, disabled = false): React.CSSProperties => ({
    background: cor + "22",
    border: `1px solid ${cor}55`,
    color: cor,
    padding: "8px 16px",
    borderRadius: 4,
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 11,
    fontFamily: "inherit",
    letterSpacing: 1,
    opacity: disabled ? 0.4 : 1,
    whiteSpace: "nowrap",
  }),
};

function corDoStatus(status?: string | null): string {
  if (status === "indexado") return "#22c55e";
  if (status === "erro") return "#ef4444";
  return "#f59e0b"; // pendente / desconhecido
}

export default function BDILeisPage() {
  const router = useRouter();
  const [carregando, setCarregando] = useState(true);
  const [autorizado, setAutorizado] = useState(false);
  const [leis, setLeis] = useState<Lei[]>([]);
  const [erro, setErro] = useState<string>("");
  const [toast, setToast] = useState<string>("");
  // documento_id atualmente sendo indexado (para desabilitar botoes e mostrar progresso)
  const [indexandoId, setIndexandoId] = useState<string | null>(null);
  // Resultados da ultima indexacao por documento_id (para feedback inline)
  const [ultimoResultado, setUltimoResultado] = useState<Record<string, IndexResp>>({});
  // Refs dos inputs de arquivo (um por lei) para disparar o click programaticamente
  const inputsRef = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        const json = await res.json();
        if (!json.ok) {
          router.push("/login");
          return;
        }
        const perfis: string[] =
          Array.isArray(json.data?.perfis) && json.data.perfis.length > 0
            ? json.data.perfis
            : json.data?.perfil
              ? [json.data.perfil]
              : [];
        if (!isPerfilIrrestrito(perfis)) {
          router.push("/");
          return;
        }
        setAutorizado(true);
        await carregar();
      } catch {
        router.push("/");
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

  async function carregar() {
    setErro("");
    const res = await fetch("/api/admin/bdi/leis", { cache: "no-store" });
    const json = await res.json();
    if (!json.ok) {
      setErro(json.erro ?? "Falha ao carregar leis.");
      return;
    }
    setLeis(json.data ?? []);
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 4000);
  }

  function dispararUpload(lei: Lei) {
    const input = inputsRef.current[lei.id];
    if (!input) return;
    // Garante que escolher o mesmo arquivo duas vezes seguidas dispare onChange.
    input.value = "";
    input.click();
  }

  async function aoEscolherArquivo(lei: Lei, ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    if (!file) return;

    if (!/\.pdf$/i.test(file.name)) {
      showToast("Selecione um arquivo .pdf.");
      return;
    }

    setIndexandoId(lei.id);
    const fd = new FormData();
    fd.append("documento_id", lei.id);
    fd.append("pdf", file);

    try {
      const res = await fetch("/api/bdi/indexar-lei", {
        method: "POST",
        body: fd,
      });
      const json: IndexResp = await res.json();
      setUltimoResultado((prev) => ({ ...prev, [lei.id]: json }));

      if (json.ok) {
        showToast(
          `✅ ${lei.titulo}: ${json.fragmentos_indexados ?? 0} fragmentos indexados em ${json.duracao_ms ?? 0}ms.`,
        );
      } else {
        showToast(`❌ Falha em "${lei.titulo}": ${json.erro ?? "erro desconhecido"}`);
      }
      // Recarrega para refletir status_indexacao + contagem
      await carregar();
    } catch (e: any) {
      showToast(`❌ Falha de rede: ${e?.message ?? "erro desconhecido"}`);
    } finally {
      setIndexandoId(null);
    }
  }

  if (carregando) {
    return (
      <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#ffffff44", fontSize: 12, letterSpacing: 2 }}>CARREGANDO…</div>
      </div>
    );
  }

  if (!autorizado) return null;

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: "#d946ef", fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
            BDI — INDEXAÇÃO DE LEIS
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={carregar}
            style={S.btn("#06b6d4")}
            disabled={indexandoId !== null}
          >
            ↻ ATUALIZAR
          </button>
          <button onClick={() => router.push("/admin/bdi")} style={S.btn("#ffffff66")}>
            ← BDI
          </button>
          <button onClick={() => router.push("/")} style={S.btn("#ffffff66")}>
            ⌂ HOME
          </button>
        </div>
      </div>

      <div style={S.content}>
        <div style={{ ...S.card, background: "#0d0d1a", borderColor: "#d946ef22" }}>
          <div style={S.label}>COMO USAR</div>
          <div style={{ color: "#ffffff88", fontSize: 12, lineHeight: 1.6 }}>
            Para cada lei abaixo, clique em <strong style={{ color: "#d946ef" }}>UPLOAD PDF</strong>{" "}
            e selecione o arquivo. O sistema vai fragmentar o texto por artigo, gerar embeddings
            (Gemini text-embedding-004) e salvar em <code>bdi_lei_fragmentos</code>. O processo
            pode levar até 5 minutos para leis longas. Recarregar a página é seguro.
          </div>
        </div>

        {erro && (
          <div
            style={{
              ...S.card,
              background: "#2a0a0a",
              border: "1px solid #ef444466",
              color: "#fca5a5",
              fontSize: 12,
            }}
          >
            ⚠ {erro}
          </div>
        )}

        {!erro && leis.length === 0 && (
          <div style={{ color: "#ffffff44", fontSize: 12, textAlign: "center", padding: 40 }}>
            Nenhuma lei cadastrada em <code>bdi_documentos_lei</code>.
          </div>
        )}

        {leis.map((lei) => {
          const cor = corDoStatus(lei.status_indexacao);
          const indexando = indexandoId === lei.id;
          const desabilitar = indexandoId !== null && !indexando;
          const ult = ultimoResultado[lei.id];

          return (
            <div key={lei.id} style={S.card}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 16,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                    {lei.tipo && (
                      <span style={S.badge("#d946ef")}>{String(lei.tipo)}</span>
                    )}
                    {lei.numero && (
                      <span style={S.meta}>Nº {String(lei.numero)}</span>
                    )}
                    <span style={S.badge(cor)}>{lei.status_indexacao ?? "pendente"}</span>
                    <span style={{ ...S.meta, color: "#ffffff77" }}>
                      {(lei.fragmentos_count ?? 0).toLocaleString("pt-BR")} fragmentos
                    </span>
                  </div>
                  <div style={S.titulo}>{lei.titulo}</div>
                  {ult && (
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 11,
                        color: ult.ok ? "#22c55e" : "#fca5a5",
                      }}
                    >
                      {ult.ok ? (
                        <>
                          ✅ Última indexação: {ult.fragmentos_indexados} fragmentos
                          {ult.paginas != null ? `, ${ult.paginas} páginas` : ""}
                          {ult.duracao_ms != null ? ` em ${ult.duracao_ms}ms` : ""}.
                        </>
                      ) : (
                        <>❌ {ult.erro ?? "Falha desconhecida"}</>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "stretch" }}>
                  <input
                    ref={(el) => {
                      inputsRef.current[lei.id] = el;
                    }}
                    type="file"
                    accept="application/pdf,.pdf"
                    style={{ display: "none" }}
                    onChange={(e) => aoEscolherArquivo(lei, e)}
                  />
                  <button
                    onClick={() => dispararUpload(lei)}
                    style={S.btn("#d946ef", desabilitar || indexando)}
                    disabled={desabilitar || indexando}
                  >
                    {indexando ? "⏳ INDEXANDO…" : "📤 UPLOAD PDF"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            background: "#0d0d14",
            border: "1px solid #d946ef55",
            color: "#f0f0f0",
            padding: "12px 20px",
            borderRadius: 6,
            fontSize: 12,
            fontFamily: "monospace",
            maxWidth: 480,
            boxShadow: "0 8px 24px #00000088",
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
