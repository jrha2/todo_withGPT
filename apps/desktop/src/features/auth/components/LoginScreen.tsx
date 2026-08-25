import { useEffect, useState } from 'react'
import {
  getAuthServerUrl,
  login,
  setAuthServerUrl,
  type AuthUser,
} from '../../../services/api/authApi'

type LoginScreenProps = {
  onLogin: (user: AuthUser) => void
}

function LoginScreen({ onLogin }: LoginScreenProps) {
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [serverUrl, setServerUrl] = useState('http://127.0.0.1:4310')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    getAuthServerUrl().then(setServerUrl).catch((error) => {
      console.error('Failed to load server URL:', error)
    })
  }, [])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!loginId.trim() || !password) {
      setErrorMessage('ID와 비밀번호를 모두 입력해 주세요.')
      return
    }

    setIsSubmitting(true)
    setErrorMessage('')

    try {
      await setAuthServerUrl(serverUrl)
      onLogin(await login(loginId.trim(), password.trim()))
    } catch (error) {
      console.error('Login failed:', error)
      const message = String(error instanceof Error ? error.message : error)
      setErrorMessage(
        message.includes('AUTH_API_UNAVAILABLE')
          ? 'Electron 인증 기능이 아직 적용되지 않았습니다. 앱과 개발 서버를 완전히 종료한 후 다시 실행해 주세요.'
          : message.includes('SERVER_UNAVAILABLE')
            ? '임시 서버에 연결할 수 없습니다. 서버 PC에서 앱 서버가 실행 중인지 확인해 주세요.'
          : message.includes('INVALID_SERVER_URL')
            ? '서버 주소는 http:// 또는 https://로 시작해야 합니다.'
          : message.includes('LOGIN_FAILED')
            ? 'ID 또는 비밀번호가 올바르지 않거나 비활성 계정입니다.'
            : `로그인 처리 중 오류가 발생했습니다. (${message})`,
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="login-screen">
      <section className="login-card">
        <div className="login-brand-mark">✓</div>
        <div className="login-heading">
          <span>투자기획팀 업무관리 공간 · BETA 0.9.8</span>
          <h1>다시 만나서 반가워요</h1>
          <p>팀 계정으로 로그인해 Task와 알림을 이어서 관리하세요.</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="login-server-field">
            서버 주소
            <input
              type="url"
              value={serverUrl}
              onChange={(event) => setServerUrl(event.target.value)}
              placeholder="http://서버-PC-IP:4310"
              required
            />
            <small>이 PC가 서버라면 기본 주소를 그대로 사용하세요.</small>
          </label>
          <label>
            로그인 ID
            <input
              type="text"
              value={loginId}
              onChange={(event) => setLoginId(event.target.value)}
              placeholder="ID 입력"
              autoComplete="username"
              autoFocus
            />
          </label>
          <label className="login-password-label">
            비밀번호
            <div className="login-password-input">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="비밀번호 입력"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
              >
                {showPassword ? '숨기기' : '보기'}
              </button>
            </div>
          </label>

          {errorMessage && <div className="login-error">{errorMessage}</div>}

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <p className="login-device-note">
          로그인 상태는 이 기기에 안전하게 유지되며, 로그아웃할 때까지 다시 입력하지 않아도 됩니다.
        </p>
      </section>
    </main>
  )
}

export default LoginScreen
