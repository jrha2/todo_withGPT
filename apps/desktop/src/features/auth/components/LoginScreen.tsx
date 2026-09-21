import { useEffect, useState } from 'react'
import {
  getAuthServerUrl,
  getServerMigrationNotice,
  login,
  setAuthServerUrl,
  signup,
  type AuthUser,
} from '../../../services/api/authApi'

type LoginScreenProps = {
  onLogin: (user: AuthUser) => void
}

function mapAccountError(message: string) {
  if (message.includes('AUTH_API_UNAVAILABLE')) {
    return 'Electron 인증 기능이 아직 적용되지 않았습니다. 앱과 개발 서버를 완전히 종료한 후 다시 실행해 주세요.'
  }
  if (message.includes('SERVER_UNAVAILABLE')) {
    return '임시 서버에 연결할 수 없습니다. 서버 PC에서 앱 서버가 실행 중인지 확인해 주세요.'
  }
  if (message.includes('INVALID_SERVER_URL')) {
    return '서버 주소는 http:// 또는 https://로 시작해야 합니다.'
  }
  if (message.includes('LOGIN_ID_OR_EMAIL_EXISTS')) {
    return '이미 사용 중인 로그인 ID 또는 이메일입니다.'
  }
  if (message.includes('Login ID must be')) {
    return '로그인 ID는 3~40자의 영문/숫자/./-/_ 만 사용할 수 있습니다.'
  }
  if (message.includes('Password must be')) {
    return '비밀번호는 최소 8자 이상이어야 합니다.'
  }
  if (message.includes('valid email')) {
    return '올바른 이메일 주소를 입력해 주세요.'
  }
  if (message.includes('name is required')) {
    return '이름을 입력해 주세요.'
  }
  if (message.includes('LOGIN_FAILED')) {
    return 'ID 또는 비밀번호가 올바르지 않거나 비활성 계정입니다.'
  }
  return `처리 중 오류가 발생했습니다. (${message})`
}

function LoginScreen({ onLogin }: LoginScreenProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [serverUrl, setServerUrl] = useState('http://127.0.0.1:4310')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  // Signup request form state
  const [signupName, setSignupName] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupPhone, setSignupPhone] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [signupDone, setSignupDone] = useState(false)
  const [migrationNotice, setMigrationNotice] = useState<{ from: string; to: string } | null>(null)

  useEffect(() => {
    getAuthServerUrl().then(setServerUrl).catch((error) => {
      console.error('Failed to load server URL:', error)
    })
    getServerMigrationNotice()
      .then((notice) => { if (notice) setMigrationNotice(notice) })
      .catch(() => { /* notice is best-effort */ })
  }, [])

  const switchMode = (next: 'login' | 'signup') => {
    setMode(next)
    setErrorMessage('')
    setSignupDone(false)
  }

  const handleSignup = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!loginId.trim() || !signupName.trim() || !signupEmail.trim() || !signupPassword) {
      setErrorMessage('로그인 ID, 이름, 이메일, 비밀번호를 모두 입력해 주세요.')
      return
    }

    setIsSubmitting(true)
    setErrorMessage('')
    try {
      await setAuthServerUrl(serverUrl)
      await signup({
        loginId: loginId.trim(),
        name: signupName.trim(),
        email: signupEmail.trim(),
        phone: signupPhone.trim(),
        password: signupPassword,
      })
      setSignupDone(true)
    } catch (error) {
      console.error('Signup failed:', error)
      setErrorMessage(mapAccountError(String(error instanceof Error ? error.message : error)))
    } finally {
      setIsSubmitting(false)
    }
  }

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
      setErrorMessage(mapAccountError(String(error instanceof Error ? error.message : error)))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="login-screen">
      <section className="login-card">
        <div className="login-brand-mark">✓</div>
        <div className="login-heading">
          <span>투자기획팀 업무관리 공간 · VERSION 1.5.2</span>
          <h1>{mode === 'login' ? '다시 만나서 반가워요' : '계정 가입 신청'}</h1>
          <p>
            {mode === 'login'
              ? '팀 계정으로 로그인해 Task와 알림을 이어서 관리하세요.'
              : '가입 신청 후 관리자 승인이 완료되면 로그인할 수 있습니다.'}
          </p>
        </div>

        {migrationNotice && (
          <div className="login-migration-notice" role="status">
            <strong>서버 주소가 새 주소로 자동 변경되었습니다.</strong>
            <span>새 서버로 다시 로그인해 주세요.</span>
            <small>{migrationNotice.to}</small>
          </div>
        )}

        <div className="login-mode-tabs" role="tablist" aria-label="로그인 또는 가입">
          <button
            className={mode === 'login' ? 'is-active' : ''}
            type="button"
            onClick={() => switchMode('login')}
          >
            로그인
          </button>
          <button
            className={mode === 'signup' ? 'is-active' : ''}
            type="button"
            onClick={() => switchMode('signup')}
          >
            가입 신청
          </button>
        </div>

        {mode === 'signup' && signupDone ? (
          <div className="login-signup-done" role="status">
            <strong>가입 신청이 접수되었습니다.</strong>
            <p>관리자가 승인하면 로그인할 수 있습니다. 승인 후 다시 로그인해 주세요.</p>
            <button type="button" onClick={() => switchMode('login')}>
              로그인 화면으로
            </button>
          </div>
        ) : mode === 'signup' ? (
          <form className="login-form" onSubmit={handleSignup}>
            <label className="login-server-field">
              서버 주소
              <input
                type="url"
                value={serverUrl}
                onChange={(event) => setServerUrl(event.target.value)}
                placeholder="http://서버-PC-IP:4310"
                required
              />
            </label>
            <label>
              로그인 ID
              <input
                type="text"
                value={loginId}
                onChange={(event) => setLoginId(event.target.value)}
                placeholder="사용할 ID (3~40자, 영문/숫자/._-)"
                autoComplete="username"
              />
            </label>
            <label>
              이름
              <input
                type="text"
                value={signupName}
                onChange={(event) => setSignupName(event.target.value)}
                placeholder="이름"
              />
            </label>
            <label>
              이메일
              <input
                type="email"
                value={signupEmail}
                onChange={(event) => setSignupEmail(event.target.value)}
                placeholder="email@example.com"
              />
            </label>
            <label>
              전화번호 (선택)
              <input
                type="tel"
                value={signupPhone}
                onChange={(event) => setSignupPhone(event.target.value)}
                placeholder="연락처 (선택)"
              />
            </label>
            <label>
              비밀번호
              <input
                type="password"
                value={signupPassword}
                onChange={(event) => setSignupPassword(event.target.value)}
                placeholder="비밀번호 (최소 8자)"
                autoComplete="new-password"
              />
            </label>

            {errorMessage && <div className="login-error">{errorMessage}</div>}

            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? '신청 중...' : '가입 신청'}
            </button>
          </form>
        ) : (
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
        )}

        <p className="login-device-note">
          로그인 상태는 이 기기에 안전하게 유지되며, 로그아웃할 때까지 다시 입력하지 않아도 됩니다.
        </p>
      </section>
    </main>
  )
}

export default LoginScreen
