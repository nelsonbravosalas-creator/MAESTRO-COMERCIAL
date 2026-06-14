import { useEffect, useState } from 'react'
import './App.css'
import Login from './pages/Login'
import Quotations from './pages/Quotations'
import Dashboard from './pages/Dashboard'
import Clients from './pages/Clients'
import Catalogo from './pages/Catalogo'
import Projects from './pages/Projects'
import { useMaestro } from './stores/maestro-store'
import { useProjects } from './stores/projects-store'

type SyncPhase = 'idle' | 'syncing' | 'done' | 'error'

function NavSyncButton() {
  const forceSyncAll = useMaestro(s => s.forceSyncAll)
  const apiReady     = useMaestro(s => s.apiReady)
  const [phase, setPhase]   = useState<SyncPhase>('idle')
  const [counts, setCounts] = useState({ pushed: 0, pulled: 0 })

  const handleSync = async () => {
    if (phase === 'syncing') return
    setPhase('syncing')
    try {
      const r = await forceSyncAll()
      setCounts({ pushed: r.pushed, pulled: r.pulled })
      setPhase(r.errors > 0 ? 'error' : 'done')
    } catch {
      setPhase('error')
    }
    setTimeout(() => setPhase('idle'), 4000)
  }

  const label = (() => {
    if (phase === 'syncing') return 'Sync…'
    if (phase === 'done') {
      const total = counts.pushed + counts.pulled
      return total === 0 ? 'Al día' : `↑${counts.pushed} ↓${counts.pulled}`
    }
    if (phase === 'error') return 'Error'
    return 'Sync'
  })()

  const title = (() => {
    if (phase === 'syncing') return 'Sincronizando datos…'
    if (phase === 'done') return `Listo — ↑${counts.pushed} subidos, ↓${counts.pulled} descargados`
    if (phase === 'error') return 'Error de sincronización — revisa la conexión'
    return 'Sincronización bidireccional: sube datos locales y descarga actualizaciones del servidor'
  })()

  return (
    <button
      type="button"
      className={`nav-sync-btn nav-sync-btn--${phase}${!apiReady ? ' nav-sync-btn--offline' : ''}`}
      onClick={handleSync}
      disabled={phase === 'syncing'}
      title={title}
    >
      <span className={phase === 'syncing' ? 'nav-sync-spin' : ''} style={{ display: 'inline-flex' }}>
        {phase === 'idle'    && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 4v6h6"/><path d="M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10"/><path d="M3.51 15a9 9 0 0 0 14.85 3.36L23 14"/></svg>}
        {phase === 'syncing' && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2a10 10 0 1 0 10 10"/></svg>}
        {phase === 'done'    && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
        {phase === 'error'   && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}
      </span>
      <span className="nav-sync-label">{label}</span>
    </button>
  )
}

type Page = 'dashboard' | 'quotations' | 'clients' | 'catalogo' | 'projects' | 'invoices'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [currentPage, setCurrentPage] = useState<Page>('dashboard')
  const [user, setUser] = useState<any>(null)
  const loadData = useMaestro(s => s.loadData)
  const criticalCount = useProjects(s => s.criticalCount)

  useEffect(() => {
    const token = localStorage.getItem('authToken')
    const userData = localStorage.getItem('user')
    if (token && userData) {
      setIsAuthenticated(true)
      setUser(JSON.parse(userData))
      loadData()
      useProjects.getState().loadProjects()
    }
  }, [])

  const handleLoginSuccess = (_token: string) => {
    setIsAuthenticated(true)
    const userData = localStorage.getItem('user')
    if (userData) setUser(JSON.parse(userData))
    loadData()
    useProjects.getState().loadProjects()
  }

  const handleLogout = () => {
    localStorage.removeItem('authToken')
    localStorage.removeItem('user')
    setIsAuthenticated(false)
    setUser(null)
    setCurrentPage('dashboard')
  }

  if (!isAuthenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} />
  }

  const nav = (page: Page) => setCurrentPage(page)
  const cls = (page: Page) => `nav-btn ${currentPage === page ? 'active' : ''}`

  return (
    <div className="app-container authenticated">
      <header className="app-header">
        <div className="header-left">
          <h1>Maestro Comercial</h1>
        </div>

        <nav className="header-nav">
          <button type="button" className={cls('dashboard')}  onClick={() => nav('dashboard')}>
            Dashboard
          </button>
          <button type="button" className={cls('quotations')} onClick={() => nav('quotations')}>
            Cotizaciones
          </button>
          <button type="button" className={cls('clients')}    onClick={() => nav('clients')}>
            Clientes
          </button>
          <button type="button" className={cls('catalogo')}   onClick={() => nav('catalogo')}>
            Maestro de Precios
          </button>
          <button type="button" className={cls('projects')}   onClick={() => nav('projects')}>
            Proyectos
            {criticalCount > 0 && <span className="nav-badge">{criticalCount}</span>}
          </button>
          <button type="button" className={cls('invoices')}   onClick={() => nav('invoices')}>
            Facturas
          </button>
        </nav>

        <div className="header-right">
          <NavSyncButton />
          <div className="user-info">
            <span className="user-name">{user?.name || 'Usuario'}</span>
            <span className={`user-role ${user?.role || 'user'}`}>{user?.role || 'user'}</span>
          </div>
          <button type="button" className="btn-logout" onClick={handleLogout}>
            Salir
          </button>
        </div>
      </header>

      <main className="app-main authenticated">
        {currentPage === 'dashboard'  && <Dashboard />}
        {currentPage === 'quotations' && <Quotations />}
        {currentPage === 'clients'    && <Clients />}
        {currentPage === 'catalogo'   && <Catalogo />}
        {currentPage === 'projects'   && <Projects />}
        {currentPage === 'invoices'   && <div className="page-placeholder">Módulo de Facturas — Próximamente</div>}
      </main>
    </div>
  )
}

export default App
