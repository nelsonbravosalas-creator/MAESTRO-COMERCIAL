import { useEffect, useState } from 'react'
import './App.css'
import Login from './pages/Login'
import Quotations from './pages/Quotations'
import Dashboard from './pages/Dashboard'
import Clients from './pages/Clients'
import Catalogo from './pages/Catalogo'
import { useMaestro } from './stores/maestro-store'

type Page = 'dashboard' | 'quotations' | 'clients' | 'catalogo' | 'projects' | 'invoices'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [currentPage, setCurrentPage] = useState<Page>('dashboard')
  const [user, setUser] = useState<any>(null)
  const loadData = useMaestro(s => s.loadData)

  useEffect(() => {
    const token = localStorage.getItem('authToken')
    const userData = localStorage.getItem('user')
    if (token && userData) {
      setIsAuthenticated(true)
      setUser(JSON.parse(userData))
      loadData()
    }
  }, [])

  const handleLoginSuccess = (_token: string) => {
    setIsAuthenticated(true)
    const userData = localStorage.getItem('user')
    if (userData) setUser(JSON.parse(userData))
    loadData()
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
          </button>
          <button type="button" className={cls('invoices')}   onClick={() => nav('invoices')}>
            Facturas
          </button>
        </nav>

        <div className="header-right">
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
        {currentPage === 'projects'   && <div className="page-placeholder">Módulo de Proyectos — Próximamente</div>}
        {currentPage === 'invoices'   && <div className="page-placeholder">Módulo de Facturas — Próximamente</div>}
      </main>
    </div>
  )
}

export default App
