import React, { useRef, useState } from 'react'
import '../styles/Login.css'

interface LoginProps {
  onLoginSuccess: (token: string) => void
}

type Mode = 'login' | 'forgot' | 'reset'

const apiBase = import.meta.env.VITE_API_URL ?? ''

function resetTokenFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get('token')
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const forgotEmailRef = useRef<HTMLInputElement>(null)
  const newPasswordRef = useRef<HTMLInputElement>(null)

  const [mode, setMode] = useState<Mode>(resetTokenFromUrl() ? 'reset' : 'login')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const email = emailRef.current?.value.trim() ?? ''
    const password = passwordRef.current?.value ?? ''

    setError('')
    setLoading(true)

    try {
      const response = await fetch(`${apiBase}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    } catch (err) {
      setError('Error conectando con el servidor')
      console.error('Login error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const email = forgotEmailRef.current?.value.trim() ?? ''
    setError('')
    setInfo('')
    setLoading(true)
    try {
      await fetch(`${apiBase}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      // El backend siempre responde 202 exista o no el correo (A-04, AC-4.1):
      // el mensaje acá es igual de genérico a propósito.
      setInfo('Si el correo existe, te enviamos un enlace para restablecer tu contraseña.')
    } catch {
      setInfo('Si el correo existe, te enviamos un enlace para restablecer tu contraseña.')
    } finally {
      setLoading(false)
    }
  }

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const token = resetTokenFromUrl()
    const password = newPasswordRef.current?.value ?? ''
    setError('')
    setInfo('')
    setLoading(true)
    try {
      const response = await fetch(`${apiBase}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await response.json()
      if (!response.ok) {
        setError(data.message || 'No se pudo restablecer la contraseña')
        return
      }
      // Limpia el token de la URL para que no quede reutilizable desde el historial.
      window.history.replaceState({}, '', window.location.pathname)
      setInfo('Contraseña actualizada. Ya puedes iniciar sesión.')
      setMode('login')
    } catch {
      setError('Error conectando con el servidor')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>🚀 BravoCRM</h1>
          <p>Sistema de Gestión Comercial</p>
        </div>

        {mode === 'login' && (
          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                ref={emailRef}
                type="email"
                placeholder="tu@email.com"
                required
                disabled={loading}
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Contraseña</label>
              <input
                id="password"
                ref={passwordRef}
                type="password"
                placeholder="••••••••"
                required
                disabled={loading}
                autoComplete="current-password"
              />
            </div>

            {error && <div className="error-message">{error}</div>}
            {info && <div className="login-info">{info}</div>}

            <button type="submit" className="btn-login" disabled={loading}>
              {loading ? '⏳ Ingresando...' : '🔓 Ingresar'}
            </button>

            <button
              type="button"
              className="btn-link"
              onClick={() => {
                setError('')
                setInfo('')
                setMode('forgot')
              }}
            >
              ¿Olvidaste tu contraseña?
            </button>
          </form>
        )}

        {mode === 'forgot' && (
          <form onSubmit={handleForgotSubmit} className="login-form">
            <p>Ingresa tu correo y te enviaremos un enlace para restablecer tu contraseña.</p>
            <div className="form-group">
              <label htmlFor="forgot-email">Email</label>
              <input
                id="forgot-email"
                ref={forgotEmailRef}
                type="email"
                placeholder="tu@email.com"
                required
                disabled={loading}
                autoComplete="email"
              />
            </div>

            {info && <div className="login-info">{info}</div>}

            <button type="submit" className="btn-login" disabled={loading}>
              {loading ? '⏳ Enviando...' : 'Enviar enlace'}
            </button>

            <button
              type="button"
              className="btn-link"
              onClick={() => {
                setInfo('')
                setMode('login')
              }}
            >
              Volver a iniciar sesión
            </button>
          </form>
        )}

        {mode === 'reset' && (
          <form onSubmit={handleResetSubmit} className="login-form">
            <p>Elige tu nueva contraseña (mínimo 8 caracteres, no solo números).</p>
            <div className="form-group">
              <label htmlFor="new-password">Nueva contraseña</label>
              <input
                id="new-password"
                ref={newPasswordRef}
                type="password"
                placeholder="••••••••"
                required
                disabled={loading}
                autoComplete="new-password"
              />
            </div>

            {error && <div className="error-message">{error}</div>}
            {info && <div className="login-info">{info}</div>}

            <button type="submit" className="btn-login" disabled={loading}>
              {loading ? '⏳ Guardando...' : 'Guardar contraseña'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default Login
