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

  const base: React.CSSProperties = { background: 'var(--bg-primary)', minHeight: '100vh', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", color: 'var(--text-primary)', display: 'flex', flexDirection: 'column' }
  const header: React.CSSProperties = { borderBottom: '1px solid var(--border)', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface)', flexShrink: 0 }
  const center: React.CSSProperties = { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff44', fontSize: 12, letterSpacing: 2 }

  if (carregando) return <div style={base}><div style={center}>CARREGANDO…</div></div>
  if (erro || !lei) return (
    <div style={base}>
      <div style={header}>
        <span style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 700 }}>BDI — BIP</span>
        <button onClick={() => router.push('/admin/bdi/leis')} style={{ background: 'var(--bg-secondary)', border: '1.5px solid var(--border-strong)', color: 'var(--text-secondary)', padding: '6px 14px', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>← VOLTAR</button>
      </div>
      <div style={{ ...center, color: '#fca5a5' }}>⚠ {erro || 'Lei não encontrada.'}</div>
    </div>
  )

  return (
    <div style={base}>
      <div style={header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.push('/')} style={{ background: '#1E293B', border: 'none', color: '#fff', fontWeight: 700, padding: '6px 14px', borderRadius: 4, cursor: 'pointer', fontSize: 12, marginRight: 8 }}>🏠 Home</button><span style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 700 }}>📚 BIP — Biblioteca Inteligente para Pesquisas</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>·</span>
          <span style={{ color: 'var(--text-primary)', fontSize: 12, fontWeight: 600 }}>{lei.titulo}</span>
          {lei.numero && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Nº {lei.numero}</span>}
          {lei.ano && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>· {lei.ano}</span>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => router.push('/admin/bdi/leis')} style={{ background: 'var(--bg-secondary)', border: '1.5px solid var(--border-strong)', color: 'var(--text-secondary)', padding: '6px 14px', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>← LEIS</button>
          <button onClick={() => router.push('/')} style={btn('#ffffff66')}>⌂ HOME</button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <BipPdfViewer leiId={lei.id} pdfUrl={`/api/bdi/bip/pdf-proxy?lei_id=${lei.id}`} nomeLei={lei.titulo} />
      </div>
    </div>
  )
}
