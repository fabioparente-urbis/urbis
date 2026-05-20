import { useCallback, useEffect, useRef, useState } from 'react'

export type TipoElemento = 'traco' | 'comentario' | 'clipe'

export interface ElementoCanvas {
  id: string
  tipo: TipoElemento
  cor: string
  espessura: number
  coords: number[][]
  texto?: string
  criado_em: string
}

interface UseBipAnotacoesProps {
  leiId: string
}

export function useBipAnotacoes({ leiId }: UseBipAnotacoesProps) {
  const [anotacoes, setAnotacoes] = useState<Record<number, ElementoCanvas[]>>({})
  const [clipes, setClipes] = useState<number[]>([])
  const [carregando, setCarregando] = useState(true)
  const debounceRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    if (!leiId) return
    async function carregar() {
      setCarregando(true)
      try {
        const res = await fetch(`/api/bdi/bip/anotacoes?lei_id=${leiId}`)
        const json = await res.json()
        if (!json.ok) return
        const mapa: Record<number, ElementoCanvas[]> = {}
        let clipesMarcados: number[] = []
        json.data?.forEach((row: any) => {
          mapa[row.pagina] = row.camada_vetorial ?? []
          if (row.pagina === 0 && row.clipes_marcadores?.length) {
            clipesMarcados = row.clipes_marcadores
          }
        })
        setAnotacoes(mapa)
        setClipes(clipesMarcados)
      } finally {
        setCarregando(false)
      }
    }
    carregar()
  }, [leiId])

  const salvarPagina = useCallback((pagina: number, elementos: ElementoCanvas[]) => {
    if (debounceRef.current[pagina]) clearTimeout(debounceRef.current[pagina])
    debounceRef.current[pagina] = setTimeout(() => {
      fetch('/api/bdi/bip/anotacoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lei_id: leiId, pagina, camada_vetorial: elementos }),
      })
    }, 1500)
  }, [leiId])

  const salvarClipes = useCallback((novosClipes: number[]) => {
    fetch('/api/bdi/bip/anotacoes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lei_id: leiId, pagina: 0, camada_vetorial: [], clipes_marcadores: novosClipes }),
    })
  }, [leiId])

  const registrarHistorico = useCallback((acao: string, pagina?: number, elementoId?: string) => {
    fetch('/api/bdi/bip/historico', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lei_id: leiId, acao, pagina, elemento_id: elementoId }),
    })
  }, [leiId])

  const adicionarElemento = useCallback((pagina: number, elemento: ElementoCanvas) => {
    setAnotacoes((prev) => {
      const lista = [...(prev[pagina] ?? []), elemento]
      salvarPagina(pagina, lista)
      return { ...prev, [pagina]: lista }
    })
    const label = elemento.tipo === 'traco' ? 'Traço' : elemento.tipo === 'comentario' ? 'Comentário' : 'Clipe'
    registrarHistorico(`${label} adicionado na página ${pagina}`, pagina, elemento.id)
    carregarHistorico()
  }, [salvarPagina, registrarHistorico])

  const removerElemento = useCallback((pagina: number, elementoId: string) => {
    setAnotacoes((prev) => {
      const lista = (prev[pagina] ?? []).filter((e) => e.id !== elementoId)
      salvarPagina(pagina, lista)
      return { ...prev, [pagina]: lista }
    })
    registrarHistorico(`Elemento removido na página ${pagina}`, pagina, elementoId)
    carregarHistorico()
  }, [salvarPagina, registrarHistorico])

  const toggleClipe = useCallback((pagina: number) => {
    setClipes((prev) => {
      const novos = prev.includes(pagina) ? prev.filter((p) => p !== pagina) : [...prev, pagina]
      salvarClipes(novos)
      registrarHistorico(
        prev.includes(pagina) ? `Clipe removido da página ${pagina}` : `Clipe inserido na página ${pagina}`,
        pagina
      )
      return novos
    })
    carregarHistorico()
  }, [salvarClipes, registrarHistorico])

  const [historico, setHistorico] = useState<{id: string, acao: string, pagina: number | null, criado_em: string}[]>([])

  const carregarHistorico = useCallback(async () => {
    const res = await fetch(`/api/bdi/bip/historico?lei_id=${leiId}`)
    const json = await res.json()
    if (json.ok) setHistorico(json.data ?? [])
  }, [leiId])

  useEffect(() => { carregarHistorico() }, [carregarHistorico])

  return { anotacoes, clipes, carregando, adicionarElemento, removerElemento, toggleClipe, historico, carregarHistorico }
}
