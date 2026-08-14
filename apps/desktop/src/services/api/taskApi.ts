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
  attachments: Array<{ id: string; name: string }>
}

export type TaskDetailChanges = {
  title: string
  description: string
  dueDate: string
  alarm: string
  assignee: string
  assigneeIds: string[]
  manualAssigneeNames: string[]
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
