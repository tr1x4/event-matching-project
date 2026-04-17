import { type FormEvent, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { registerRequest, userFacingRequestError } from '../api/client'
import { useAuth } from '../context/AuthContext'
import './FormPage.css'

export function RegisterPage() {
  const { setSession, token } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (token) return <Navigate to="/" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await registerRequest(email, password)
      await setSession(res)
      navigate('/', { replace: true })
    } catch (err) {
      setError(userFacingRequestError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <div className="auth-brand">
        <img src="/logo.svg" alt="" width={40} height={40} />
      </div>
      <h1>Регистрация</h1>
      <form onSubmit={onSubmit} className="form">
        <label>
          Электронная почта
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Пароль
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            maxLength={128}
          />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? 'Создание…' : 'Создать аккаунт'}
        </button>
      </form>
      <p className="footer-link">
        Уже есть аккаунт? <Link to="/login">Вход</Link>
      </p>
    </div>
  )
}
