import React from 'react'
import CostIndicator from '../components/CostIndicator'
import '../styles/Dashboard.css'

export const Dashboard: React.FC = () => {
  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>📊 Dashboard</h1>
        <p>Bienvenido a BravoCRM - Visualiza el estado de tu negocio</p>
      </div>

      <CostIndicator />

      <div className="dashboard-grid">
        <div className="dashboard-card">
          <h3>🎯 Próximas Acciones</h3>
          <ul>
            <li>📋 Crear cotización nueva</li>
            <li>✅ Revisar cotizaciones pendientes</li>
            <li>🎯 Convertir cotización aceptada a proyecto</li>
            <li>📄 Generar facturas</li>
          </ul>
        </div>

        <div className="dashboard-card">
          <h3>📚 Módulos Disponibles</h3>
          <ul>
            <li>✅ 📊 Dashboard - Indicadores</li>
            <li>✅ 📋 Cotizaciones - CRUD completo</li>
            <li>⏳ 👥 Clientes - Próximamente</li>
            <li>⏳ 🎯 Proyectos - Próximamente</li>
            <li>⏳ 📄 Facturas - Próximamente</li>
          </ul>
        </div>

        <div className="dashboard-card">
          <h3>🚀 Versión</h3>
          <p className="version-info">
            <strong>BravoCRM v1.0.0</strong>
          </p>
          <p className="version-status">
            Modo: <span className="badge dev">Development (JSON)</span>
          </p>
          <p className="version-backend">
            Backend: <span className="badge">http://localhost:3000</span>
          </p>
        </div>
      </div>

      <div className="dashboard-features">
        <h2>✨ Características Implementadas</h2>
        <div className="features-grid">
          <div className="feature">
            <div className="feature-icon">🔐</div>
            <h4>Autenticación JWT</h4>
            <p>Login seguro con tokens JWT</p>
          </div>
          <div className="feature">
            <div className="feature-icon">📊</div>
            <h4>Dashboard KPIs</h4>
            <p>Indicadores en tiempo real</p>
          </div>
          <div className="feature">
            <div className="feature-icon">📋</div>
            <h4>Cotizaciones</h4>
            <p>CRUD completo con cálculos automáticos</p>
          </div>
          <div className="feature">
            <div className="feature-icon">💾</div>
            <h4>Base de Datos JSON</h4>
            <p>Persistencia local para desarrollo</p>
          </div>
          <div className="feature">
            <div className="feature-icon">🎨</div>
            <h4>Dark Theme</h4>
            <p>Interfaz moderna y responsiva</p>
          </div>
          <div className="feature">
            <div className="feature-icon">📱</div>
            <h4>Responsive Design</h4>
            <p>Compatible con móviles y tablets</p>
          </div>
        </div>
      </div>

      <div className="dashboard-info">
        <h2>📖 Próximas Fases</h2>
        <div className="phases">
          <div className="phase completed">
            <span className="phase-number">1-4</span>
            <h4>Setup + Auth + CRUD + Dashboard</h4>
            <p>✅ Completado</p>
          </div>
          <div className="phase pending">
            <span className="phase-number">5</span>
            <h4>Sync Service</h4>
            <p>Sincronización con Neon PostgreSQL</p>
          </div>
          <div className="phase pending">
            <span className="phase-number">6</span>
            <h4>Error Handling</h4>
            <p>Logging y manejo de errores mejorado</p>
          </div>
          <div className="phase pending">
            <span className="phase-number">7-8</span>
            <h4>Deploy</h4>
            <p>Vercel + Neon PostgreSQL</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
