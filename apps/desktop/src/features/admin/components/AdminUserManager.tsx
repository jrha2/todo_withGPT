import { useEffect, useState } from 'react'
import {
  approvePendingUser,
  createManagedUser,
  deleteManagedUser,
  getManagedUsers,
  getManagedUserReferences,
  getPendingUsers,
  rejectPendingUser,
  updateManagedUser,
  type AuthUser,
  type ManagedUserInput,
  type ManagedUserReferences,
  type PendingUser,
} from '../../../services/api/authApi'

type AdminUserManagerProps = {
  currentUser: AuthUser
  onClose: () => void
  onCurrentUserUpdated: (user: AuthUser) => void
  onUsersChanged: () => void
}

const emptyDraft: ManagedUserInput = {
  loginId: '',
  name: '',
  email: '',
  phone: '',
  password: '',
  role: 'user',
  isActive: true,
}

function getErrorMessage(error: unknown) {
  const message = String(error instanceof Error ? error.message : error)

  if (message.includes('LOGIN_ID_OR_EMAIL_EXISTS')) {
    return '이미 사용 중인 로그인 ID 또는 이메일입니다.'
  }
  if (message.includes('ADMIN_CANNOT_REMOVE_OWN_ACCESS')) {
    return '현재 로그인한 admin 계정의 권한이나 활성 상태는 해제할 수 없습니다.'
  }
  if (message.includes('LAST_ADMIN_REQUIRED')) {
    return '활성 admin 계정은 최소 한 개가 필요합니다.'
  }
  if (message.includes('USER_HAS_RELATED_DATA')) {
    return '이 사용자가 작성하거나 담당하는 기존 데이터가 남아 있어 삭제할 수 없습니다. 먼저 담당 업무를 다른 사용자에게 옮겨주세요.'
  }
  if (message.includes('ADMIN_CANNOT_DELETE_SELF')) {
    return '현재 로그인한 관리자 계정은 삭제할 수 없습니다.'
  }
  if (message.includes('Password must be')) {
    return '비밀번호는 8자 이상으로 입력해 주세요.'
  }
  if (message.includes('Login ID must be')) {
    return '로그인 ID는 영문·숫자·점·밑줄·하이픈을 사용해 3자 이상 입력해 주세요.'
  }
  return '사용자 정보를 저장하지 못했습니다. 입력 내용을 확인해 주세요.'
}

function AdminUserManager({
  currentUser,
  onClose,
  onCurrentUserUpdated,
  onUsersChanged,
}: AdminUserManagerProps) {
  const [users, setUsers] = useState<AuthUser[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [draft, setDraft] = useState<ManagedUserInput>(emptyDraft)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AuthUser | null>(null)
  const [deleteErrorMessage, setDeleteErrorMessage] = useState('')
  const [deleteReferences, setDeleteReferences] = useState<ManagedUserReferences | null>(null)
  const [isLoadingReferences, setIsLoadingReferences] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([])
  const [pendingBusyId, setPendingBusyId] = useState<string | null>(null)

  const loadUsers = async (nextSelectedId?: string) => {
    const nextUsers = await getManagedUsers()
    setUsers(nextUsers)
    setIsLoading(false)

    if (nextSelectedId) {
      const selected = nextUsers.find((user) => user.id === nextSelectedId)
      if (selected) {
        selectUser(selected)
      }
    }
  }

  const loadPending = async () => {
    try {
      setPendingUsers(await getPendingUsers())
    } catch (error) {
      console.error('Failed to load pending users:', error)
    }
  }

  useEffect(() => {
    let isMounted = true

    getManagedUsers()
      .then((nextUsers) => {
        if (isMounted) {
          setUsers(nextUsers)
          setIsLoading(false)
        }
      })
      .catch((error) => {
        console.error('Failed to load managed users:', error)
        if (isMounted) {
          setErrorMessage('사용자 목록을 불러오지 못했습니다.')
          setIsLoading(false)
        }
      })

    getPendingUsers()
      .then((next) => { if (isMounted) setPendingUsers(next) })
      .catch((error) => console.error('Failed to load pending users:', error))

    return () => {
      isMounted = false
    }
  }, [])

  const handleApprove = async (userId: string) => {
    setPendingBusyId(userId)
    setErrorMessage('')
    try {
      await approvePendingUser(userId)
      await loadPending()
      await loadUsers()
      onUsersChanged()
    } catch (error) {
      console.error('Failed to approve user:', error)
      setErrorMessage(getErrorMessage(error))
    } finally {
      setPendingBusyId(null)
    }
  }

  const handleReject = async (userId: string) => {
    setPendingBusyId(userId)
    setErrorMessage('')
    try {
      await rejectPendingUser(userId)
      await loadPending()
    } catch (error) {
      console.error('Failed to reject user:', error)
      setErrorMessage(getErrorMessage(error))
    } finally {
      setPendingBusyId(null)
    }
  }

  function selectUser(user: AuthUser) {
    setSelectedUserId(user.id)
    setDraft({
      loginId: user.loginId,
      name: user.name,
      email: user.email,
      phone: user.phone,
      password: '',
      role: user.role,
      isActive: user.isActive,
    })
    setErrorMessage('')
  }

  const startCreate = () => {
    setSelectedUserId(null)
    setDraft({ ...emptyDraft })
    setErrorMessage('')
  }

  const updateDraft = <K extends keyof ManagedUserInput>(
    field: K,
    value: ManagedUserInput[K],
  ) => {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault()
    setIsSaving(true)
    setErrorMessage('')

    try {
      const saved = selectedUserId
        ? await updateManagedUser(selectedUserId, draft)
        : await createManagedUser(draft)

      if (saved.id === currentUser.id) {
        onCurrentUserUpdated(saved)
      }

      await loadUsers(saved.id)
      onUsersChanged()
    } catch (error) {
      console.error('Failed to save managed user:', error)
      setErrorMessage(getErrorMessage(error))
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    setErrorMessage('')
    setDeleteErrorMessage('')
    try {
      await deleteManagedUser(deleteTarget.id)
      setDeleteTarget(null)
      setSelectedUserId(null)
      setDraft({ ...emptyDraft })
      await loadUsers()
      onUsersChanged()
    } catch (error) {
      console.error('Failed to delete managed user:', error)
      setDeleteErrorMessage(getErrorMessage(error))
    } finally {
      setIsDeleting(false)
    }
  }

  const openDeleteDialog = async (user: AuthUser) => {
    setDeleteTarget(user)
    setDeleteErrorMessage('')
    setDeleteReferences(null)
    setIsLoadingReferences(true)
    try {
      setDeleteReferences(await getManagedUserReferences(user.id))
    } catch (error) {
      console.error('Failed to load user references:', error)
      setDeleteErrorMessage('연결된 업무 정보를 불러오지 못했습니다.')
    } finally {
      setIsLoadingReferences(false)
    }
  }

  return (
    <div className="admin-modal-backdrop">
      <section className="admin-user-manager">
        <header className="admin-manager-header">
          <div>
            <span>ADMIN CONSOLE</span>
            <h2>팀원 계정 관리</h2>
            <p>로그인 ID와 담당자 정보를 등록하고 접근 권한을 관리합니다.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기">×</button>
        </header>

        <div className="admin-manager-body">
          <aside className="admin-user-list">
            <button className="admin-add-user" type="button" onClick={startCreate}>
              + 새 사용자
            </button>

            {pendingUsers.length > 0 && (
              <div className="admin-pending-section">
                <div className="admin-pending-title">
                  가입 승인 대기 <span>{pendingUsers.length}</span>
                </div>
                {pendingUsers.map((user) => (
                  <div className="admin-pending-row" key={user.id}>
                    <div className="admin-pending-info">
                      <strong>{user.name}</strong>
                      <small>{user.loginId} · {user.email}</small>
                    </div>
                    <div className="admin-pending-actions">
                      <button
                        type="button"
                        className="admin-pending-approve"
                        disabled={pendingBusyId === user.id}
                        onClick={() => void handleApprove(user.id)}
                      >
                        승인
                      </button>
                      <button
                        type="button"
                        className="admin-pending-reject"
                        disabled={pendingBusyId === user.id}
                        onClick={() => void handleReject(user.id)}
                      >
                        거절
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {isLoading ? (
              <div className="admin-list-message">불러오는 중...</div>
            ) : users.map((user) => (
              <button
                className={
                  'admin-user-row' +
                  (selectedUserId === user.id ? ' is-selected' : '') +
                  (!user.isActive ? ' is-inactive' : '')
                }
                type="button"
                key={user.id}
                onClick={() => selectUser(user)}
              >
                <span className="admin-user-avatar">{user.name.charAt(0).toUpperCase()}</span>
                <span>
                  <strong>{user.name}</strong>
                  <small>{user.loginId || '로그인 ID 없음'}</small>
                </span>
                <i>{user.role === 'admin' ? 'ADMIN' : user.isActive ? 'ACTIVE' : 'OFF'}</i>
              </button>
            ))}
          </aside>

          <form className="admin-user-form" onSubmit={handleSave}>
            <div className="admin-form-title">
              <h3>{selectedUserId ? '사용자 정보 수정' : '새 사용자 등록'}</h3>
              <p>담당자 이름은 Task의 담당자 목록에 표시됩니다.</p>
            </div>

            <div className="admin-form-grid">
              <label>
                로그인 ID
                <input
                  value={draft.loginId}
                  onChange={(event) => updateDraft('loginId', event.target.value)}
                  placeholder="예: hong.gildong"
                  required
                />
              </label>
              <label>
                담당자 이름
                <input
                  value={draft.name}
                  onChange={(event) => updateDraft('name', event.target.value)}
                  placeholder="화면에 표시할 이름"
                  required
                />
              </label>
              <label>
                이메일 주소
                <input
                  type="email"
                  value={draft.email}
                  onChange={(event) => updateDraft('email', event.target.value)}
                  placeholder="name@company.com"
                  required
                />
              </label>
              <label>
                휴대폰 번호
                <input
                  value={draft.phone}
                  onChange={(event) => updateDraft('phone', event.target.value)}
                  placeholder="010-0000-0000"
                />
              </label>
              <label>
                {selectedUserId ? '새 비밀번호 (변경할 때만)' : '초기 비밀번호'}
                <input
                  type="password"
                  value={draft.password}
                  onChange={(event) => updateDraft('password', event.target.value)}
                  placeholder="8자 이상"
                  required={!selectedUserId}
                  autoComplete="new-password"
                />
              </label>
              <label>
                계정 권한
                <select
                  value={draft.role}
                  onChange={(event) =>
                    updateDraft('role', event.target.value as 'admin' | 'user')
                  }
                >
                  <option value="user">일반 사용자</option>
                  <option value="admin">관리자</option>
                </select>
              </label>
            </div>

            <label className="admin-active-toggle">
              <input
                type="checkbox"
                checked={draft.isActive !== false}
                onChange={(event) => updateDraft('isActive', event.target.checked)}
              />
              <span>
                <strong>계정 활성화</strong>
                <small>비활성화하면 이 ID로 로그인할 수 없습니다.</small>
              </span>
            </label>

            {errorMessage && <div className="admin-form-error">{errorMessage}</div>}

            <div className="admin-form-actions">
              {selectedUserId && (
                <button
                  className="admin-delete-user-button"
                  type="button"
                  disabled={selectedUserId === currentUser.id || isDeleting}
                  onClick={() => {
                    const selected = users.find((user) => user.id === selectedUserId)
                    if (selected) {
                      void openDeleteDialog(selected)
                    }
                  }}
                >
                  사용자 삭제
                </button>
              )}
              <button type="submit" disabled={isSaving}>
                {isSaving ? '저장 중...' : selectedUserId ? '변경사항 저장' : '사용자 등록'}
              </button>
              <button type="button" onClick={onClose}>닫기</button>
            </div>
          </form>
        </div>

        {deleteTarget && (
          <div className="modal-backdrop admin-delete-backdrop">
            <div className="confirm-modal">
              <div className="confirm-modal-title">사용자 삭제 확인</div>
              <div className="confirm-modal-body">
                “{deleteTarget.name}” 사용자를 정말 삭제하시겠습니까?
                <br />
                작성하거나 담당하는 기존 데이터가 있으면 삭제되지 않습니다.
                {isLoadingReferences && (
                  <div className="admin-reference-loading">연결된 업무를 확인하고 있습니다…</div>
                )}
                {deleteReferences && deleteReferences.tasks.length > 0 && (
                  <div className="admin-reference-list">
                    <strong>삭제 전에 정리해야 할 업무</strong>
                    {deleteReferences.tasks.map((task) => (
                      <div key={task.taskId}>
                        <span>{task.title}</span>
                        <small>{task.relations.join(' · ')}</small>
                      </div>
                    ))}
                  </div>
                )}
                {deleteReferences && deleteReferences.folders.length > 0 && (
                  <div className="admin-reference-summary">
                    소유 폴더 {deleteReferences.folders.length}개
                  </div>
                )}
                {deleteReferences && deleteReferences.activityCount > 0 && (
                  <div className="admin-reference-summary">
                    변경 기록 {deleteReferences.activityCount}건
                  </div>
                )}
                {deleteErrorMessage && (
                  <div className="admin-delete-error">{deleteErrorMessage}</div>
                )}
              </div>
              <div className="confirm-modal-actions">
                <button
                  type="button"
                  disabled={isDeleting || isLoadingReferences || Boolean(deleteReferences?.hasRelatedData)}
                  onClick={handleDelete}
                >
                  {isDeleting ? '확인 중…' : '삭제'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteTarget(null)
                    setDeleteErrorMessage('')
                    setDeleteReferences(null)
                  }}
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

export default AdminUserManager
