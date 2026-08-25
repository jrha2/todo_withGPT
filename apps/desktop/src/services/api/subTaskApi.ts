export type SubTaskRecord = {
  id: string
  title: string
  dueDate: string
  assigneeId: string
  assignee: string
  assignees: Array<{ id: string; name: string; email: string }>
  completed: boolean
  createdAt: string
  creationOrder: number
}

export async function getSubTasks(taskId: string) {
  if (!window.api?.subTask?.getByTask) {
    throw new Error('Sub Task API is not available')
  }

  return window.api.subTask.getByTask(taskId) as Promise<SubTaskRecord[]>
}

export async function createSubTask(taskId: string, title: string) {
  if (!window.api?.subTask?.create) {
    throw new Error('Sub Task API is not available')
  }

  return window.api.subTask.create(taskId, title) as Promise<SubTaskRecord>
}

export async function toggleSubTask(subTaskId: string) {
  if (!window.api?.subTask?.toggle) {
    throw new Error('Sub Task API is not available')
  }

  return window.api.subTask.toggle(subTaskId) as Promise<SubTaskRecord>
}

export async function deleteSubTask(subTaskId: string) {
  if (!window.api?.subTask?.delete) {
    throw new Error('Sub Task API is not available')
  }

  return window.api.subTask.delete(subTaskId) as Promise<{ id: string }>
}

export async function updateSubTask(
  subTaskId: string,
  field: 'title' | 'dueDate' | 'assignee' | 'assignees',
  value: string | string[],
) {
  if (!window.api?.subTask?.update) {
    throw new Error('Sub Task API is not available')
  }

  return window.api.subTask.update(
    subTaskId,
    field,
    value,
  ) as Promise<SubTaskRecord>
}

export async function reorderSubTasks(taskId: string, orderedIds: string[]) {
  if (!window.api?.subTask?.reorder) {
    throw new Error('Sub Task reorder API is not available')
  }

  return window.api.subTask.reorder(
    taskId,
    orderedIds,
  ) as Promise<SubTaskRecord[]>
}
