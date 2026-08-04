export async function getTaskDetail(taskId: string) {
  if (!window.api?.task?.getDetail) {
    throw new Error('task API is not available')
  }

  return window.api.task.getDetail(taskId)
}
