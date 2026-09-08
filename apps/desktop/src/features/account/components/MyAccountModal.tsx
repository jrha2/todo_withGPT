import { useState } from 'react'
import {
  changeOwnPassword,
  updateOwnProfile,
  type AuthUser,
} from '../../../services/api/authApi'

type MyAccountModalProps = {
  currentUser: AuthUser
  onClose: () => void
  onProfileUpdated: (user: AuthUser) => void
}

function mapError(message: string) {
  if (message.includes('CURRENT_PASSWORD_INCORRECT')) return '현재 비밀번호가 올바르지 않습니다.'
  if (message.includes('Password must be')) return '새 비밀번호는 최소 8자 이상이어야 합니다.'
  if (message.includes('valid email')) return '올바른 이메일 주소를 입력해 주세요.'
  if (message.includes('name is required')) return '이름을 입력해 주세요.'
  if (message.includes('LOGIN_ID_OR_EMAIL_EXISTS')) return '이미 사용 중인 이메일입니다.'
  if (message.includes('SERVER_UNAVAILABLE')) return '서버에 연결할 수 없습니다.'
  return `처리 중 오류가 발생했습니다. (${message})`
}

function MyAccountModal({ currentUser, onClose, onProfileUpdated }: MyAccountModalProps) {
  const [name, setName] = useState(currentUser.name)
  const [email, setEmail] = useState(currentUser.email)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMessage, setProfileMessage] = useState('')
  const [profileError, setProfileError] = useState('')

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState('')
  const [passwordError, setPasswordError] = useState('')

  const handleSaveProfile = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim() || !email.trim()) {
      setProfileError('이름과 이메일을 모두 입력해 주세요.')
      return
    }
    setProfileSaving(true)
    setProfileError('')
    setProfileMessage('')
    try {
      const updated = await updateOwnProfile({ name: name.trim(), email: email.trim() })
      onProfileUpdated(updated)
      setProfileMessage('프로필이 저장되었습니다.')
    } catch (error) {
      setProfileError(mapError(String(error instanceof Error ? error.message : error)))
    } finally {
      setProfileSaving(false)
    }
  }

  const handleChangePassword = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!currentPassword || !newPassword) {
      setPasswordError('현재 비밀번호와 새 비밀번호를 입력해 주세요.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('새 비밀번호가 서로 일치하지 않습니다.')
      return
    }
    setPasswordSaving(true)
    setPasswordError('')
    setPasswordMessage('')
    try {
      await changeOwnPassword(currentPassword, newPassword)
      setPasswordMessage('비밀번호가 변경되었습니다.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (error) {
      setPasswordError(mapError(String(error instanceof Error ? error.message : error)))
    } finally {
      setPasswordSaving(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="my-account-modal">
        <div className="task-field-modal-header">
          <div>
            <span>MY ACCOUNT</span>
            <h3>내 계정 설정</h3>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </div>

        <div className="my-account-identity">
          <span className="my-account-avatar">{currentUser.name.charAt(0).toUpperCase()}</span>
          <div>
            <strong>{currentUser.loginId}</strong>
            <span>{currentUser.role === 'admin' ? '관리자' : '사용자'}</span>
          </div>
        </div>

        <form className="my-account-section" onSubmit={handleSaveProfile}>
          <h4>프로필</h4>
          <label>
            이름
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="이름" />
          </label>
          <label>
            이메일
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="email@example.com" />
          </label>
          {profileError && <div className="task-field-error" role="alert">{profileError}</div>}
          {profileMessage && <div className="my-account-success" role="status">{profileMessage}</div>}
          <button type="submit" disabled={profileSaving}>{profileSaving ? '저장 중...' : '프로필 저장'}</button>
        </form>

        <form className="my-account-section" onSubmit={handleChangePassword}>
          <h4>비밀번호 변경</h4>
          <label>
            현재 비밀번호
            <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" />
          </label>
          <label>
            새 비밀번호
            <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="최소 8자" autoComplete="new-password" />
          </label>
          <label>
            새 비밀번호 확인
            <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" />
          </label>
          {passwordError && <div className="task-field-error" role="alert">{passwordError}</div>}
          {passwordMessage && <div className="my-account-success" role="status">{passwordMessage}</div>}
          <button type="submit" disabled={passwordSaving}>{passwordSaving ? '변경 중...' : '비밀번호 변경'}</button>
        </form>

        <p className="my-account-note">비밀번호를 잊어버린 경우 관리자에게 재설정을 요청하세요.</p>
      </div>
    </div>
  )
}

export default MyAccountModal
