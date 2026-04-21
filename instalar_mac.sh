#!/bin/bash

BASE="/Users/fabiomartinssantos/lip-interface"

echo "Instalando MAC - Módulo de Análise e Checklist..."

mkdir -p "$BASE/app/analise/[codigo]"
mkdir -p "$BASE/app/api/analise"

# ─── API DO MAC ──────────────────────────────────────────────
cat > "$BASE/app/api/analise/route.ts" << 'ENDOFFILE'
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const codigo = searchParams.get("codigo");
  if (!codigo) return NextResponse.json({ ok: false, erro: "codigo obrigatorio" }, { status: 400 });

  const { data, error } = await supabase
    .from("analises_mac")
    .select("*")
    .eq("processo_codigo", codigo)
    .order("numero_analise", { ascending: false });

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data: data ?? [] });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { processo_codigo, itens, observacoes, status } = body;
    if (!processo_codigo) return NextResponse.json({ ok: false, erro: "codigo obrigatorio" }, { status: 400 });

    const cookieHeader = req.headers.get("cookie") || "";
    const analistaId = cookieHeader.match(/urbis_id=([^;]+)/)?.[1] ?? null;

    // Verifica quantas análises já foram feitas
    const { data: existentes } = await supabase
      .from("analises_mac")
      .select("numero_analise")
      .eq("processo_codigo", processo_codigo)
      .order("numero_analise", { ascending: false })
      .limit(1);

    const proximoNumero = existentes && existentes.length > 0 ? existentes[0].numero_analise + 1 : 1;

    if (proximoNumero > 5) {
      return NextResponse.json({ ok: false, erro: "Limite de 5 analises atingido. Processo deve ser indeferido." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("analises_mac")
      .insert({
        processo_codigo,
        analista_id: analistaId,
        numero_analise: proximoNumero,
        status: status || "em_andamento",
        itens: itens || {},
        observacoes: observacoes || "",
      })
      .select()
      .single();

    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, itens, observacoes, status } = body;
    if (!id) return NextResponse.json({ ok: false, erro: "id obrigatorio" }, { status: 400 });

    const { error } = await supabase
      .from("analises_mac")
      .update({ itens, observacoes, status, atualizado_em: new Date().toISOString() })
      .eq("id", id);

    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 });
  }
}
ENDOFFILE

echo "API criada"

# ─── PÁGINA DO MAC ───────────────────────────────────────────
cat > "$BASE/app/analise/[codigo]/page.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";

type StatusItem = "conforme" | "nao_conforme" | "nao_aplica" | null;

type Item = {
  id: string;
  grupo: string;
  texto: string;
  ref?: string;
};

type Analise = {
  id: string;
  numero_analise: number;
  status: string;
  itens: Record<string, StatusItem>;
  observacoes: string;
  criado_em: string;
};

const CHECKLIST: Item[] = [
  // DOCUMENTAÇÃO
  { id: "d1", grupo: "Documentação", texto: "Certidão de Matrícula do imóvel ou certidão de compra e venda", ref: "Art. 2º LC 314/2018" },
  { id: "d2", grupo: "Documentação", texto: "ART/RRT de levantamento + laudo técnico com tipo de estrutura, condições de segurança e habitabilidade e registros fotográficos", ref: "Art. 2º inc. VII LC 314/2018" },
  { id: "d3", grupo: "Documentação", texto: "Poço de infiltração/caixa de recarga para edificações acima de 250m² que não ocuparam a totalidade do lote", ref: "Art. 2º §4º LC 314/2018" },
  { id: "d4", grupo: "Documentação", texto: "Foto Google Earth com data até 04/03/2022 ou documento comprobatório equivalente", ref: "Art. 1º §2º LC 314/2018 c/ redação LC 368/2023" },
  { id: "d5", grupo: "Documentação", texto: "Certidão de Remembramento/Desmembramento ou Decreto (caso mais de um lote)", ref: "Art. 2º inc. IX LC 314/2018" },
  { id: "d6", grupo: "Documentação", texto: "Direito de Superfície (caso lotes de diferentes proprietários não remembrados)", ref: "Obs. Item 1.6" },
  { id: "d7", grupo: "Documentação", texto: "Anuência do órgão cultural responsável (imóvel em área de entorno de bem tombado)", ref: "Art. 3º IN nº 4/2024" },
  { id: "d8", grupo: "Documentação", texto: "Outorga Onerosa (edificações com altura superior a 7,50m a partir da laje do térreo e que ultrapassem a unidade imobiliária)", ref: "Item 1.8/1.9" },

  // CARIMBO
  { id: "c1", grupo: "Carimbo", texto: "Texto: 'O MEMORIAL DE CÁLCULO DA CAIXA DE INFILTRAÇÃO É DE RESPONSABILIDADE DO PROFISSIONAL QUE ASSINOU A ART/RRT'", ref: "Item 1.12" },
  { id: "c2", grupo: "Carimbo", texto: "Texto: 'DE ACORDO COM A LC 364/JAN2023 ART.108 - É DE RESPONSABILIDADE DO INTERESSADO A APROVAÇÃO SOB REGRAMENTO DO CORPO DE BOMBEIRO'", ref: "Item 1.13" },
  { id: "c3", grupo: "Carimbo", texto: "Carimbo conforme IN 7 de 10/07/2024 (Coletânea Urbanística pág. 525)", ref: "Item 1.14" },
  { id: "c4", grupo: "Carimbo", texto: "Nome correto da Secretaria: SEFIC / Diretoria de Análise e Aprovação de Projetos", ref: "Item 1.15" },
  { id: "c5", grupo: "Carimbo", texto: "Número do processo informado no campo de aprovação", ref: "Item 1.16" },
  { id: "c6", grupo: "Carimbo", texto: "Classificação de uso indicada: Habitacional / Atividade Econômica / Institucional", ref: "Art. 8º IN nº 4/2024" },
  { id: "c7", grupo: "Carimbo", texto: "CNAEs e descrição das atividades informados (documento CAE até 31/08/22 anexado)", ref: "Art. 20 IN nº 4/2024" },

  // PROJETO - CARIMBO
  { id: "p1", grupo: "Projeto — Carimbo", texto: "Título: ALVARÁ DE REGULARIZAÇÃO – LEVANTAMENTO ARQUITETÔNICO", ref: "Item 2.0" },
  { id: "p2", grupo: "Projeto — Carimbo", texto: "Número de pavimentos informado", ref: "Item 2.1" },
  { id: "p3", grupo: "Projeto — Carimbo", texto: "Número de unidades e/ou salas informado", ref: "Item 2.2" },
  { id: "p4", grupo: "Projeto — Carimbo", texto: "Endereço completo com todas as vias, lotes e quadra", ref: "Item 2.3" },
  { id: "p5", grupo: "Projeto — Carimbo", texto: "Área e dimensões do terreno compatibilizadas com a Certidão de Matrícula", ref: "Item 2.4" },
  { id: "p6", grupo: "Projeto — Carimbo", texto: "Áreas do carimbo compatibilizadas com o quadro de áreas do projeto", ref: "Item 2.5" },
  { id: "p7", grupo: "Projeto — Carimbo", texto: "Quadro de áreas completo: terreno / existente aprovada / recuo frontal / remanescente / total a regularizar", ref: "Item 2.6/2.7" },
  { id: "p8", grupo: "Projeto — Carimbo", texto: "Índice Paisagístico (m²) e caixas de recarga com volume atendido (m³) informados", ref: "Item 2.8" },
  { id: "p9", grupo: "Projeto — Carimbo", texto: "Termo 'Autor do Levantamento' substituindo 'Autor de Projeto e RT da obra'", ref: "Item 2.9" },

  // PROJETO - DESENHO
  { id: "pr1", grupo: "Projeto — Desenho", texto: "Recuo frontal mínimo de 5,00m hachureado, cotado e com metragem quadrada por pavimento e total", ref: "Item 2.10" },
  { id: "pr2", grupo: "Projeto — Desenho", texto: "Área de uso econômico informada no quadro de áreas (se houver)", ref: "Item 2.11" },
  { id: "pr3", grupo: "Projeto — Desenho", texto: "Caixa de recarga apresentada no projeto (edificações acima de 250m²)", ref: "Item 2.12" },
  { id: "pr4", grupo: "Projeto — Desenho", texto: "Memorial de cálculo da caixa de recarga informado", ref: "Item 2.13" },
  { id: "pr5", grupo: "Projeto — Desenho", texto: "Caixa locada na planta de locação", ref: "Item 2.14" },
  { id: "pr6", grupo: "Projeto — Desenho", texto: "Sem detalhe (planta/corte) da caixa — apenas memorial, tabela de índices e nota de responsabilidade", ref: "Item 2.15 / AMMA" },
  { id: "pr7", grupo: "Projeto — Desenho", texto: "Fechamento nas divisas frontais, laterais e fundo conforme Art. 81 LC 364/23", ref: "Item 2.16" },
  { id: "pr8", grupo: "Projeto — Desenho", texto: "Atende: máx. 7 pav. / altura máx. 21m / não obstrui APP, APM ou logradouro público", ref: "Art. 4º LC 314/2018" },
  { id: "pr9", grupo: "Projeto — Desenho", texto: "Planta de cobertura inserida no terreno e cotada", ref: "Item 2.19" },
  { id: "pr10", grupo: "Projeto — Desenho", texto: "Lançamento de águas pluviais interno ao lote (calhas/rufos indicados)", ref: "Item 2.20" },
  { id: "pr11", grupo: "Projeto — Desenho", texto: "Planta de situação com quadra completa, lotes numerados, dimensões conforme matrícula e vias identificadas", ref: "Item 2.21" },
  { id: "pr12", grupo: "Projeto — Desenho", texto: "Cortes devidamente cotados", ref: "Item 2.22" },
  { id: "pr13", grupo: "Projeto — Desenho", texto: "'Espaço não habitável' informado acima das lajes de cobertura em todos os cortes", ref: "Item 2.23" },

  // CALÇADA
  { id: "cal1", grupo: "Calçada", texto: "Rebaixos de meio-fio conforme Arts. 88 a 92 LC 364/2023", ref: "Item 2.24" },
  { id: "cal2", grupo: "Calçada", texto: "Texto: 'O passeio público atende à Lei Complementar nº 324 de 28/11/2019'", ref: "Item 2.25" },
  { id: "cal3", grupo: "Calçada", texto: "Texto nas divisas: 'não haverá desnível com a calçada do vizinho'", ref: "Item 2.25" },
  { id: "cal4", grupo: "Calçada", texto: "Largura da calçada cotada conforme Cadastro de Logradouros", ref: "Item 2.25" },

  // CORREDOR VIÁRIO
  { id: "cv1", grupo: "Corredor Viário", texto: "Área do corredor hachureada com metragem e texto 'faixa reservada para futura expansão da via'", ref: "Item 3.0" },
  { id: "cv2", grupo: "Corredor Viário", texto: "Textos obrigatórios acima do carimbo sobre desapropriação e faixa viária", ref: "Item 3.1" },
  { id: "cv3", grupo: "Corredor Viário", texto: "Documento do Anexo Único da IN assinado pelo proprietário anexado ao processo", ref: "Art. 5º parágrafo único IN" },
];

const GRUPOS = [...new Set(CHECKLIST.map((i) => i.grupo))];

const STATUS_CONFIG = {
  conforme:     { label: "✅ Conforme",      bg: "bg-green-900 border-green-600",  text: "text-green-300" },
  nao_conforme: { label: "❌ Não Conforme",  bg: "bg-red-900 border-red-600",      text: "text-red-300" },
  nao_aplica:   { label: "⬜ Não se Aplica", bg: "bg-slate-700 border-slate-500",  text: "text-slate-400" },
};

export default function MacPage() {
  const params = useParams();
  const router = useRouter();
  const codigo = decodeURIComponent(params?.codigo as string ?? "");

  const [analises, setAnalises] = useState<Analise[]>([]);
  const [analiseAtual, setAnaliseAtual] = useState<Analise | null>(null);
  const [itens, setItens] = useState<Record<string, StatusItem>>({});
  const [observacoes, setObservacoes] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [novaAnalise, setNovaAnalise] = useState(false);
  const [toast, setToast] = useState("");

  async function carregar() {
    setCarregando(true);
    const res = await fetch(`/api/analise?codigo=${encodeURIComponent(codigo)}`);
    const json = await res.json();
    if (json.ok && json.data.length > 0) {
      setAnalises(json.data);
      const ultima = json.data[0];
      setAnaliseAtual(ultima);
      setItens(ultima.itens || {});
      setObservacoes(ultima.observacoes || "");
      setNovaAnalise(false);
    } else {
      setNovaAnalise(true);
    }
    setCarregando(false);
  }

  useEffect(() => { carregar(); }, [codigo]);

  function setItem(id: string, status: StatusItem) {
    setItens((prev) => ({ ...prev, [id]: status }));
  }

  async function salvar(status = "em_andamento") {
    setSalvando(true);
    try {
      if (novaAnalise || !analiseAtual) {
        const res = await fetch("/api/analise", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ processo_codigo: codigo, itens, observacoes, status }),
        });
        const json = await res.json();
        if (!json.ok) { setToast("Erro: " + json.erro); return; }
        setToast("✅ Análise criada!");
        await carregar();
      } else {
        const res = await fetch("/api/analise", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: analiseAtual.id, itens, observacoes, status }),
        });
        const json = await res.json();
        if (!json.ok) { setToast("Erro: " + json.erro); return; }
        setToast("✅ Salvo!");
        await carregar();
      }
    } finally {
      setSalvando(false);
      setTimeout(() => setToast(""), 3000);
    }
  }

  function iniciarNovaAnalise() {
    if (analises.length >= 5) {
      setToast("❌ Limite de 5 análises atingido. Processo deve ser indeferido.");
      setTimeout(() => setToast(""), 4000);
      return;
    }
    setAnaliseAtual(null);
    setItens({});
    setObservacoes("");
    setNovaAnalise(true);
  }

  function selecionarAnalise(a: Analise) {
    setAnaliseAtual(a);
    setItens(a.itens || {});
    setObservacoes(a.observacoes || "");
    setNovaAnalise(false);
  }

  const naoConformes = CHECKLIST.filter((i) => itens[i.id] === "nao_conforme");
  const conformes = CHECKLIST.filter((i) => itens[i.id] === "conforme");
  const naoRespondidos = CHECKLIST.filter((i) => !itens[i.id]);

  if (carregando) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* TOAST */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-800 border border-slate-600 text-white px-5 py-3 rounded-xl shadow-2xl text-sm">
          {toast}
        </div>
      )}

      {/* CABEÇALHO */}
      <div className="bg-slate-800 border-b border-slate-700 px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push(`/processo/${encodeURIComponent(codigo)}`)}
              className="bg-slate-700 hover:bg-slate-600 text-slate-300 px-3 py-1.5 rounded text-sm font-medium transition-colors">
              ← Cadastro
            </button>
            <div>
              <h1 className="text-xl font-bold">🔍 Análise — MAC</h1>
              <p className="text-yellow-400 font-mono text-sm">{codigo}</p>
            </div>
          </div>

          {/* HISTÓRICO DE ANÁLISES */}
          <div className="flex items-center gap-2">
            {analises.map((a) => (
              <button key={a.id}
                onClick={() => selecionarAnalise(a)}
                className={`px-3 py-1.5 rounded text-xs font-bold border transition-colors ${
                  analiseAtual?.id === a.id
                    ? "bg-blue-600 border-blue-500 text-white"
                    : "bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600"
                }`}>
                {a.numero_analise}ª Análise
                {a.status === "deferido" && " ✅"}
                {a.status === "indeferido" && " ❌"}
              </button>
            ))}
            {(novaAnalise && !analiseAtual) && (
              <span className="px-3 py-1.5 rounded text-xs font-bold bg-green-800 border border-green-600 text-green-300">
                {analises.length + 1}ª Análise (nova)
              </span>
            )}
            {!novaAnalise && analises.length < 5 && (
              <button onClick={iniciarNovaAnalise}
                className="px-3 py-1.5 rounded text-xs font-bold bg-slate-700 border border-slate-600 text-slate-300 hover:bg-slate-600 transition-colors">
                + Nova
              </button>
            )}
          </div>
        </div>

        {/* CONTADORES */}
        <div className="flex gap-4 mt-3 text-xs">
          <span className="text-green-400">✅ {conformes.length} conformes</span>
          <span className="text-red-400">❌ {naoConformes.length} não conformes</span>
          <span className="text-slate-400">⬜ {CHECKLIST.filter((i) => itens[i.id] === "nao_aplica").length} não se aplica</span>
          <span className="text-yellow-400">⏳ {naoRespondidos.length} não respondidos</span>
        </div>
      </div>

      <div className="flex gap-0">
        {/* CHECKLIST */}
        <div className="flex-1 p-6 overflow-y-auto">
          {GRUPOS.map((grupo) => (
            <div key={grupo} className="mb-8">
              <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-3 pb-2 border-b border-slate-700">
                {grupo}
              </h2>
              <div className="flex flex-col gap-3">
                {CHECKLIST.filter((i) => i.grupo === grupo).map((item) => {
                  const status = itens[item.id];
                  return (
                    <div key={item.id}
                      className={`rounded-xl border p-4 transition-all ${
                        status === "conforme" ? "bg-green-950 border-green-800" :
                        status === "nao_conforme" ? "bg-red-950 border-red-800" :
                        status === "nao_aplica" ? "bg-slate-800 border-slate-700 opacity-50" :
                        "bg-slate-800 border-slate-700"
                      }`}>
                      <div className="flex items-start gap-3">
                        <div className="flex-1">
                          <p className="text-sm text-white leading-relaxed">{item.texto}</p>
                          {item.ref && <p className="text-xs text-slate-500 mt-1">{item.ref}</p>}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {(["conforme", "nao_conforme", "nao_aplica"] as StatusItem[]).map((s) => (
                            <button key={s!}
                              onClick={() => setItem(item.id, status === s ? null : s)}
                              className={`px-2 py-1 rounded text-xs font-bold border transition-all ${
                                status === s
                                  ? s === "conforme" ? "bg-green-700 border-green-500 text-white" :
                                    s === "nao_conforme" ? "bg-red-700 border-red-500 text-white" :
                                    "bg-slate-600 border-slate-400 text-white"
                                  : "bg-slate-700 border-slate-600 text-slate-400 hover:border-slate-400"
                              }`}>
                              {s === "conforme" ? "✅" : s === "nao_conforme" ? "❌" : "⬜"}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* OBSERVAÇÕES */}
          <div className="mb-6">
            <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-3 pb-2 border-b border-slate-700">
              Observações
            </h2>
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Observações adicionais para o despacho..."
              rows={4}
              className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>

        {/* PAINEL LATERAL */}
        <div className="w-72 bg-slate-800 border-l border-slate-700 p-4 flex flex-col gap-4 sticky top-0 h-screen overflow-y-auto">
          <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">Ações</h3>

          <button onClick={() => salvar("em_andamento")} disabled={salvando}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg text-sm transition-colors">
            {salvando ? "Salvando..." : "💾 Salvar"}
          </button>

          <button onClick={() => salvar("deferido")} disabled={salvando || naoConformes.length > 0}
            className="w-full bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-2.5 rounded-lg text-sm transition-colors">
            ✅ Deferir
          </button>

          {naoConformes.length > 0 && (
            <p className="text-xs text-yellow-400">⚠️ {naoConformes.length} item(ns) não conforme(s) — não é possível deferir.</p>
          )}

          <button onClick={() => salvar("indeferido")} disabled={salvando}
            className="w-full bg-red-800 hover:bg-red-700 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg text-sm transition-colors">
            ❌ Indeferir
          </button>

          {analises.length === 4 && (
            <div className="bg-orange-950 border border-orange-700 rounded-lg p-3">
              <p className="text-xs text-orange-300 font-bold">⚠️ Esta é a 5ª e última análise permitida.</p>
              <p className="text-xs text-orange-400 mt-1">Se não for liberada a taxa, o processo será indeferido.</p>
            </div>
          )}

          {/* NÃO CONFORMES */}
          {naoConformes.length > 0 && (
            <div className="mt-2">
              <h4 className="text-xs font-bold text-red-400 uppercase mb-2">Não Conformes</h4>
              <div className="flex flex-col gap-1">
                {naoConformes.map((i) => (
                  <div key={i.id} className="bg-red-950 border border-red-800 rounded p-2">
                    <p className="text-xs text-red-300 leading-relaxed">{i.texto}</p>
                    {i.ref && <p className="text-xs text-red-600 mt-0.5">{i.ref}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
ENDOFFILE

echo "MAC instalado com sucesso!"
echo "Acesse: http://localhost:3000/analise/[SEI]"
