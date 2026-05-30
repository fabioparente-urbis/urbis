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
  const [balaoEditando, setBalaoEditando] = useState<{x:number,y:number,texto:string}|null>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    const fc = new fabric.Canvas(canvasRef.current, { width: largura, height: altura, selection: false })
    if (fc.wrapperEl) {
      fc.wrapperEl.style.position = 'absolute'
      fc.wrapperEl.style.top = '0'
      fc.wrapperEl.style.left = '0'
    }
    fabricRef.current = fc
    return () => { fc.dispose(); fabricRef.current = null }
  }, [largura, altura])

  useEffect(() => {
    const fc = fabricRef.current
    if (!fc) return
    fc.clear()
    elementos.forEach((el) => {
      if (el.tipo === 'traco' && el.coords.length >= 2) {
        const pontos = el.coords.map(([x, y]) => ({ x: x * largura, y: y * altura }))
        const poly = new fabric.Polyline(pontos, { stroke: el.cor, strokeWidth: el.espessura, fill: 'transparent', selectable: false })
        ;(poly as any)._bipId = el.id
        fc.add(poly)
      }
      if (el.tipo === 'comentario' && el.coords[0]) {
        const [cx, cy] = el.coords[0]
        const circle = new fabric.Circle({ left: cx * largura - 8, top: cy * altura - 8, radius: 8, fill: el.cor, selectable: false })
        ;(circle as any)._bipId = el.id
        fc.add(circle)
      }
    })
    fc.renderAll()
  }, [elementos, largura, altura])

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
        onAdicionarElemento(pagina, { id: uuid(), tipo: 'traco', cor: corAtiva, espessura: espessuraAtiva, coords, criado_em: new Date().toISOString() })
      }
      fc.on('path:created', onPathCreated)
      return () => { fc.off('path:created', onPathCreated); fc.isDrawingMode = false }
    } else {
      fc.isDrawingMode = false
    }
  }, [ferramentaAtiva, corAtiva, espessuraAtiva, pagina, largura, altura, onAdicionarElemento])

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

  const comentarioHandler = useCallback((e: any) => {
    const fc = fabricRef.current
    if (!fc) return
    const pointer = fc.getScenePoint(e.e)
    const texto = prompt('Comentário:')
    if (!texto) return
    onAdicionarElemento(pagina, { id: uuid(), tipo: 'comentario', cor: corAtiva, espessura: 1, coords: [[pointer.x / largura, pointer.y / altura]], texto, criado_em: new Date().toISOString() })
  }, [corAtiva, largura, altura, pagina, onAdicionarElemento])

  useEffect(() => {
    const fc = fabricRef.current
    if (!fc || ferramentaAtiva !== 'comentario') return
    fc.on('mouse:down', comentarioHandler)
    return () => { fc.off('mouse:down', comentarioHandler) }
  }, [ferramentaAtiva, comentarioHandler])

  const balaoHandler = useCallback((e: any) => {
    const fc = fabricRef.current
    if (!fc) return
    const pointer = fc.getScenePoint(e.e)
    setBalaoEditando({ x: pointer.x / largura, y: pointer.y / altura, texto: '' })
  }, [largura, altura])

  useEffect(() => {
    const fc = fabricRef.current
    if (!fc || ferramentaAtiva !== 'balao') return
    fc.on('mouse:down', balaoHandler)
    return () => { fc.off('mouse:down', balaoHandler) }
  }, [ferramentaAtiva, balaoHandler])

  const confirmarBalao = useCallback(() => {
    if (!balaoEditando || !balaoEditando.texto.trim()) { setBalaoEditando(null); return }
    // coords[0] = ancora, coords[1] = posicao inicial do balao (deslocado)
    const bx = Math.min(0.95, balaoEditando.x + 160 / largura)
    const by = Math.max(0.02, balaoEditando.y - 100 / altura)
    onAdicionarElemento(pagina, {
      id: uuid(), tipo: 'balao', cor: corAtiva, espessura: 1,
      coords: [[balaoEditando.x, balaoEditando.y], [bx, by]],
      texto: balaoEditando.texto.trim(),
      criado_em: new Date().toISOString(),
    })
    setBalaoEditando(null)
  }, [balaoEditando, corAtiva, pagina, largura, altura, onAdicionarElemento])

  const balaosExistentes = elementos.filter(el => el.tipo === 'balao')

  // Drag balao
  const iniciarDrag = useCallback((e: React.MouseEvent, el: ElementoCanvas) => {
    e.stopPropagation()
    const startX = e.clientX, startY = e.clientY
    const origBx = (el.coords[1]?.[0] ?? el.coords[0][0] + 0.15) * largura
    const origBy = (el.coords[1]?.[1] ?? Math.max(0, el.coords[0][1] - 0.1)) * altura
    const div = document.getElementById('balao-' + el.id)
    const onMove = (mv: MouseEvent) => {
      if (div) { div.style.left = (origBx + mv.clientX - startX) + 'px'; div.style.top = (origBy + mv.clientY - startY) + 'px' }
    }
    const onUp = (mv: MouseEvent) => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      const newBx = (origBx + mv.clientX - startX) / largura
      const newBy = (origBy + mv.clientY - startY) / altura
      onRemoverElemento(pagina, el.id)
      setTimeout(() => onAdicionarElemento(pagina, { ...el, id: uuid(), coords: [el.coords[0], [newBx, newBy]] }), 50)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [largura, altura, pagina, onRemoverElemento, onAdicionarElemento])

  return (
    <div ref={containerRef} style={{
      position: 'absolute', top: 0, left: 0, width: largura, height: altura, zIndex: 10,
      pointerEvents: ferramentaAtiva ? 'all' : 'none',
      cursor: ferramentaAtiva === 'caneta' ? 'crosshair'
        : ferramentaAtiva === 'borracha' ? 'cell'
        : ferramentaAtiva === 'comentario' ? 'text'
        : ferramentaAtiva === 'balao' ? 'crosshair' : 'default',
    }}>
      <canvas ref={canvasRef} />

      {/* Setas SVG ancora→balao */}
      <svg style={{ position: 'absolute', top: 0, left: 0, width: largura, height: altura, zIndex: 25, pointerEvents: 'none', overflow: 'visible' }}>
        <defs>
          <marker id={`arr-${pagina}`} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="context-stroke" />
          </marker>
        </defs>
        {balaosExistentes.map((el) => {
          const ax = el.coords[0][0] * largura
          const ay = el.coords[0][1] * altura
          const bx2 = (el.coords[1]?.[0] ?? el.coords[0][0] + 0.15) * largura + 60
          const by2 = (el.coords[1]?.[1] ?? Math.max(0, el.coords[0][1] - 0.1)) * altura + 16
          const cor = el.cor || '#FFD600'
          return (
            <line key={el.id + '-seta'}
              x1={bx2} y1={by2} x2={ax} y2={ay}
              stroke={cor} strokeWidth="2.5" strokeLinecap="round"
              markerEnd={`url(#arr-${pagina})`}
            />
          )
        })}
      </svg>

      {/* Balões draggable */}
      {balaosExistentes.map((el) => {
        const bx2 = (el.coords[1]?.[0] ?? el.coords[0][0] + 0.15) * largura
        const by2 = (el.coords[1]?.[1] ?? Math.max(0, el.coords[0][1] - 0.1)) * altura
        const cor = el.cor || '#FFD600'
        return (
          <div id={'balao-' + el.id} key={el.id}
            onMouseDown={(e) => iniciarDrag(e, el)}
            style={{ position: 'absolute', left: bx2, top: by2, zIndex: 30, pointerEvents: 'all', cursor: 'grab' }}>
            <div style={{
              position: 'relative', background: cor, borderRadius: 10,
              padding: '6px 26px 6px 10px', minWidth: 100, maxWidth: 220,
              fontSize: 12, fontWeight: 600, color: (cor === '#1976D2' || cor === '#212121') ? '#ffffff' : '#1a1a1a',
              boxShadow: '0 2px 8px rgba(0,0,0,0.25)', wordBreak: 'break-word',
              lineHeight: 1.4, border: '1.5px solid rgba(0,0,0,0.15)', userSelect: 'none',
            }}>
              {el.texto}
              <button onMouseDown={e => e.stopPropagation()} onClick={() => onRemoverElemento(pagina, el.id)}
                style={{
                  position: 'absolute', top: -7, right: -7, width: 18, height: 18,
                  borderRadius: '50%', background: '#ef4444', color: '#fff', border: 'none',
                  fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontWeight: 700,
                }}>×</button>
            </div>
          </div>
        )
      })}

      {/* Input novo balao */}
      {balaoEditando && (
        <div style={{
          position: 'absolute',
          left: Math.min(largura - 220, balaoEditando.x * largura + 10),
          top: Math.max(10, balaoEditando.y * altura - 130),
          zIndex: 50, pointerEvents: 'all',
        }}>
          <div style={{
            background: corAtiva, borderRadius: 10, padding: '8px 10px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)', border: '1.5px solid rgba(0,0,0,0.15)',
          }}>
            <textarea autoFocus placeholder="Digite a observação..."
              value={balaoEditando.texto}
              onChange={e => setBalaoEditando(b => b ? { ...b, texto: e.target.value } : b)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); confirmarBalao() } if (e.key === 'Escape') setBalaoEditando(null) }}
              style={{
                width: 180, height: 70, resize: 'none',
                background: 'rgba(255,255,255,0.85)', border: 'none', borderRadius: 6,
                padding: '4px 6px', fontSize: 12, fontWeight: 500, color: '#1a1a1a',
                outline: 'none', display: 'block',
              }} />
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
