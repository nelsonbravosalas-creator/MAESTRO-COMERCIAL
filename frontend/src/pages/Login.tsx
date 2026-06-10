import React, { useState } from 'react'
import '../styles/Login.css'

interface LoginProps {
  onLoginSuccess: (token: string) => void
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const apiBase = import.meta.env.VITE_API_URL ?? ''
      const response = await fetch(`${apiBase}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })

      if (!response.ok) {
        const data = await response.json()
        setError(data.message || 'Email o contraseña inválidos')
        return
      }

      const data = await response.json()
      localStorage.setItem('authToken', data.token)
      if (data.refresh_token) localStorage.setItem('refreshToken', data.refresh_token)
      localStorage.setItem('user', JSON.stringify(data.user))
      onLoginSuccess(data.token)
    } catch (err: any) {
      setError('Error conectando con el servidor')
      console.error('Login error:', err)
    } finally {
      setLoading(false)
    }
  }

  const quickLogin = (testEmail: string, testPassword: string) => {
    setEmail(testEmail)
    setPassword(testPassword)
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>🚀 BravoCRM</h1>
          <p>Sistema de Gestión Comercial</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button
            type="submit"
            className="btn-login"
            disabled={loading}
          >
            {loading ? '⏳ Ingresando...' : '🔓 Ingresar'}
          </button>
        </form>

        <div className="quick-access">
          <p>Usuarios de Prueba:</p>
          <div className="test-buttons">
            <button
              type="button"
              className="btn-test admin"
              onClick={() => quickLogin('nbravo.nbyb@gmail.com', '3571')}
              disabled={loading}
            >
              👨‍💼 Admin
              <small>nbravo / 3571</small>
            </button>
            <button
              type="button"
              className="btn-test manager"
              onClick={() => quickLogin('hmeza.nbyb@gmail.com', '4321')}
              disabled={loading}
            >
              👤 Manager
              <small>hmeza / 4321</small>
            </button>
          </div>
        </div>

        <div className="login-info">
          <p>
            <strong>Modo Development:</strong> Base de datos JSON local
          </p>
          <p>Backend: http://localhost:3000</p>
        </div>
      </div>
    </div>
  )
}

export default Login
