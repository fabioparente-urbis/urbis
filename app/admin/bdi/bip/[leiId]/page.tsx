'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import dynamic from 'next/dynamic'

const BipPdfViewer = dynamic(() => import('@/components/bip/BipPdfViewer'), {
  ssr: false,
  loading: () => <div style={{ color: '#ffffff44', fontSize: 12, letterSpacing: 2, padding: 40 }}>CARREGANDO VISUALIZADOR…</div>,
})

type Lei = { id: string; titulo: string; numero?: string | null; ano?: string | null; url_pdf?: string | null }

const btn = (cor: string): React.CSSProperties => ({
  background: cor + '22', border: `1px solid ${cor}55`, color: cor,
  padding: '6px 14px', borderRadius: 4, cursor: 'pointer',
  fontSize: 11, fontFamily: 'inherit', letterSpacing: 1, whiteSpace: 'nowrap',
})

export default function BipLeiPage() {
  const router = useRouter()
  const { leiId } = useParams() as { leiId: string }
  const [lei, setLei] = useState<Lei | null>(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    if (!leiId) return
    ;(async () => {
      try {
        const me = await fetch('/api/auth/me')
        const meJson = await me.json()
        if (!meJson.ok) { router.push('/login'); return }
        const res = await fetch('/api/admin/bdi/leis', { cache: 'no-store' })
        const json = await res.json()
        if (!json.ok) { setErro('Falha ao carregar lei.'); return }
        const encontrada = (json.data ?? []).find((l: Lei) => l.id === leiId)
        if (!encontrada) { setErro('Lei não encontrada.'); return }
        if (!encontrada.url_pdf) { setErro('Esta lei ainda não tem PDF vinculado.'); return }
        setLei(encontrada)
      } catch { setErro('Erro de rede.') }
      finally { setCarregando(false) }
    })()
  }, [leiId, router])

  const base: React.CSSProperties = { background: '#0a0a0f', minHeight: '100vh', fontFamily: "'JetBrains Mono', monospace", color: '#e2e8f0', display: 'flex', flexDirection: 'column' }
  const header: React.CSSProperties = { borderBottom: '1px solid #d946ef33', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0d0d14', flexShrink: 0 }
  const center: React.CSSProperties = { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff44', fontSize: 12, letterSpacing: 2 }

  if (carregando) return <div style={base}><div style={center}>CARREGANDO…</div></div>
  if (erro || !lei) return (
    <div style={base}>
      <div style={header}>
        <span style={{ color: '#d946ef', fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>BDI — BIP</span>
        <button onClick={() => router.push('/admin/bdi/leis')} style={btn('#ffffff66')}>← VOLTAR</button>
      </div>
      <div style={{ ...center, color: '#fca5a5' }}>⚠ {erro || 'Lei não encontrada.'}</div>
    </div>
  )

  return (
    <div style={base}>
      <div style={header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: '#d946ef', fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>BIP</span>
          <span style={{ color: '#ffffff55', fontSize: 11 }}>·</span>
          <span style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 600 }}>{lei.titulo}</span>
          {lei.numero && <span style={{ color: '#ffffff44', fontSize: 11 }}>Nº {lei.numero}</span>}
          {lei.ano && <span style={{ color: '#ffffff44', fontSize: 11 }}>· {lei.ano}</span>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => router.push('/admin/bdi/leis')} style={btn('#ffffff66')}>← LEIS</button>
          <button onClick={() => router.push('/')} style={btn('#ffffff66')}>⌂ HOME</button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <BipPdfViewer leiId={lei.id} pdfUrl={`/api/bdi/bip/pdf-proxy?lei_id=${lei.id}`} nomeLei={lei.titulo} />
      </div>
    </div>
  )
}
