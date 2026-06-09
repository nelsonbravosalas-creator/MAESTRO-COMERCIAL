import { useEffect, useState } from 'react'
import './App.css'

function App() {
  const [message, setMessage] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    setMessage('BravoCRM - Gestor Comercial')
  }, [])

  const handleTestApi = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/health')
      const data = await response.json()
      setMessage(`Backend conectado: ${data.status}`)
    } catch (error) {
      setMessage('Error conectando con el backend')
      console.error(error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>🚀 BravoCRM</h1>
        <p>Plataforma de Gestión Comercial - Cotizaciones | Planificación | Ejecución | Facturación</p>
      </header>

      <main className="app-main">
        <div className="card">
          <h2>Estado de la Aplicación</h2>
          <p className="status-message">{message}</p>
          <button
            onClick={handleTestApi}
            disabled={isLoading}
            className="btn-primary"
          >
            {isLoading ? 'Conectando...' : 'Verificar Backend'}
          </button>
        </div>

        <div className="card">
          <h3>Próximas Fases</h3>
          <ul>
            <li>✅ FASE 1: Setup Base</li>
            <li>⏳ FASE 2: Database & Auth</li>
            <li>⏳ FASE 3: Core Modules</li>
            <li>⏳ FASE 4: Dashboard & Costos</li>
            <li>⏳ FASE 5: Sync Service</li>
            <li>⏳ FASE 6: Error Handling</li>
            <li>⏳ FASE 7: Frontend Polish</li>
            <li>⏳ FASE 8: Deploy Vercel + Neon</li>
          </ul>
        </div>
      </main>
    </div>
  )
}

export default App
