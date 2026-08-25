import { useEffect, useState } from 'react'
import AdminUserManager from '../features/admin/components/AdminUserManager'
import LoginScreen from '../features/auth/components/LoginScreen'
import TaskDetailPage from '../pages/TaskDetailPage'
import {
  getAuthSession,
  logout,
  type AuthUser,
} from '../services/api/authApi'

function App() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null)
  const [isSessionLoading, setIsSessionLoading] = useState(true)
  const [isAdminOpen, setIsAdminOpen] = useState(false)
  const [userRevision, setUserRevision] = useState(0)
  const [pendingSyncRevision, setPendingSyncRevision] = useState<number | null>(null)
  const [isSyncPromptOpen, setIsSyncPromptOpen] = useState(false)

  useEffect(() => {
    getAuthSession()
      .then(setCurrentUser)
      .catch((error) => {
        console.error('Failed to restore login session:', error)
        setCurrentUser(null)
      })
      .finally(() => setIsSessionLoading(false))
  }, [])

  useEffect(() => {
    const showRemoteChange = (change: { revision: number }) => {
      const revision = Number(change.revision) || 0
      if (!revision) return

      setPendingSyncRevision((current) => Math.max(current ?? 0, revision))
      setIsSyncPromptOpen(true)
    }

    const unsubscribe = window.api.sync.onRemoteChange(showRemoteChange)
    window.api.sync
      .getState()
      .then((state) => {
        if (state.pendingEvent) showRemoteChange(state.pendingEvent)
      })
      .catch((error) => {
        console.error('Failed to load sync state:', error)
      })

    return unsubscribe
  }, [])

  const applyServerChanges = async () => {
    if (!pendingSyncRevision) return

    try {
      await window.api.sync.acknowledge(pendingSyncRevision)
      window.location.reload()
    } catch (error) {
      console.error('Failed to apply remote server change:', error)
    }
  }

  const handleLogout = async () => {
    await logout()
    setIsAdminOpen(false)
    setCurrentUser(null)
  }

  if (isSessionLoading) {
    return (
      <main className="session-loading-screen">
        <div className="login-brand-mark">✓</div>
        <span>로그인 정보를 확인하고 있습니다...</span>
      </main>
    )
  }

  if (!currentUser) {
    return <LoginScreen onLogin={setCurrentUser} />
  }

  return (
    <>
      {pendingSyncRevision && !isSyncPromptOpen && (
        <div className="sync-update-banner">
          <span>서버에 아직 반영하지 않은 변경 내용이 있습니다.</span>
          <button type="button" onClick={() => setIsSyncPromptOpen(true)}>
            확인하기
          </button>
        </div>
      )}
      <TaskDetailPage
        currentUser={currentUser}
        userRevision={userRevision}
        onOpenAdmin={() => setIsAdminOpen(true)}
        onLogout={handleLogout}
      />
      {isAdminOpen && currentUser.role === 'admin' && (
        <AdminUserManager
          currentUser={currentUser}
          onClose={() => setIsAdminOpen(false)}
          onCurrentUserUpdated={setCurrentUser}
          onUsersChanged={() => setUserRevision((revision) => revision + 1)}
        />
      )}
      {isSyncPromptOpen && pendingSyncRevision && (
        <div className="sync-modal-backdrop">
          <div className="sync-update-modal" role="dialog" aria-modal="true">
            <div className="sync-update-icon">↻</div>
            <h2>서버 변경 내용 확인</h2>
            <p>다른 사용자가 서버 데이터를 변경했습니다.</p>
            <small>
              작성 중인 내용을 확인한 뒤 반영해 주세요. 반영하면 최신 데이터를 불러오기 위해 화면이 새로고침됩니다.
            </small>
            <div className="sync-update-actions">
              <button type="button" onClick={applyServerChanges}>반영하기</button>
              <button type="button" onClick={() => setIsSyncPromptOpen(false)}>
                나중에
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default App
