import MainLayout from '../layouts/MainLayout'
import type { AuthUser } from '../services/api/authApi'

type TaskDetailPageProps = {
  currentUser: AuthUser
  userRevision: number
  onOpenAdmin: () => void
  onLogout: () => void
}

function TaskDetailPage({
  currentUser,
  userRevision,
  onOpenAdmin,
  onLogout,
}: TaskDetailPageProps) {
  return (
    <MainLayout
      currentUser={currentUser}
      userRevision={userRevision}
      onOpenAdmin={onOpenAdmin}
      onLogout={onLogout}
    />
  )
}

export default TaskDetailPage
