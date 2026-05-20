'use client'

import { useEffect, useRef, useCallback } from 'react'
import * as fabric from 'fabric'
import { v4 as uuid } from 'uuid'
import type { ElementoCanvas } from '@/hooks/useBipAnotacoes'

export type Ferramenta = 'caneta' | 'borracha' | 'comentario' | 'clipe' | null

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

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute', top: 0, left: 0,
        width: largura, height: altura, zIndex: 10,
        pointerEvents: ferramentaAtiva ? 'all' : 'none',
        cursor: ferramentaAtiva === 'caneta' ? 'crosshair'
          : ferramentaAtiva === 'borracha' ? 'cell'
          : ferramentaAtiva === 'comentario' ? 'text' : 'default',
      }}
    >
      <canvas ref={canvasRef} />
    </div>
  )
}
