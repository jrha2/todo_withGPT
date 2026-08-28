import type { TaskSummaryRecord } from './taskApi'

export type WorkspaceView =
  | 'today'
  | 'overdue'
  | 'week'
  | 'incomplete'
  | 'unassigned'
  | 'favorites'
  | 'recent'

export type WorkspaceScope = 'all' | 'mine'

export async function getWorkspaceTasks(
  view: WorkspaceView,
  scope: WorkspaceScope = 'all',
) {
  if (!window.api?.workspace?.getTasks) {
    throw new Error('workspace API is not available')
  }
  return window.api.workspace.getTasks(
    view,
    scope,
  ) as Promise<TaskSummaryRecord[]>
}
