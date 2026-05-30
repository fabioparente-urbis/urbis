'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import * as fabric from 'fabric'
import { v4 as uuid } from 'uuid'
import type { ElementoCanvas } from '@/hooks/useBipAnotacoes'

export type Ferramenta = 'caneta' | 'borracha' | 'comentario' | 'clipe' | 'balao' | null

interface BipCanvasProps {
  pagina: number
  largura: number
  altura: number
  elementos: ElementoCanvas[]
  ferramentaAtiva: Ferramenta
  corAtiva: string
  espessuraAtiva: number
  onAdicionarElemento: (pagina: number, elemento: ElementoCanvas) => void
  onRemoverElemento: (pagina: number, elementoId: string) => void
}

export default function BipCanvas({
  pagina, largura, altura, elementos,
  ferramentaAtiva, corAtiva, espessuraAtiva,
  onAdicionarElemento, onRemoverElemento,
}: BipCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fabricRef = useRef<fabric.Canvas | null>(null)

  // Inicializa fabric canvas
  useEffect(() => {
    if (!canvasRef.current) return
    const fc = new fabric.Canvas(canvasRef.current, {
      width: largura,
      height: altura,
      selection: false,
    })
    // Fabric v7: posiciona o wrapperEl corretamente
    if (fc.wrapperEl) {
      fc.wrapperEl.style.position = 'absolute'
      fc.wrapperEl.style.top = '0'
      fc.wrapperEl.style.left = '0'
    }
    fabricRef.current = fc
    return () => { fc.dispose(); fabricRef.current = null }
  }, [largura, altura])

  // Carrega elementos do banco no canvas
  useEffect(() => {
    const fc = fabricRef.current
    if (!fc) return
    fc.clear()
    elementos.forEach((el) => {
      if (el.tipo === 'traco' && el.coords.length >= 2) {
        const pontos = el.coords.map(([x, y]) => ({ x: x * largura, y: y * altura }))
        const poly = new fabric.Polyline(pontos, {
          stroke: el.cor, strokeWidth: el.espessura,
          fill: 'transparent', selectable: false,
        })
        ;(poly as any)._bipId = el.id
        fc.add(poly)
      }
      if (el.tipo === 'comentario' && el.coords[0]) {
        const [cx, cy] = el.coords[0]
        const circle = new fabric.Circle({
          left: cx * largura - 8, top: cy * altura - 8,
          radius: 8, fill: el.cor, selectable: false,
        })
        ;(circle as any)._bipId = el.id
        fc.add(circle)
      }
    })
    fc.renderAll()
  }, [elementos, largura, altura])

  // Modo caneta
  useEffect(() => {
    const fc = fabricRef.current
    if (!fc) return
    if (ferramentaAtiva === 'caneta') {
      fc.isDrawingMode = true
      const brush = new fabric.PencilBrush(fc)
      brush.color = corAtiva
      brush.width = espessuraAtiva
      fc.freeDrawingBrush = brush

      const onPathCreated = (e: any) => {
        const path = e.path as fabric.Path
        fc.remove(path)
        const coords: number[][] = []
        const pathData = (path as any).path as any[]
        pathData?.forEach((cmd: any) => {
          if (['M','L','Q'].includes(cmd[0])) {
            const x = (cmd[cmd.length - 2] as number) / largura
            const y = (cmd[cmd.length - 1] as number) / altura
            coords.push([Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))])
          }
        })
        onAdicionarElemento(pagina, {
          id: uuid(), tipo: 'traco', cor: corAtiva,
          espessura: espessuraAtiva, coords,
          criado_em: new Date().toISOString(),
        })
      }
      fc.on('path:created', onPathCreated)
      return () => { fc.off('path:created', onPathCreated); fc.isDrawingMode = false }
    } else {
      fc.isDrawingMode = false
    }
  }, [ferramentaAtiva, corAtiva, espessuraAtiva, pagina, largura, altura, onAdicionarElemento])

  // Modo borracha
  useEffect(() => {
    const fc = fabricRef.current
    if (!fc || ferramentaAtiva !== 'borracha') return
    const handler = (e: any) => {
      const alvo = e.target as any
      if (!alvo?._bipId) return
      fc.remove(alvo)
      onRemoverElemento(pagina, alvo._bipId)
    }
    fc.on('mouse:down', handler)
    return () => { fc.off('mouse:down', handler) }
  }, [ferramentaAtiva, pagina, onRemoverElemento])

  // Modo comentário
  const comentarioHandler = useCallback((e: any) => {
    const fc = fabricRef.current
    if (!fc) return
    const pointer = fc.getScenePoint(e.e)
    const texto = prompt('Comentário:')
    if (!texto) return
    onAdicionarElemento(pagina, {
      id: uuid(), tipo: 'comentario', cor: corAtiva, espessura: 1,
      coords: [[pointer.x / largura, pointer.y / altura]],
      texto, criado_em: new Date().toISOString(),
    })
  }, [corAtiva, largura, altura, pagina, onAdicionarElemento])

  useEffect(() => {
    const fc = fabricRef.current
    if (!fc || ferramentaAtiva !== 'comentario') return
    fc.on('mouse:down', comentarioHandler)
    return () => { fc.off('mouse:down', comentarioHandler) }
  }, [ferramentaAtiva, comentarioHandler])

  // Balão editando
  const [balaoEditando, setBalaoEditando] = useState<{id:string,x:number,y:number,texto:string}|null>(null)

  // Handler balão
  const balaoHandler = useCallback((e: any) => {
    const fc = fabricRef.current
    if (!fc) return
    const pointer = fc.getScenePoint(e.e)
    const nx = pointer.x / largura
    const ny = pointer.y / altura
    setBalaoEditando({ id: '', x: nx, y: ny, texto: '' })
  }, [largura, altura])

  useEffect(() => {
    const fc = fabricRef.current
    if (!fc || ferramentaAtiva !== 'balao') return
    fc.on('mouse:down', balaoHandler)
    return () => { fc.off('mouse:down', balaoHandler) }
  }, [ferramentaAtiva, balaoHandler])

  const confirmarBalao = useCallback(() => {
    if (!balaoEditando || !balaoEditando.texto.trim()) { setBalaoEditando(null); return }
    onAdicionarElemento(pagina, {
      id: require('uuid').v4(), tipo: 'balao', cor: corAtiva, espessura: 1,
      coords: [[balaoEditando.x, balaoEditando.y]],
      texto: balaoEditando.texto.trim(),
      criado_em: new Date().toISOString(),
    })
    setBalaoEditando(null)
  }, [balaoEditando, corAtiva, pagina, onAdicionarElemento])

  const balaosExistentes = elementos.filter(el => el.tipo === 'balao')

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute', top: 0, left: 0,
        width: largura, height: altura, zIndex: 10,
        pointerEvents: ferramentaAtiva ? 'all' : 'none',
        cursor: ferramentaAtiva === 'caneta' ? 'crosshair'
          : ferramentaAtiva === 'borracha' ? 'cell'
          : ferramentaAtiva === 'comentario' ? 'text'
          : ferramentaAtiva === 'balao' ? 'crosshair' : 'default',
      }}
    >
      <canvas ref={canvasRef} />

      {/* Balões existentes */}
      {balaosExistentes.map((el) => {
        const px = el.coords[0][0] * largura
        const py = el.coords[0][1] * altura
        const cor = el.cor || '#FFD600'
        const bw = 180, bh = 'auto', br = 10
        return (
          <div key={el.id} style={{ position: 'absolute', left: px, top: py, zIndex: 30, pointerEvents: 'all' }}>
            {/* Rabicho SVG */}
            <svg width="24" height="20" style={{ position: 'absolute', left: -4, top: -20, overflow: 'visible' }} viewBox="0 0 24 20">
              <polygon points="0,20 12,0 18,20" fill={cor} stroke={cor} strokeWidth="1" />
            </svg>
            {/* Balão */}
            <div style={{
              position: 'absolute', left: 8, top: -90,
              background: cor, borderRadius: br,
              padding: '6px 10px', minWidth: 120, maxWidth: 200,
              fontSize: 12, fontWeight: 600, color: '#1a1a1a',
              boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
              wordBreak: 'break-word', lineHeight: 1.4,
              border: '1.5px solid rgba(0,0,0,0.12)',
            }}>
              {el.texto}
              <button
                onClick={() => onRemoverElemento(pagina, el.id)}
                style={{
                  position: 'absolute', top: -8, right: -8,
                  width: 18, height: 18, borderRadius: '50%',
                  background: '#ef4444', color: '#fff', border: 'none',
                  fontSize: 10, cursor: 'pointer', lineHeight: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700,
                }}>×</button>
            </div>
          </div>
        )
      })}

      {/* Input balão novo */}
      {balaoEditando && (
        <div style={{
          position: 'absolute',
          left: balaoEditando.x * largura,
          top: balaoEditando.y * altura - 110,
          zIndex: 50, pointerEvents: 'all',
        }}>
          <svg width="24" height="20" style={{ position: 'absolute', left: -4, top: 100, overflow: 'visible' }} viewBox="0 0 24 20">
            <polygon points="0,20 12,0 18,20" fill={corAtiva} stroke={corAtiva} strokeWidth="1" />
          </svg>
          <div style={{
            background: corAtiva, borderRadius: 10, padding: '8px 10px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            border: '1.5px solid rgba(0,0,0,0.15)',
          }}>
            <textarea
              autoFocus
              placeholder="Digite a observação..."
              value={balaoEditando.texto}
              onChange={e => setBalaoEditando(b => b ? {...b, texto: e.target.value} : b)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); confirmarBalao() } if (e.key === 'Escape') setBalaoEditando(null) }}
              style={{
                width: 180, height: 70, resize: 'none',
                background: 'rgba(255,255,255,0.85)', border: 'none', borderRadius: 6,
                padding: '4px 6px', fontSize: 12, fontWeight: 500, color: '#1a1a1a',
                outline: 'none', display: 'block',
              }}
            />
            <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
              <button onClick={() => setBalaoEditando(null)}
                style={{ padding: '2px 10px', borderRadius: 5, border: 'none', background: 'rgba(0,0,0,0.15)', color: '#333', cursor: 'pointer', fontSize: 11 }}>
                Esc
              </button>
              <button onClick={confirmarBalao}
                style={{ padding: '2px 10px', borderRadius: 5, border: 'none', background: '#1976D2', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                ↵ OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
