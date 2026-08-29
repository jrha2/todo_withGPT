const DEFAULT_SERVER_URL = 'http://127.0.0.1:4310'
const REQUEST_TIMEOUT_MS = 8000
const FILE_REQUEST_TIMEOUT_MS = 60_000
let configuredServerUrl = String(
  process.env.TODO_SERVER_URL || DEFAULT_SERVER_URL,
).replace(/\/$/, '')
let syncClientId = ''
let acknowledgedSyncRevision = 0

export function setSyncRequestContext(clientId, revision) {
  syncClientId = String(clientId || '')
  acknowledgedSyncRevision = Math.max(0, Number(revision) || 0)
}

export function setAcknowledgedSyncRevision(revision) {
  acknowledgedSyncRevision = Math.max(0, Number(revision) || 0)
}

export function getAcknowledgedSyncRevision() {
  return acknowledgedSyncRevision
}

export function getServerUrl() {
  return configuredServerUrl
}

export function setServerUrl(serverUrl) {
  const nextUrl = String(serverUrl ?? '').trim().replace(/\/$/, '')
  if (!/^https?:\/\//i.test(nextUrl)) {
    throw new Error('INVALID_SERVER_URL')
  }
  configuredServerUrl = nextUrl
  return configuredServerUrl
}

async function request(pathname, options = {}) {
  const headers = { Accept: 'application/json' }

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`
  }
  if (syncClientId) {
    headers['X-Client-ID'] = syncClientId
    if ((options.method || 'GET') !== 'GET') {
      headers['X-Base-Revision'] = String(acknowledgedSyncRevision)
    }
  }

  let response
  try {
    response = await fetch(getServerUrl() + pathname, {
      method: options.method || 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    console.error('[Server API] Connection failed:', error)
    throw new Error('SERVER_UNAVAILABLE')
  }

  let data = {}
  try {
    data = await response.json()
  } catch {
    throw new Error('INVALID_SERVER_RESPONSE')
  }

  if (!response.ok) {
    throw new Error(data.error || `SERVER_ERROR_${response.status}`)
  }

  const changeRevisionHeader = response.headers.get('x-change-revision')
  const changeRevision = Number(changeRevisionHeader)
  if (
    changeRevisionHeader !== null &&
    Number.isInteger(changeRevision) &&
    changeRevision >= 0
  ) {
    acknowledgedSyncRevision = changeRevision
  }

  return data
}

export async function getSyncStateFromServer(token) {
  const data = await request('/api/sync/state', { token })
  return Number(data.revision) || 0
}

export async function streamSyncEventsFromServer(
  token,
  clientId,
  signal,
  onEvent,
) {
  const response = await fetch(getServerUrl() + '/api/sync/events', {
    headers: {
      Accept: 'text/event-stream',
      Authorization: `Bearer ${token}`,
      'X-Client-ID': clientId,
    },
    signal,
  })
  if (!response.ok || !response.body) {
    throw new Error(`SYNC_STREAM_${response.status}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (!signal.aborted) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
    let boundary = buffer.indexOf('\n\n')
    while (boundary >= 0) {
      const block = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      const data = block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')
      if (data) {
        try {
          onEvent(JSON.parse(data))
        } catch (error) {
          console.error('[Sync] Invalid event payload:', error)
        }
      }
      boundary = buffer.indexOf('\n\n')
    }
  }
}

export async function loginToServer(loginId, password) {
  return request('/api/auth/login', {
    method: 'POST',
    body: { loginId, password },
  })
}

export async function getServerSession(token) {
  const data = await request('/api/auth/session', { token })
  return data.user
}

export async function logoutFromServer(token) {
  return request('/api/auth/logout', { method: 'POST', token })
}

export async function getUsersFromServer(token) {
  const data = await request('/api/admin/users', { token })
  return data.users
}

export async function createUserOnServer(token, input) {
  const data = await request('/api/admin/users', {
    method: 'POST',
    token,
    body: input,
  })
  return data.user
}

export async function updateUserOnServer(token, userId, changes) {
  const data = await request(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    token,
    body: changes,
  })
  return data.user
}

export async function deleteUserOnServer(token, userId) {
  const data = await request(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    token,
  })
  return data.result
}

export async function getAssigneesFromServer(token) {
  const data = await request('/api/users/assignees', { token })
  return data.users
}

export async function getNavigationFromServer(token, options = {}) {
  const query = String(options.query ?? '').trim()
  const scope = options.scope ?? 'all'
  if (!['all', 'mine'].includes(scope)) {
    throw new Error('INVALID_WORKSPACE_SCOPE')
  }
  const search = new URLSearchParams({ scope })
  if (query) search.set('query', query)
  const data = await request(`/api/navigation?${search.toString()}`, { token })
  return data.nodes
}

export async function getTrashFromServer(token) {
  const data = await request('/api/navigation/trash', { token })
  return data.nodes
}

export async function restoreNavigationOnServer(token, nodeId) {
  const data = await request(
    `/api/navigation/nodes/${encodeURIComponent(nodeId)}/restore`,
    { method: 'POST', token },
  )
  return data.result
}

export async function permanentlyDeleteNavigationOnServer(token, nodeId) {
  const data = await request(
    `/api/navigation/nodes/${encodeURIComponent(nodeId)}/permanent`,
    { method: 'DELETE', token },
  )
  return data.result
}

export async function getWorkspaceTasksFromServer(
  token,
  view,
  scope = 'all',
) {
  const normalizedScope = scope ?? 'all'
  if (!['all', 'mine'].includes(normalizedScope)) {
    throw new Error('INVALID_WORKSPACE_SCOPE')
  }
  const search = new URLSearchParams({
    view: String(view || 'incomplete'),
    scope: normalizedScope,
  })
  const data = await request(`/api/workspace/tasks?${search.toString()}`, {
    token,
  })
  return data.tasks
}

export async function getBriefingFromServer(token, days = 7) {
  const data = await request(
    `/api/briefing?days=${encodeURIComponent(days)}`,
    { token },
  )
  return data.briefing
}

export async function createFolderOnServer(token, title, parentId) {
  const data = await request('/api/navigation/folders', {
    method: 'POST',
    token,
    body: { title, parentId },
  })
  return data.folder
}

export async function createTaskOnServer(token, title, parentId) {
  const data = await request('/api/navigation/tasks', {
    method: 'POST',
    token,
    body: { title, parentId },
  })
  return data.task
}

export async function renameNavigationOnServer(token, nodeId, title) {
  const data = await request(
    `/api/navigation/nodes/${encodeURIComponent(nodeId)}/title`,
    { method: 'PUT', token, body: { title } },
  )
  return data.node
}

export async function deleteNavigationOnServer(token, nodeId) {
  const data = await request(
    `/api/navigation/nodes/${encodeURIComponent(nodeId)}`,
    { method: 'DELETE', token },
  )
  return data.result
}

export async function moveNavigationOnServer(
  token,
  nodeId,
  targetFolderId,
) {
  const data = await request(
    `/api/navigation/nodes/${encodeURIComponent(nodeId)}/move`,
    { method: 'POST', token, body: { targetFolderId } },
  )
  return data.result
}

export async function copyNavigationOnServer(
  token,
  nodeId,
  targetFolderId,
) {
  const data = await request(
    `/api/navigation/nodes/${encodeURIComponent(nodeId)}/copy`,
    { method: 'POST', token, body: { targetFolderId } },
  )
  return data.result
}

export async function reorderNavigationOnServer(token, nodeId, direction) {
  const data = await request(
    `/api/navigation/nodes/${encodeURIComponent(nodeId)}/reorder`,
    { method: 'POST', token, body: { direction } },
  )
  return data.result
}

export async function dropNavigationOnServer(
  token,
  nodeId,
  targetNodeId,
  position,
) {
  const data = await request('/api/navigation/drop', {
    method: 'POST',
    token,
    body: { nodeId, targetNodeId, position },
  })
  return data.result
}

export async function setNavigationExpandedOnServer(
  token,
  nodeId,
  expanded,
) {
  const data = await request(
    `/api/navigation/nodes/${encodeURIComponent(nodeId)}/expanded`,
    { method: 'PUT', token, body: { expanded } },
  )
  return data.node
}

export async function setAllNavigationExpandedOnServer(token, expanded) {
  const data = await request(
    '/api/navigation/expand-all',
    { method: 'PUT', token, body: { expanded } },
  )
  return data.result
}

export async function getTaskFromServer(token, taskId) {
  const data = await request(`/api/tasks/${encodeURIComponent(taskId)}`, {
    token,
  })
  return data.task
}

export async function updateTaskOnServer(token, taskId, changes) {
  const data = await request(`/api/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PUT',
    token,
    body: changes,
  })
  return data.task
}

export async function toggleTaskOnServer(token, taskId) {
  const data = await request(
    `/api/tasks/${encodeURIComponent(taskId)}/toggle-completed`,
    { method: 'POST', token },
  )
  return data.task
}

export async function bulkUpdateTasksOnServer(token, taskIds, changes) {
  const data = await request('/api/tasks/bulk', {
    method: 'PUT',
    token,
    body: { taskIds, changes },
  })
  return data.tasks
}

export async function setTaskFavoriteOnServer(token, taskId, isFavorite) {
  const data = await request(
    `/api/tasks/${encodeURIComponent(taskId)}/favorite`,
    { method: 'PUT', token, body: { isFavorite } },
  )
  return data.state
}

export async function touchTaskRecentOnServer(token, taskId) {
  const data = await request(
    `/api/tasks/${encodeURIComponent(taskId)}/recent`,
    { method: 'POST', token },
  )
  return data.state
}

export async function getSubTasksFromServer(token, taskId) {
  const data = await request(
    `/api/tasks/${encodeURIComponent(taskId)}/subtasks`,
    { token },
  )
  return data.subTasks
}

export async function createSubTaskOnServer(token, taskId, title) {
  const data = await request(
    `/api/tasks/${encodeURIComponent(taskId)}/subtasks`,
    { method: 'POST', token, body: { title } },
  )
  return data.subTask
}

export async function toggleSubTaskOnServer(token, subTaskId) {
  const data = await request(
    `/api/subtasks/${encodeURIComponent(subTaskId)}/toggle`,
    { method: 'POST', token },
  )
  return data.subTask
}

export async function updateSubTaskOnServer(
  token,
  subTaskId,
  field,
  value,
) {
  const data = await request(`/api/subtasks/${encodeURIComponent(subTaskId)}`, {
    method: 'PUT',
    token,
    body: { field, value },
  })
  return data.subTask
}

export async function deleteSubTaskOnServer(token, subTaskId) {
  const data = await request(`/api/subtasks/${encodeURIComponent(subTaskId)}`, {
    method: 'DELETE',
    token,
  })
  return data.result
}

export async function getUserReferencesFromServer(token, userId) {
  const data = await request(
    `/api/admin/users/${encodeURIComponent(userId)}/references`,
    { token },
  )
  return data.references
}

export async function reorderSubTasksOnServer(token, taskId, orderedIds) {
  const data = await request(
    `/api/tasks/${encodeURIComponent(taskId)}/subtasks/order`,
    { method: 'PUT', token, body: { orderedIds } },
  )
  return data.subTasks
}

export async function getMemoFromServer(token, taskId) {
  const data = await request(`/api/tasks/${encodeURIComponent(taskId)}/memo`, {
    token,
  })
  return data.memo
}

export async function saveMemoOnServer(token, taskId, memo) {
  const data = await request(`/api/tasks/${encodeURIComponent(taskId)}/memo`, {
    method: 'PUT',
    token,
    body: { memo },
  })
  return data.memo
}

export async function getMemosFromServer(token, taskId) {
  const data = await request(`/api/tasks/${encodeURIComponent(taskId)}/memos`, {
    token,
  })
  return data.memos
}

export async function createMemoOnServer(token, taskId, contentHtml) {
  const data = await request(`/api/tasks/${encodeURIComponent(taskId)}/memos`, {
    method: 'POST',
    token,
    body: { contentHtml },
  })
  return data.memo
}

export async function updateMemoOnServer(token, memoId, contentHtml) {
  const data = await request(`/api/memos/${encodeURIComponent(memoId)}`, {
    method: 'PUT',
    token,
    body: { contentHtml },
  })
  return data.memo
}

export async function deleteMemoOnServer(token, memoId) {
  const data = await request(`/api/memos/${encodeURIComponent(memoId)}`, {
    method: 'DELETE',
    token,
  })
  return data.result
}

export async function getCommentsFromServer(token, taskId) {
  const data = await request(
    `/api/tasks/${encodeURIComponent(taskId)}/comments`,
    { token },
  )
  return data.comments
}

export async function createCommentOnServer(
  token,
  taskId,
  parentId,
  content,
) {
  const data = await request(
    `/api/tasks/${encodeURIComponent(taskId)}/comments`,
    { method: 'POST', token, body: { parentId, content } },
  )
  return data.comment
}

export async function updateCommentOnServer(token, commentId, content) {
  const data = await request(`/api/comments/${encodeURIComponent(commentId)}`, {
    method: 'PUT',
    token,
    body: { content },
  })
  return data.comment
}

export async function deleteCommentOnServer(token, commentId) {
  const data = await request(`/api/comments/${encodeURIComponent(commentId)}`, {
    method: 'DELETE',
    token,
  })
  return data.comment
}

export async function uploadAttachmentToServer(token, taskId, file) {
  let response
  try {
    response = await fetch(
      `${getServerUrl()}/api/tasks/${encodeURIComponent(taskId)}/attachments`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          'Content-Type': file.mimeType || 'application/octet-stream',
          'X-File-Name': encodeURIComponent(file.name),
          ...(syncClientId
            ? {
                'X-Client-ID': syncClientId,
                'X-Base-Revision': String(acknowledgedSyncRevision),
              }
            : {}),
        },
        body: file.data,
        signal: AbortSignal.timeout(FILE_REQUEST_TIMEOUT_MS),
      },
    )
  } catch (error) {
    console.error('[Server API] Attachment upload failed:', error)
    throw new Error('SERVER_UNAVAILABLE')
  }

  let data = {}
  try {
    data = await response.json()
  } catch {
    throw new Error('INVALID_SERVER_RESPONSE')
  }

  if (!response.ok) {
    throw new Error(data.error || `SERVER_ERROR_${response.status}`)
  }

  const changeRevisionHeader = response.headers.get('x-change-revision')
  const changeRevision = Number(changeRevisionHeader)
  if (
    changeRevisionHeader !== null &&
    Number.isInteger(changeRevision) &&
    changeRevision >= 0
  ) {
    acknowledgedSyncRevision = changeRevision
  }

  return data.attachment
}

export async function downloadAttachmentFromServer(token, attachmentId) {
  let response
  try {
    response = await fetch(
      `${getServerUrl()}/api/attachments/${encodeURIComponent(attachmentId)}/content`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(FILE_REQUEST_TIMEOUT_MS),
      },
    )
  } catch (error) {
    console.error('[Server API] Attachment download failed:', error)
    throw new Error('SERVER_UNAVAILABLE')
  }

  if (!response.ok) {
    let code = `SERVER_ERROR_${response.status}`
    try {
      code = (await response.json()).error || code
    } catch {
      // Binary endpoints can fail without a JSON response.
    }
    throw new Error(code)
  }

  const encodedName = response.headers.get('x-file-name') || 'attachment'
  let name
  try {
    name = decodeURIComponent(encodedName)
  } catch {
    name = encodedName
  }

  return {
    name,
    data: Buffer.from(await response.arrayBuffer()),
  }
}

export async function getDueRemindersFromServer(token, now) {
  const data = await request(
    `/api/reminders/due?now=${encodeURIComponent(now)}`,
    { token },
  )
  return data.reminders
}

export async function snoozeReminderOnServer(token, reminderId, remindAt) {
  const data = await request(
    `/api/reminders/${encodeURIComponent(reminderId)}/snooze`,
    { method: 'POST', token, body: { remindAt } },
  )
  return data.result
}

export async function completeReminderOnServer(token, reminderId) {
  const data = await request(
    `/api/reminders/${encodeURIComponent(reminderId)}/complete`,
    { method: 'POST', token },
  )
  return data.result
}

export async function dismissReminderOnServer(token, reminderId) {
  const data = await request(
    `/api/reminders/${encodeURIComponent(reminderId)}/dismiss`,
    { method: 'POST', token },
  )
  return data.result
}
