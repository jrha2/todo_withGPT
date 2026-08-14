export type AuthUser = {
  id: string
  loginId: string
  name: string
  email: string
  phone: string
  role: 'admin' | 'user'
  isActive: boolean
}

export type ManagedUserInput = {
  loginId: string
  name: string
  email: string
  phone: string
  password?: string
  role: 'admin' | 'user'
  isActive?: boolean
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
