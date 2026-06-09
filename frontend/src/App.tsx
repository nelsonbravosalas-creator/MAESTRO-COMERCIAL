import { useEffect, useState } from 'react'
import './App.css'
import Login from './pages/Login'
import Quotations from './pages/Quotations'
import Dashboard from './pages/Dashboard'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [currentPage, setCurrentPage] = useState<'dashboard' | 'quotations' | 'clients' | 'projects' | 'invoices'>('dashboard')
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    const token = localStorage.getItem('authToken')
    const userData = localStorage.getItem('user')

    if (token && userData) {
      setIsAuthenticated(true)
      setUser(JSON.parse(userData))
    }
  }, [])

  const handleLoginSuccess = (token: string) => {
    setIsAuthenticated(true)
    const userData = localStorage.getItem('user')
    if (userData) {
      setUser(JSON.parse(userData))
    }
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

  return (
    <div className="app-container authenticated">
      {/* HEADER */}
      <header className="app-header">
        <div className="header-left">
          <h1>🚀 BravoCRM</h1>
        </div>

        <nav className="header-nav">
          <button
            className={`nav-btn ${currentPage === 'dashboard' ? 'active' : ''}`}
            onClick={() => setCurrentPage('dashboard')}
          >
            📊 Dashboard
          </button>
          <button
            className={`nav-btn ${currentPage === 'quotations' ? 'active' : ''}`}
            onClick={() => setCurrentPage('quotations')}
          >
            📋 Cotizaciones
          </button>
          <button
            className={`nav-btn ${currentPage === 'clients' ? 'active' : ''}`}
            onClick={() => setCurrentPage('clients')}
          >
            👥 Clientes
          </button>
          <button
            className={`nav-btn ${currentPage === 'projects' ? 'active' : ''}`}
            onClick={() => setCurrentPage('projects')}
          >
            🎯 Proyectos
          </button>
          <button
            className={`nav-btn ${currentPage === 'invoices' ? 'active' : ''}`}
            onClick={() => setCurrentPage('invoices')}
          >
            📄 Facturas
          </button>
        </nav>

        <div className="header-right">
          <div className="user-info">
            <span className="user-name">{user?.name || 'Usuario'}</span>
            <span className={`user-role ${user?.role || 'user'}`}>{user?.role || 'user'}</span>
          </div>
          <button className="btn-logout" onClick={handleLogout}>
            🚪 Salir
          </button>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="app-main authenticated">
        {currentPage === 'dashboard' && <Dashboard />}
        {currentPage === 'quotations' && <Quotations />}
        {currentPage === 'clients' && <div className="page-placeholder">👥 Módulo de Clientes - Próximamente</div>}
        {currentPage === 'projects' && <div className="page-placeholder">🎯 Módulo de Proyectos - Próximamente</div>}
        {currentPage === 'invoices' && <div className="page-placeholder">📄 Módulo de Facturas - Próximamente</div>}
      </main>
    </div>
  )
}

export default App
