export type MemoRecord = {
  content: string
  author: string
  updatedAt: string
}

export async function getMemo(taskId: string) {
  if (!window.api?.memo?.getByTask) {
    throw new Error('Memo API is not available')
  }

  return window.api.memo.getByTask(taskId) as Promise<MemoRecord>
}

export async function saveMemo(taskId: string, memo: string) {
  if (!window.api?.memo?.save) {
    throw new Error('Memo API is not available')
  }

  return window.api.memo.save(taskId, memo) as Promise<MemoRecord>
}
