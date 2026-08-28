export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent'
export type WorkflowStatus = 'todo' | 'in_progress' | 'blocked' | 'done'

export type TaskAssigneeRecord = {
  id: string
  name: string
  email: string
}

export type TaskDetailRecord = {
  id: string
  navNodeId: string
  title: string
  description: string
  dueDate: string
  alarm: string
  assignee: string
  assignees: TaskAssigneeRecord[]
  completed: boolean
  priority: TaskPriority
  workflowStatus: WorkflowStatus
  tags: string[]
  attachments: Array<{ id: string; name: string }>
}

export type TaskDetailChanges = {
  title?: string
  description?: string
  dueDate?: string
  alarm?: string
  assignee?: string
  assigneeIds?: string[]
  manualAssigneeNames?: string[]
  priority?: TaskPriority
  workflowStatus?: WorkflowStatus
  tags?: string[]
  completed?: boolean
}

export type BulkTaskChanges = {
  priority?: TaskPriority
  workflowStatus?: WorkflowStatus
  tags?: string[]
  dueDate?: string | null
  completed?: boolean
  assigneeIds?: string[]
  parentId?: string | null
}

export type TaskSummaryRecord = {
  taskId: string
  title: string
  folderId: string | null
  folderTitle: string
  dueDate: string
  completed: boolean
  assignees: TaskAssigneeRecord[]
  priority: TaskPriority
  workflowStatus: WorkflowStatus
  tags: string[]
  isFavorite: boolean
  lastOpenedAt: string | null
}

export async function getTaskDetail(taskId: string) {
  if (!window.api?.task?.getDetail) {
    throw new Error('task API is not available')
  }

  return window.api.task.getDetail(taskId) as Promise<TaskDetailRecord>
}

export async function toggleTaskCompleted(taskId: string) {
  if (!window.api?.task?.toggleCompleted) {
    throw new Error('task toggleCompleted API is not available')
  }

  return window.api.task.toggleCompleted(taskId) as Promise<TaskDetailRecord>
}

export async function updateTaskDetail(
  taskId: string,
  changes: TaskDetailChanges,
) {
  if (!window.api?.task?.updateDetail) {
    throw new Error('task updateDetail API is not available')
  }

  return window.api.task.updateDetail(
    taskId,
    changes,
  ) as Promise<TaskDetailRecord>
}

export async function bulkUpdateTasks(
  taskIds: string[],
  changes: BulkTaskChanges,
) {
  if (!window.api?.task?.bulkUpdate) {
    throw new Error('task bulkUpdate API is not available')
  }
  return window.api.task.bulkUpdate(
    taskIds,
    changes,
  ) as Promise<TaskSummaryRecord[]>
}

export async function setTaskFavorite(taskId: string, isFavorite: boolean) {
  if (!window.api?.task?.setFavorite) {
    throw new Error('task setFavorite API is not available')
  }
  return window.api.task.setFavorite(taskId, isFavorite)
}

export async function touchTaskRecent(taskId: string) {
  if (!window.api?.task?.touchRecent) {
    throw new Error('task touchRecent API is not available')
  }
  return window.api.task.touchRecent(taskId)
}
