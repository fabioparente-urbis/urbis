#!/bin/bash

BASE="/Users/fabiomartinssantos/lip-interface"

echo "Instalando Timeline de Processos..."

mkdir -p "$BASE/app/processos"
mkdir -p "$BASE/app/api/processos"

# API de listagem de processos
cat > "$BASE/app/api/processos/route.ts" << 'ENDOFFILE'
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const busca = searchParams.get("busca") || "";
    const tipo = searchParams.get("tipo") || "";
    const status = searchParams.get("status") || "";

    let query = supabase
      .from("processos")
      .select("id, codigo, numero_sei, tipo_processo, status, criado_em, atualizado_em, dados")
      .order("atualizado_em", { ascending: false })
      .limit(100);

    if (busca) {
      query = query.or(`codigo.ilike.%${busca}%,numero_sei.ilike.%${busca}%`);
    }
    if (tipo) query = query.eq("tipo_processo", tipo);
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 });
  }
}
ENDOFFILE

echo "API criada"

# Página da Timeline
cat > "$BASE/app/processos/page.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Processo = {
  id: string;
  codigo: string;
  numero_sei: string;
  tipo_processo: string;
  status: string;
  criado_em: string;
  atualizado_em: string;
  dados?: Record<string, any>;
};

const STATUS_COR: Record<string, string> = {
  em_analise: "bg-blue-900 text-blue-300",
  concluido: "bg-green-900 text-green-300",
  pendente: "bg-yellow-900 text-yellow-300",
  cancelado: "bg-red-900 text-red-300",
};

const TIPO_COR: Record<string, string> = {
  Regularização: "bg-purple-900 text-purple-300",
  Aceite: "bg-cyan-900 text-cyan-300",
  Aprovação: "bg-orange-900 text-orange-300",
};

function formatar(dataStr: string | null) {
  if (!dataStr) return "—";
  return new Date(dataStr).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function ProcessosPage() {
  const router = useRouter();
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState("");
  const [status, setStatus] = useState("");

  async function carregar() {
    try {
      setCarregando(true);
      const params = new URLSearchParams();
      if (busca) params.set("busca", busca);
      if (tipo) params.set("tipo", tipo);
      if (status) params.set("status", status);
      const res = await fetch(`/api/processos?${params}`);
      const json = await res.json();
      if (json.ok) setProcessos(json.data);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, [busca, tipo, status]);

  function abrirProcesso(p: Processo) {
    const id = p.codigo || p.numero_sei;
    const tipoNav = p.tipo_processo === "Regularização" ? "Regularização" :
                    p.tipo_processo === "Aceite" ? "Aceite" : "Aprovação";
    router.push(`/processo/${encodeURIComponent(id)}?tipo=${tipoNav}`);
  }

  return (
    <div className="min-h-screen bg-slate-900 p-4 md:p-6 text-white">
      {/* CABEÇALHO */}
      <div className="flex items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/")}
            className="bg-slate-700 hover:bg-slate-600 text-slate-300 px-3 py-1.5 rounded text-sm font-medium transition-colors">
            🏠 Home
          </button>
          <div>
            <h1 className="text-2xl font-bold">📋 Processos</h1>
            <p className="text-slate-400 text-sm">Todos os processos cadastrados no URBIS</p>
          </div>
        </div>
        <span className="text-slate-500 text-sm">{processos.length} processo(s)</span>
      </div>

      {/* FILTROS */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por número SEI ou código..."
          className="flex-1 min-w-[200px] bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select value={tipo} onChange={(e) => setTipo(e.target.value)}
          className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todos os tipos</option>
          <option value="Regularização">Regularização</option>
          <option value="Aceite">Aceite</option>
          <option value="Aprovação">Aprovação</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}
          className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todos os status</option>
          <option value="em_analise">Em análise</option>
          <option value="concluido">Concluído</option>
          <option value="pendente">Pendente</option>
          <option value="cancelado">Cancelado</option>
        </select>
      </div>

      {/* LISTA */}
      {carregando ? (
        <div className="text-slate-400 text-sm text-center py-12">Carregando...</div>
      ) : processos.length === 0 ? (
        <div className="text-slate-500 text-sm text-center py-12">Nenhum processo encontrado.</div>
      ) : (
        <div className="flex flex-col gap-3">
          {processos.map((p) => {
            const proprietario = p.dados?.proprietario?.valor || "—";
            const numero = p.codigo || p.numero_sei || "—";
            return (
              <div
                key={p.id}
                onClick={() => abrirProcesso(p)}
                className="bg-slate-800 border border-slate-700 hover:border-slate-500 rounded-xl p-4 cursor-pointer transition-all hover:bg-slate-750 flex items-center gap-4"
              >
                {/* Número */}
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-yellow-400 font-semibold text-sm">{numero}</p>
                  <p className="text-slate-300 text-sm mt-0.5 truncate">{proprietario}</p>
                </div>

                {/* Tipo */}
                <span className={`px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap ${TIPO_COR[p.tipo_processo] || "bg-slate-700 text-slate-300"}`}>
                  {p.tipo_processo || "—"}
                </span>

                {/* Status */}
                <span className={`px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap ${STATUS_COR[p.status] || "bg-slate-700 text-slate-300"}`}>
                  {p.status?.replace("_", " ") || "—"}
                </span>

                {/* Data */}
                <p className="text-slate-500 text-xs whitespace-nowrap hidden md:block">
                  {formatar(p.atualizado_em)}
                </p>

                {/* Seta */}
                <span className="text-slate-500">→</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
ENDOFFILE

echo "Pagina criada"
echo ""
echo "Timeline instalada com sucesso!"
echo "Acesse: http://localhost:3000/processos"
