/**
 * Preview de desenvolvimento do POS do bar (`npm run dev:pos`).
 *
 * Monta o hub dentro da mesma casca do portal do cliente, mas contra o
 * Supabase em memória de `mockSupabase.js`. Serve para revisar e demonstrar
 * as telas sem credenciais e sem tocar no banco de produção. Nada aqui entra
 * no bundle do app — o build normal (`npm run build`) usa `vite.config.js`,
 * que nem enxerga esta pasta.
 */

import React from 'react'
import ReactDOM from 'react-dom/client'
import './fakeApi'
import { I18nProvider, useI18n } from '../../src/lib/i18n'
import { AuthProvider } from '../../src/components/Auth'
import PosHub from '../../src/components/pos/PosHub'
import { PREVIEW_BAR } from './seed'
import '../../src/index.css'

function PreviewShell() {
  const { lang, setLang } = useI18n()
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--gold)' }}>JBM Drinks</div>
        </div>
        <nav className="sidebar-nav">
          <button className="nav-item active"><span>🍸</span><span>Bar POS</span></button>
        </nav>
        <div className="sidebar-footer">
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Preview
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)', marginBottom: 12 }}>{PREVIEW_BAR.nome}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {['en', 'ja'].map(id => (
              <button
                key={id}
                onClick={() => setLang(id)}
                className="btn-secondary"
                style={{ padding: '6px 12px', fontSize: 11, opacity: lang === id ? 1 : 0.5 }}
              >
                {id.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </aside>
      <main className="app-main app-main-wide">
        <PosHub bar={PREVIEW_BAR} />
      </main>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <I18nProvider>
      <AuthProvider>
        <PreviewShell />
      </AuthProvider>
    </I18nProvider>
  </React.StrictMode>,
)
