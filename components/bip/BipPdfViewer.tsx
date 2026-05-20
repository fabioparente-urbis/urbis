'use client'

import { useState, useCallback } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import dynamic from 'next/dynamic'
import { useBipAnotacoes } from '@/hooks/useBipAnotacoes'
import type { Ferramenta } from './BipCanvas'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

const BipCanvas = dynamic(() => import('./BipCanvas'), { ssr: false })

const CORES = [
  { nome: 'Amarelo',  hex: '#FFD600' },
  { nome: 'Vermelho', hex: '#F44336' },
  { nome: 'Azul',     hex: '#1976D2' },
  { nome: 'Preto',    hex: '#212121' },
]
const ESPESSURAS = [
  { nome: 'Fino',   valor: 1 },
  { nome: 'Médio',  valor: 3 },
  { nome: 'Grosso', valor: 6 },
]

interface BipPdfViewerProps {
  leiId: string
  pdfUrl: string
  nomeLei?: string
}

function BipPagina({ numero, largura, ferramentaAtiva, corAtiva, espessuraAtiva, clipes, anotacoes, adicionarElemento, removerElemento, toggleClipe }: any) {
  const [dim, setDim] = useState({ largura, altura: largura * 1.414 })
  const temClipe = clipes.includes(numero)
  return (
    <div id={`bip-pagina-${numero}`} style={{ position: 'relative', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.15)', display: 'inline-block' }}>
      <button onClick={() => toggleClipe(numero)} title={temClipe ? 'Remover clipe' : 'Adicionar clipe'}
        style={{ position: 'absolute', top: 6, right: 6, zIndex: 20, background: temClipe ? '#1976D2' : 'rgba(255,255,255,0.85)', border: '1px solid #ccc', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.2)', transition: 'all 0.2s' }}>
        {temClipe ? '📌' : '📎'}
      </button>
      <div style={{ position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)', zIndex: 20, background: 'rgba(0,0,0,0.45)', color: '#fff', fontSize: 11, padding: '2px 8px', borderRadius: 10, pointerEvents: 'none' }}>
        {numero}
      </div>
      <Page pageNumber={numero} width={largura}
        onRenderSuccess={(page) => setDim({ largura: page.width, altura: page.height })}
        renderTextLayer={true} renderAnnotationLayer={false} />
      <BipCanvas pagina={numero} largura={dim.largura} altura={dim.altura}
        elementos={anotacoes[numero] ?? []} ferramentaAtiva={ferramentaAtiva}
        corAtiva={corAtiva} espessuraAtiva={espessuraAtiva}
        onAdicionarElemento={adicionarElemento} onRemoverElemento={removerElemento} />
    </div>
  )
}

export default function BipPdfViewer({ leiId, pdfUrl, nomeLei }: BipPdfViewerProps) {
  const [totalPaginas, setTotalPaginas] = useState(0)
  const [ferramentaAtiva, setFerramentaAtiva] = useState<Ferramenta>(null)
  const [corAtiva, setCorAtiva] = useState('#FFD600')
  const [espessuraAtiva, setEspessuraAtiva] = useState(3)
  const { anotacoes, clipes, carregando, adicionarElemento, removerElemento, toggleClipe, historico, carregarHistorico } = useBipAnotacoes({ leiId })

  const irParaPagina = useCallback((pagina: number) => {
    document.getElementById(`bip-pagina-${pagina}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  if (carregando) return <div style={{ padding: 32, color: '#666' }}>Carregando anotações...</div>

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#F5F5F5' }}>
      {/* Painel de clipes */}
      <aside style={{ width: 200, minWidth: 200, background: '#1A1A2E', color: '#E0E0E0', overflowY: 'auto', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: '#888', marginBottom: 8 }}>📎 MINHAS PÁGINAS</div>
        {clipes.length === 0 && <div style={{ fontSize: 12, color: '#555', fontStyle: 'italic' }}>Nenhum clipe ainda.</div>}
        {[...clipes].sort((a, b) => a - b).map((pag) => (
          <button key={pag} onClick={() => irParaPagina(pag)}
            style={{ background: 'rgba(25,118,210,0.15)', border: '1px solid rgba(25,118,210,0.4)', borderRadius: 6, color: '#90CAF9', padding: '6px 10px', cursor: 'pointer', textAlign: 'left', fontSize: 13 }}>
            📌 Página {pag}
          </button>
        ))}
        <div style={{ width: '100%', height: 1, background: '#ffffff11', margin: '12px 0' }} />
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: '#888', marginBottom: 8 }}>🕓 HISTÓRICO</div>
        {historico.length === 0 && <div style={{ fontSize: 11, color: '#444', fontStyle: 'italic' }}>Sem ações ainda.</div>}
        {historico.map((h) => (
          <button key={h.id}
            onClick={() => h.pagina && irParaPagina(h.pagina)}
            style={{ background: 'transparent', border: 'none', color: '#ffffff66', padding: '4px 2px', cursor: h.pagina ? 'pointer' : 'default', textAlign: 'left', fontSize: 11, lineHeight: 1.4 }}>
            {h.pagina ? `p.${h.pagina} — ` : ''}{h.acao.slice(0, 35)}
          </button>
        ))}
      </aside>

      {/* Área principal */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Toolbar */}
        <div style={{ background: '#fff', borderBottom: '1px solid #E0E0E0', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {nomeLei && <span style={{ fontWeight: 600, fontSize: 13, color: '#333', marginRight: 8 }}>{nomeLei}</span>}
          {(['caneta','borracha','comentario'] as Ferramenta[]).map((id) => (
            <button key={id!} onClick={() => setFerramentaAtiva(ferramentaAtiva === id ? null : id)}
              style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid', borderColor: ferramentaAtiva === id ? '#1976D2' : '#DDD', background: ferramentaAtiva === id ? '#E3F2FD' : '#FAFAFA', color: ferramentaAtiva === id ? '#1976D2' : '#555', fontWeight: ferramentaAtiva === id ? 700 : 400, cursor: 'pointer', fontSize: 13 }}>
              {id === 'caneta' ? '✏️ Caneta' : id === 'borracha' ? '🧹 Borracha' : '💬 Comentário'}
            </button>
          ))}
          <div style={{ width: 1, height: 24, background: '#E0E0E0' }} />
          {CORES.map(({ nome, hex }) => (
            <button key={hex} onClick={() => setCorAtiva(hex)} title={nome}
              style={{ width: 22, height: 22, borderRadius: '50%', background: hex, border: corAtiva === hex ? '2px solid #333' : '2px solid transparent', cursor: 'pointer', outline: corAtiva === hex ? '2px solid #1976D2' : 'none' }} />
          ))}
          <div style={{ width: 1, height: 24, background: '#E0E0E0' }} />
          {ESPESSURAS.map(({ nome, valor }) => (
            <button key={valor} onClick={() => setEspessuraAtiva(valor)} title={nome}
              style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid', borderColor: espessuraAtiva === valor ? '#1976D2' : '#DDD', background: espessuraAtiva === valor ? '#E3F2FD' : '#FAFAFA', color: espessuraAtiva === valor ? '#1976D2' : '#555', fontWeight: 600, cursor: 'pointer', fontSize: valor === 1 ? 10 : valor === 3 ? 13 : 16 }}>━</button>
          ))}
          {ferramentaAtiva && (
            <button onClick={() => setFerramentaAtiva(null)}
              style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 6, border: '1px solid #EF9A9A', background: '#FFF3F3', color: '#C62828', cursor: 'pointer', fontSize: 12 }}>
              ✕ Ferramenta
            </button>
          )}
        </div>

        {/* PDF */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Document file={pdfUrl} onLoadSuccess={({ numPages }) => setTotalPaginas(numPages)}
            loading={<div style={{ color: '#666', padding: 32 }}>Carregando PDF...</div>}
            error={<div style={{ color: '#C62828', padding: 32 }}>Erro ao carregar PDF.</div>}>
            {Array.from({ length: totalPaginas }, (_, i) => i + 1).map((num) => (
              <BipPagina key={num} numero={num} largura={720}
                ferramentaAtiva={ferramentaAtiva} corAtiva={corAtiva} espessuraAtiva={espessuraAtiva}
                clipes={clipes} anotacoes={anotacoes}
                adicionarElemento={adicionarElemento} removerElemento={removerElemento} toggleClipe={toggleClipe} />
            ))}
          </Document>
        </div>
      </main>
    </div>
  )
}
