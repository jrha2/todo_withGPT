export type MemoRecord = {
  content: string
  author: string
  updatedAt: string
}

export type RichMemoRecord = {
  id: string
  contentHtml: string
  author: string
  authorUserId: string
  createdAt: string
  updatedAt: string
  order: number
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

export async function getMemos(taskId: string) {
  if (!window.api?.memo?.getAllByTask) {
    throw new Error('Multiple Memo API is not available')
  }
  return window.api.memo.getAllByTask(taskId) as Promise<RichMemoRecord[]>
}

export async function createMemo(taskId: string, contentHtml: string) {
  if (!window.api?.memo?.create) throw new Error('Memo create API is not available')
  return window.api.memo.create(taskId, contentHtml) as Promise<RichMemoRecord>
}

export async function updateMemo(memoId: string, contentHtml: string) {
  if (!window.api?.memo?.update) throw new Error('Memo update API is not available')
  return window.api.memo.update(memoId, contentHtml) as Promise<RichMemoRecord>
}

export async function deleteMemo(memoId: string) {
  if (!window.api?.memo?.delete) throw new Error('Memo delete API is not available')
  return window.api.memo.delete(memoId) as Promise<{ id: string; taskId: string }>
}
