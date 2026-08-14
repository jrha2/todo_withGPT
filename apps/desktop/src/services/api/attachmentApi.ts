export type AttachmentRecord = {
  id: string
  name: string
}

export async function selectAndCreateAttachment(taskId: string) {
  if (!window.api?.attachment?.selectAndCreate) {
    throw new Error('Attachment API is not available')
  }

  return window.api.attachment.selectAndCreate(
    taskId,
  ) as Promise<AttachmentRecord | null>
}

export async function openAttachment(attachmentId: string) {
  if (!window.api?.attachment?.open) {
    throw new Error('Attachment API is not available')
  }

  return window.api.attachment.open(attachmentId)
}
