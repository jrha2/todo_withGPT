export type CommentRecord = {
  id: string
  parentId: string | null
  author: string
  createdAt: string
  content: string
  deleted: boolean
}

export async function getComments(taskId: string) {
  if (!window.api?.comment?.getByTask) {
    throw new Error('Comment API is not available')
  }

  return window.api.comment.getByTask(taskId) as Promise<CommentRecord[]>
}

export async function createComment(
  taskId: string,
  parentId: string | null,
  content: string,
) {
  if (!window.api?.comment?.create) {
    throw new Error('Comment API is not available')
  }

  return window.api.comment.create(
    taskId,
    parentId,
    content,
  ) as Promise<CommentRecord>
}

export async function updateComment(commentId: string, content: string) {
  if (!window.api?.comment?.update) {
    throw new Error('Comment API is not available')
  }

  return window.api.comment.update(commentId, content) as Promise<CommentRecord>
}

export async function deleteComment(commentId: string) {
  if (!window.api?.comment?.delete) {
    throw new Error('Comment API is not available')
  }

  return window.api.comment.delete(commentId) as Promise<CommentRecord>
}
