import MainLayout from '../layouts/MainLayout'
import type { AuthUser } from '../services/api/authApi'

type TaskDetailPageProps = {
  currentUser: AuthUser
  userRevision: number
  remoteRefreshRevision: number | null
  onRemoteRefreshComplete: (revision: number, succeeded: boolean) => void
  onOpenAdmin: () => void
  onLogout: () => void
}

function TaskDetailPage({
  currentUser,
  userRevision,
  remoteRefreshRevision,
  onRemoteRefreshComplete,
  onOpenAdmin,
  onLogout,
}: TaskDetailPageProps) {
  return (
    <MainLayout
      currentUser={currentUser}
      userRevision={userRevision}
      remoteRefreshRevision={remoteRefreshRevision}
      onRemoteRefreshComplete={onRemoteRefreshComplete}
      onOpenAdmin={onOpenAdmin}
      onLogout={onLogout}
    />
  )
}

export default TaskDetailPage
