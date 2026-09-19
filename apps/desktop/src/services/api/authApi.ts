export type AuthUser = {
  id: string
  loginId: string
  name: string
  email: string
  phone: string
  role: 'admin' | 'user'
  isActive: boolean
  status: 'active' | 'pending'
}

export type SignupInput = {
  loginId: string
  name: string
  email: string
  phone: string
  password: string
}

export type PendingUser = AuthUser & { createdAt: string }

export type ManagedUserInput = {
  loginId: string
  name: string
  email: string
  phone: string
  password?: string
  role: 'admin' | 'user'
  isActive?: boolean
}

export type ManagedUserReferences = {
  user: AuthUser
  tasks: Array<{ taskId: string; title: string; path: string; relations: string[] }>
  folders: Array<{ id: string; title: string; path: string }>
  activityCount: number
  trashedReferenceCount: number
  hasRelatedData: boolean
}

export async function getAuthServerUrl() {
  if (!window.api?.auth?.getServerUrl) {
    throw new Error('AUTH_API_UNAVAILABLE')
  }

  return window.api.auth.getServerUrl() as Promise<string>
}

export async function setAuthServerUrl(serverUrl: string) {
  if (!window.api?.auth?.setServerUrl) {
    throw new Error('AUTH_API_UNAVAILABLE')
  }

  return window.api.auth.setServerUrl(serverUrl) as Promise<{ serverUrl: string }>
}

export async function getAuthSession() {
  if (!window.api?.auth?.getSession) {
    throw new Error('AUTH_API_UNAVAILABLE')
  }

  return window.api.auth.getSession() as Promise<AuthUser | null>
}

// One-time notice shown after the client is automatically switched from the old
// server address to the new one. Returns null when no switch happened.
export async function getServerMigrationNotice() {
  if (!window.api?.auth?.getServerMigrationNotice) {
    return null
  }

  return window.api.auth.getServerMigrationNotice() as Promise<
    { from: string; to: string } | null
  >
}

export async function login(loginId: string, password: string) {
  if (!window.api?.auth?.login) {
    throw new Error('AUTH_API_UNAVAILABLE')
  }

  const result = await window.api.auth.login(loginId, password) as
    | AuthUser
    | {
        success: boolean
        user?: AuthUser
        code?: string
      }

  // Vite 화면만 먼저 갱신되고 Electron main이 아직 재시작되지 않은 경우도
  // 기존 로그인 응답을 받아들여 개발 중 로그인이 막히지 않게 한다.
  if ('id' in result && 'role' in result) {
    return result
  }

  if (!result.success || !result.user) {
    throw new Error(result.code || 'LOGIN_FAILED')
  }

  return result.user
}

export async function logout() {
  if (!window.api?.auth?.logout) {
    throw new Error('AUTH_API_UNAVAILABLE')
  }

  return window.api.auth.logout()
}

export async function signup(input: SignupInput) {
  if (!window.api?.auth?.signup) {
    throw new Error('AUTH_API_UNAVAILABLE')
  }

  const result = (await window.api.auth.signup(input)) as {
    success: boolean
    result?: { id: string; status: string }
    code?: string
  }

  if (!result.success) {
    throw new Error(result.code || 'SIGNUP_FAILED')
  }

  return result.result
}

export async function updateOwnProfile(input: { name: string; email: string }) {
  if (!window.api?.me?.updateProfile) {
    throw new Error('AUTH_API_UNAVAILABLE')
  }

  return window.api.me.updateProfile(input) as Promise<AuthUser>
}

export async function changeOwnPassword(
  currentPassword: string,
  newPassword: string,
) {
  if (!window.api?.me?.changePassword) {
    throw new Error('AUTH_API_UNAVAILABLE')
  }

  return window.api.me.changePassword(currentPassword, newPassword) as Promise<{
    id: string
  }>
}

export async function getPendingUsers() {
  if (!window.api?.admin?.getPendingUsers) {
    throw new Error('ADMIN_API_UNAVAILABLE')
  }

  return window.api.admin.getPendingUsers() as Promise<PendingUser[]>
}

export async function approvePendingUser(userId: string) {
  if (!window.api?.admin?.approveUser) {
    throw new Error('ADMIN_API_UNAVAILABLE')
  }

  return window.api.admin.approveUser(userId) as Promise<AuthUser>
}

export async function rejectPendingUser(userId: string) {
  if (!window.api?.admin?.rejectUser) {
    throw new Error('ADMIN_API_UNAVAILABLE')
  }

  return window.api.admin.rejectUser(userId) as Promise<{ id: string }>
}

export async function getManagedUsers() {
  if (!window.api?.admin?.getUsers) {
    throw new Error('ADMIN_API_UNAVAILABLE')
  }

  return window.api.admin.getUsers() as Promise<AuthUser[]>
}

export async function createManagedUser(input: ManagedUserInput) {
  if (!window.api?.admin?.createUser) {
    throw new Error('ADMIN_API_UNAVAILABLE')
  }

  return window.api.admin.createUser(input) as Promise<AuthUser>
}

export async function updateManagedUser(
  userId: string,
  changes: ManagedUserInput,
) {
  if (!window.api?.admin?.updateUser) {
    throw new Error('ADMIN_API_UNAVAILABLE')
  }

  return window.api.admin.updateUser(userId, changes) as Promise<AuthUser>
}

export async function deleteManagedUser(userId: string) {
  if (!window.api?.admin?.deleteUser) {
    throw new Error('ADMIN_API_UNAVAILABLE')
  }

  return window.api.admin.deleteUser(userId) as Promise<{ id: string }>
}

export async function getManagedUserReferences(userId: string) {
  if (!window.api?.admin?.getUserReferences) {
    throw new Error('ADMIN_API_UNAVAILABLE')
  }
  return window.api.admin.getUserReferences(userId) as Promise<ManagedUserReferences>
}
