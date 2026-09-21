import { useCallback, useEffect, useRef, useState } from 'react'
import AdminUserManager from '../features/admin/components/AdminUserManager'
import MyAccountModal from '../features/account/components/MyAccountModal'
import AnnouncementModal from '../features/announcement/components/AnnouncementModal'
import LoginScreen from '../features/auth/components/LoginScreen'
import TaskDetailPage from '../pages/TaskDetailPage'
import {
  getActiveAnnouncement,
  getAuthSession,
  logout,
  onNewAnnouncement,
  type Announcement,
  type AuthUser,
} from '../services/api/authApi'
import {
  confirmDiscardDirtyDrafts,
  hasDirtyDrafts,
  subscribeToDirtyDrafts,
} from '../services/draftRegistry'

type SyncStatus = Awaited<ReturnType<typeof window.api.sync.getStatus>>

function App() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null)
  const [isSessionLoading, setIsSessionLoading] = useState(true)
  const [isAdminOpen, setIsAdminOpen] = useState(false)
  const [isAccountOpen, setIsAccountOpen] = useState(false)
  const [announcement, setAnnouncement] = useState<Announcement | null>(null)
  const [userRevision, setUserRevision] = useState(0)
  const [remoteRefreshRevision, setRemoteRefreshRevision] = useState<number | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [syncApplyError, setSyncApplyError] = useState('')
  const [hasDirty, setHasDirty] = useState(false)
  const [hasPendingRemote, setHasPendingRemote] = useState(false)
  const latestSyncRevisionRef = useRef(0)
  const acknowledgedSyncRevisionRef = useRef(0)
  const refreshInFlightRef = useRef(false)
  const dirtyRef = useRef(false)
  const disposedRef = useRef(false)

  useEffect(() => {
    getAuthSession()
      .then(setCurrentUser)
      .catch((error) => {
        console.error('Failed to restore login session:', error)
        setCurrentUser(null)
      })
      .finally(() => setIsSessionLoading(false))
  }, [])

  const startPendingRefresh = useCallback(() => {
    const revision = latestSyncRevisionRef.current
    if (
      disposedRef.current ||
      dirtyRef.current ||
      refreshInFlightRef.current ||
      revision <= acknowledgedSyncRevisionRef.current
    ) return

    refreshInFlightRef.current = true
    setSyncApplyError('')
    setRemoteRefreshRevision(revision)
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeToDirtyDrafts((dirty) => {
      dirtyRef.current = dirty
      setHasDirty(dirty)
      if (!dirty) queueMicrotask(startPendingRefresh)
    })
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasDirtyDrafts()) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      unsubscribe()
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [startPendingRefresh])

  useEffect(() => {
    disposedRef.current = false
    const applyRemoteChange = (change: { revision: number }) => {
      const revision = Number(change.revision) || 0
      if (!revision) return
      latestSyncRevisionRef.current = Math.max(latestSyncRevisionRef.current, revision)
      setHasPendingRemote(revision > acknowledgedSyncRevisionRef.current)
      startPendingRefresh()
    }

    const unsubscribeRemote = window.api.sync.onRemoteChange(applyRemoteChange)
    const unsubscribeStatus = window.api.sync.onStatusChanged(setSyncStatus)
    window.api.sync.getState()
      .then((state) => {
        setSyncStatus(state.status)
        acknowledgedSyncRevisionRef.current = state.status.acknowledgedRevision
        setHasPendingRemote(
          Boolean(state.pendingEvent)
          || (state.status.pendingRevision ?? 0) > state.status.acknowledgedRevision,
        )
        if (state.pendingEvent) applyRemoteChange(state.pendingEvent)
      })
      .catch((error) => console.error('Failed to load sync state:', error))

    return () => {
      disposedRef.current = true
      unsubscribeRemote()
      unsubscribeStatus()
    }
  }, [startPendingRefresh])

  // Announcement popup: while logged in, subscribe to announcements pushed by
  // the periodic poll and also fetch the current active/unseen one once. The
  // main process only surfaces an announcement that is active and not yet
  // dismissed on this device, so setting it here is enough to pop it up.
  useEffect(() => {
    if (!currentUser) return
    const unsubscribe = onNewAnnouncement(setAnnouncement)
    getActiveAnnouncement()
      .then((active) => { if (active) setAnnouncement(active) })
      .catch((error) => console.error('Failed to load announcement:', error))
    return () => {
      unsubscribe()
      setAnnouncement(null)
    }
  }, [currentUser])

  const handleRemoteRefreshComplete = useCallback(async (revision: number, succeeded: boolean) => {
    if (revision !== remoteRefreshRevision) return
    if (!succeeded) {
      refreshInFlightRef.current = false
      setRemoteRefreshRevision(null)
      setSyncApplyError('원격 변경사항을 화면에 반영하지 못했습니다. 다시 시도해 주세요.')
      return
    }

    try {
      const result = await window.api.sync.acknowledge(revision) as { status?: SyncStatus }
      acknowledgedSyncRevisionRef.current = revision
      setHasPendingRemote(latestSyncRevisionRef.current > revision)
      if (result.status) setSyncStatus(result.status)
      setRemoteRefreshRevision(null)
      refreshInFlightRef.current = false
      setUserRevision((current) => current + 1)
      queueMicrotask(startPendingRefresh)
    } catch (error) {
      console.error('Failed to acknowledge applied remote change:', error)
      refreshInFlightRef.current = false
      setRemoteRefreshRevision(null)
      setSyncApplyError('반영 확인에 실패했습니다. 동기화를 다시 시도해 주세요.')
    }
  }, [remoteRefreshRevision, startPendingRefresh])

  const handleRetrySync = async () => {
    setSyncApplyError('')
    try {
      const status = await window.api.sync.retry()
      setSyncStatus(status)
      setHasPendingRemote((status.pendingRevision ?? 0) > status.acknowledgedRevision)
      startPendingRefresh()
    } catch (error) {
      console.error('Failed to retry sync:', error)
      setSyncApplyError('동기화 재시도에 실패했습니다.')
    }
  }

  const handleLogout = async () => {
    if (!confirmDiscardDirtyDrafts('저장하지 않은 변경사항이 있습니다. 변경사항을 버리고 로그아웃하시겠습니까?')) return
    await logout()
    setIsAdminOpen(false)
    setCurrentUser(null)
  }

  const handleOpenAdmin = () => {
    if (!confirmDiscardDirtyDrafts('저장하지 않은 변경사항이 있습니다. 변경사항을 버리고 관리자 화면으로 이동하시겠습니까?')) return
    setIsAdminOpen(true)
  }

  const handleOpenAccount = () => {
    if (!confirmDiscardDirtyDrafts('저장하지 않은 변경사항이 있습니다. 변경사항을 버리고 내 계정 화면으로 이동하시겠습니까?')) return
    setIsAccountOpen(true)
  }

  if (isSessionLoading) {
    return <main className="session-loading-screen"><div className="login-brand-mark">✓</div><span>로그인 정보를 확인하고 있습니다...</span></main>
  }
  if (!currentUser) return <LoginScreen onLogin={setCurrentUser} />

  const phase = syncStatus?.phase ?? 'connecting'
  return (
    <>
      <TaskDetailPage
        currentUser={currentUser}
        userRevision={userRevision}
        remoteRefreshRevision={remoteRefreshRevision}
        onRemoteRefreshComplete={handleRemoteRefreshComplete}
        onOpenAdmin={handleOpenAdmin}
        onOpenAccount={handleOpenAccount}
        onLogout={handleLogout}
      />
      <div className={`sync-phase-indicator is-${phase}`} role="status">
        <i />
        <span>{phase === 'synced' ? '동기화됨' : phase === 'syncing' ? '동기화 중' : phase === 'connecting' ? '연결 중' : phase === 'offline' ? '오프라인' : '동기화 실패'}</span>
        {(phase === 'offline' || phase === 'failed' || syncApplyError) && <button type="button" onClick={() => void handleRetrySync()}>다시 시도</button>}
      </div>
      {hasDirty && hasPendingRemote && <div className="sync-dirty-banner">작성 중인 내용이 있어 원격 변경사항 반영을 보류하고 있습니다.</div>}
      {syncApplyError && <div className="sync-error-banner" role="alert">{syncApplyError}</div>}
      {isAdminOpen && currentUser.role === 'admin' && (
        <AdminUserManager currentUser={currentUser} onClose={() => setIsAdminOpen(false)} onCurrentUserUpdated={setCurrentUser} onUsersChanged={() => setUserRevision((revision) => revision + 1)} />
      )}
      {isAccountOpen && (
        <MyAccountModal
          currentUser={currentUser}
          onClose={() => setIsAccountOpen(false)}
          onProfileUpdated={setCurrentUser}
        />
      )}
      {announcement && (
        <AnnouncementModal
          announcement={announcement}
          onClose={() => setAnnouncement(null)}
        />
      )}
    </>
  )
}

export default App
