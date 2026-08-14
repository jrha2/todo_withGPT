export type AssigneeUser = {
  id: string
  name: string
  email: string
}

export async function getAssigneeUsers() {
  if (!window.api?.user?.getAssignees) {
    throw new Error('user getAssignees API is not available')
  }

  return window.api.user.getAssignees() as Promise<AssigneeUser[]>
}
