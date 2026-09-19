import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createReadStream, mkdirSync, watch } from 'node:fs'
import { readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  authenticateUser,
  bulkUpdateTasks,
  copyNavigationNode,
  createComment,
  createAttachment,
  createFolder,
  createManagedUser,
  createMemo,
  createSubTask,
  createTask,
  deleteComment,
  deleteNavigationNode,
  deleteSubTask,
  deleteManagedUser,
  deleteMemo,
  dismissReminderForUser,
  dropNavigationNode,
  approveUser,
  changeOwnPassword,
  createSignupRequest,
  getPendingUsers,
  rejectUser,
  updateOwnProfile,
  getAssigneeUsers,
  getAttachmentRecord,
  getComments,
  getDb,
  getManagedUsers,
  getManagedUserReferences,
  getMemo,
  getMemos,
  getDueDesktopReminders,
  getNavigationTree,
  getTrashNodes,
  getWorkspaceTasks,
  getBriefingData,
  getSessionUser,
  getSubTasks,
  getTaskDetail,
  initializeDb,
  markReminderSent,
  moveNavigationNode,
  permanentlyDeleteNavigationNode,
  restoreNavigationNode,
  moveNavigationNodeByDirection,
  renameNavigationNode,
  reorderSubTasks,
  recordActivity,
  saveMemo,
  snoozeReminderForUser,
  setNavigationNodeExpanded,
  setAllNavigationExpanded,
  setTaskFavorite,
  touchTaskRecent,
  toggleTaskCompleted,
  toggleSubTask,
  updateComment,
  updateSubTask,
  updateTaskDetail,
  updateManagedUser,
  updateMemo,
} from '../apps/desktop/electron/db.js'

const host = process.env.TODO_SERVER_HOST || '0.0.0.0'
const port = Number(process.env.TODO_SERVER_PORT || 4310)
const sessionDays = Math.max(1, Number(process.env.TODO_SESSION_DAYS || 30))
const serverVersion = '1.5.0'
const syncClients = new Set()
let updateDirectoryWatcher = null
let updateBroadcastTimer = null
const maxAttachmentBytes = Math.max(
  1024 * 1024,
  Number(process.env.TODO_MAX_ATTACHMENT_BYTES || 25 * 1024 * 1024),
)
const uploadsDirectory = path.resolve(
  process.env.TODO_UPLOADS_PATH ||
    path.join(path.dirname(fileURLToPath(import.meta.url)), 'uploads'),
)
const updatesDirectory = path.resolve(
  process.env.TODO_UPDATES_PATH ||
    path.join(path.dirname(fileURLToPath(import.meta.url)), 'updates'),
)

mkdirSync(uploadsDirectory, { recursive: true })
mkdirSync(updatesDirectory, { recursive: true })

function getUpdateContentType(fileName) {
  if (fileName.endsWith('.yml') || fileName.endsWith('.yaml')) {
    return 'text/yaml; charset=utf-8'
  }
  if (fileName.endsWith('.json')) return 'application/json; charset=utf-8'
  return 'application/octet-stream'
}

async function serveUpdateFile(request, response, pathname) {
  let fileName
  try {
    fileName = decodeURIComponent(pathname.slice('/updates/'.length))
  } catch {
    sendJson(response, 400, { error: 'INVALID_UPDATE_PATH' })
    return
  }

  if (
    !fileName ||
    fileName !== path.basename(fileName) ||
    fileName.includes('/') ||
    fileName.includes('\\')
  ) {
    sendJson(response, 404, { error: 'UPDATE_FILE_NOT_FOUND' })
    return
  }

  const filePath = path.join(updatesDirectory, fileName)
  let fileStat
  try {
    fileStat = await stat(filePath)
  } catch {
    sendJson(response, 404, { error: 'UPDATE_FILE_NOT_FOUND' })
    return
  }

  if (!fileStat.isFile()) {
    sendJson(response, 404, { error: 'UPDATE_FILE_NOT_FOUND' })
    return
  }

  const headers = {
    'Content-Type': getUpdateContentType(fileName),
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': fileName.endsWith('.yml') || fileName.endsWith('.yaml')
      ? 'no-store, no-cache, must-revalidate'
      : 'public, max-age=3600',
  }
  const range = String(request.headers.range || '')
    .match(/^bytes=(\d+)-(\d*)$/)

  if (range) {
    const start = Number(range[1])
    const requestedEnd = range[2] ? Number(range[2]) : fileStat.size - 1
    const end = Math.min(requestedEnd, fileStat.size - 1)

    if (!Number.isInteger(start) || start < 0 || start > end) {
      response.writeHead(416, {
        ...headers,
        'Content-Range': `bytes */${fileStat.size}`,
      })
      response.end()
      return
    }

    response.writeHead(206, {
      ...headers,
      'Content-Length': end - start + 1,
      'Content-Range': `bytes ${start}-${end}/${fileStat.size}`,
    })
    if (request.method === 'HEAD') {
      response.end()
      return
    }
    createReadStream(filePath, { start, end }).pipe(response)
    return
  }

  response.writeHead(200, {
    ...headers,
    'Content-Length': fileStat.size,
  })
  if (request.method === 'HEAD') {
    response.end()
    return
  }
  createReadStream(filePath).pipe(response)
}

function formatSqliteDateTime(date) {
  return date.toISOString().replace('T', ' ').replace('Z', '').slice(0, 19)
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function getCurrentSyncRevision() {
  return Number(
    getDb().prepare(`SELECT revision FROM sync_state WHERE id = 1`).get()
      ?.revision || 0,
  )
}

function commitSyncChange(context) {
  const row = getDb().prepare(`
    UPDATE sync_state
    SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
    RETURNING revision
  `).get()
  return {
    revision: Number(row.revision),
    sourceClientId: context.clientId,
    method: context.method,
    pathname: context.pathname,
    changedAt: new Date().toISOString(),
  }
}

function getActivityTarget(taskId = null, entityId = null) {
  const db = getDb()
  if (taskId) {
    const task = db.prepare(`
      SELECT id, title
      FROM nav_nodes
      WHERE id = ?
      LIMIT 1
    `).get(taskId)
    if (task) return { taskId: task.id, title: task.title }
  }

  if (entityId) {
    const subTask = db.prepare(`
      SELECT nav_node.id AS taskId, sub_task.title
      FROM sub_tasks AS sub_task
      JOIN task_details AS task_detail ON task_detail.id = sub_task.task_detail_id
      JOIN nav_nodes AS nav_node ON nav_node.id = task_detail.nav_node_id
      WHERE sub_task.id = ?
    `).get(entityId)
    if (subTask) return subTask

    const comment = db.prepare(`
      SELECT nav_node.id AS taskId, nav_node.title
      FROM comments AS comment
      JOIN task_details AS task_detail ON task_detail.id = comment.task_detail_id
      JOIN nav_nodes AS nav_node ON nav_node.id = task_detail.nav_node_id
      WHERE comment.id = ?
    `).get(entityId)
    if (comment) return comment

    const node = db.prepare(`
      SELECT id, title, node_type AS type
      FROM nav_nodes
      WHERE id = ?
    `).get(entityId)
    if (node) {
      return {
        taskId: node.type === 'task' ? node.id : null,
        title: node.title,
      }
    }
  }

  return { taskId: taskId || null, title: '업무 변경' }
}

function describeMutation(context, body) {
  const { method, pathname } = context
  if (
    pathname.startsWith('/api/admin/') ||
    pathname.includes('/expanded') ||
    pathname === '/api/navigation/expand-all' ||
    /^\/api\/tasks\/[^/]+\/(favorite|recent)$/.test(pathname) ||
    /^\/api\/reminders\/[^/]+\/(snooze|dismiss)$/.test(pathname)
  ) {
    return null
  }

  let actionType = method === 'DELETE' ? 'deleted' : method === 'POST' ? 'created' : 'updated'
  let entityType = 'workspace'
  let entityId = null
  let taskId = null
  let summary = '업무 내용이 변경되었습니다.'

  const taskMatch = pathname.match(/^\/api\/tasks\/([^/]+)(?:\/(subtasks|memo|memos|comments|attachments|toggle-completed)(?:\/order)?)?$/)
  const subTaskMatch = pathname.match(/^\/api\/subtasks\/([^/]+)(?:\/toggle)?$/)
  const memoMatch = pathname.match(/^\/api\/memos\/([^/]+)$/)
  const commentMatch = pathname.match(/^\/api\/comments\/([^/]+)$/)
  const navigationMatch = pathname.match(/^\/api\/navigation\/nodes\/([^/]+)(?:\/(title|move|copy|reorder|restore|permanent))?$/)
  const reminderCompleteMatch = pathname.match(/^\/api\/reminders\/([^/]+)\/complete$/)

  if (pathname === '/api/tasks/bulk') {
    entityType = 'task'
    actionType = 'updated'
    summary = `${body?.tasks?.length || 0}개 Task가 일괄 변경되었습니다.`
  } else if (pathname === '/api/navigation/tasks') {
    entityType = 'task'
    entityId = body?.task?.id || null
    taskId = entityId
    summary = '새 Task가 생성되었습니다.'
  } else if (pathname === '/api/navigation/folders') {
    entityType = 'folder'
    entityId = body?.folder?.id || null
    summary = '새 폴더가 생성되었습니다.'
  } else if (pathname === '/api/navigation/drop') {
    entityType = 'navigation'
    entityId = body?.result?.id || null
    actionType = 'moved'
    summary = '업무 위치가 드래그 앤 드롭으로 변경되었습니다.'
  } else if (navigationMatch) {
    entityType = 'navigation'
    entityId = decodeURIComponent(navigationMatch[1])
    const action = navigationMatch[2]
    if (action === 'restore') {
      actionType = 'restored'
      summary = '휴지통의 업무 또는 폴더가 복원되었습니다.'
    } else if (action === 'permanent') {
      actionType = 'deleted'
      summary = '휴지통의 업무 또는 폴더가 영구 삭제되었습니다.'
    } else if (method === 'DELETE') summary = '업무 또는 폴더가 삭제되었습니다.'
    else if (action === 'title') summary = '이름이 변경되었습니다.'
    else if (action === 'copy') {
      actionType = 'copied'
      summary = '업무 또는 폴더가 복사되었습니다.'
    } else if (action === 'reorder') {
      actionType = 'moved'
      summary = '표시 순서가 변경되었습니다.'
    } else {
      actionType = 'moved'
      summary = '업무 위치가 변경되었습니다.'
    }
  } else if (taskMatch) {
    taskId = decodeURIComponent(taskMatch[1])
    entityId = taskId
    entityType = taskMatch[2] || 'task'
    if (taskMatch[2] === 'subtasks') {
      entityType = 'subtask'
      entityId = body?.subTask?.id || null
      if (pathname.endsWith('/order')) {
        actionType = 'moved'
        summary = 'Sub Task 순서가 변경되었습니다.'
      } else {
        summary = '새 Sub Task가 생성되었습니다.'
      }
    } else if (taskMatch[2] === 'memo' || taskMatch[2] === 'memos') {
      entityType = 'memo'
      entityId = body?.memo?.id || null
      summary = '메모가 변경되었습니다.'
    } else if (taskMatch[2] === 'comments') {
      entityType = 'comment'
      entityId = body?.comment?.id || null
      actionType = 'commented'
      summary = '새 댓글이 등록되었습니다.'
    } else if (taskMatch[2] === 'attachments') {
      entityType = 'attachment'
      entityId = body?.attachment?.id || null
      actionType = 'attached'
      summary = `${body?.attachment?.name || '파일'}이 첨부되었습니다.`
    } else if (taskMatch[2] === 'toggle-completed') {
      actionType = body?.task?.completed ? 'completed' : 'reopened'
      summary = body?.task?.completed
        ? 'Task가 완료되었습니다.'
        : 'Task가 다시 진행 상태로 변경되었습니다.'
    } else {
      summary = 'Task 상세 정보가 변경되었습니다.'
    }
  } else if (subTaskMatch) {
    entityType = 'subtask'
    entityId = decodeURIComponent(subTaskMatch[1])
    if (method === 'DELETE') summary = 'Sub Task가 삭제되었습니다.'
    else if (pathname.endsWith('/toggle')) {
      actionType = body?.subTask?.completed ? 'completed' : 'reopened'
      summary = body?.subTask?.completed
        ? 'Sub Task가 완료되었습니다.'
        : 'Sub Task가 다시 진행 상태로 변경되었습니다.'
    } else summary = 'Sub Task 정보가 변경되었습니다.'
  } else if (memoMatch) {
    entityType = 'memo'
    entityId = decodeURIComponent(memoMatch[1])
    const memoTask = getDb().prepare(`
      SELECT task_detail.nav_node_id AS taskId
      FROM memos AS memo
      JOIN task_details AS task_detail ON task_detail.id = memo.task_detail_id
      WHERE memo.id = ?
    `).get(entityId)
    taskId = body?.result?.taskId || memoTask?.taskId || null
    summary = method === 'DELETE' ? '메모가 삭제되었습니다.' : '메모가 수정되었습니다.'
  } else if (commentMatch) {
    entityType = 'comment'
    entityId = decodeURIComponent(commentMatch[1])
    actionType = method === 'DELETE' ? 'deleted' : 'commented'
    summary = method === 'DELETE' ? '댓글이 삭제되었습니다.' : '댓글이 수정되었습니다.'
  } else if (reminderCompleteMatch) {
    entityType = 'task'
    taskId = body?.result?.taskId || null
    entityId = taskId
    actionType = 'completed'
    summary = '알림창에서 Task가 완료 처리되었습니다.'
  } else {
    return null
  }

  const target = getActivityTarget(taskId, entityId)
  return {
    actorUserId: context.actorUserId,
    actorName: context.actorName,
    actionType,
    entityType,
    entityId,
    taskId: target.taskId,
    title: target.title,
    summary,
  }
}

function broadcastSyncEvent(event) {
  const message = `event: sync\ndata: ${JSON.stringify(event)}\n\n`
  syncClients.forEach((client) => {
    try {
      client.write(message)
    } catch {
      syncClients.delete(client)
    }
  })
}

async function broadcastPublishedUpdate(metadataFileName) {
  try {
    const metadata = await readFile(
      path.join(updatesDirectory, metadataFileName),
      'utf8',
    )
    const version = metadata.match(/^version:\s*['"]?([^'"\s]+)['"]?/m)?.[1]
    const artifact = metadata.match(/^path:\s*['"]?(.+?)['"]?\s*$/m)?.[1]
    if (!version || !artifact) return

    await stat(path.join(updatesDirectory, path.basename(artifact)))
    broadcastSyncEvent({
      // 0.9.3 클라이언트가 이 신호를 업무 데이터 변경으로 오인하지 않도록
      // 데이터 리비전과 분리된 0을 사용합니다.
      revision: 0,
      sourceClientId: '',
      method: 'PUBLISH',
      pathname: `/updates/${metadataFileName}`,
      changedAt: new Date().toISOString(),
      kind: 'app-update',
      version,
      channel: path.basename(metadataFileName, path.extname(metadataFileName)),
    })
    console.log(`[Update] Push sent for version ${version}`)
  } catch (error) {
    console.error('[Update] Failed to announce published update:', error)
  }
}

function startUpdateDirectoryWatcher() {
  updateDirectoryWatcher = watch(
    updatesDirectory,
    { persistent: false },
    (_eventType, changedFileName) => {
      const metadataFileName = String(changedFileName || '')
      if (!/^(latest|beta)\.ya?ml$/i.test(metadataFileName)) return
      clearTimeout(updateBroadcastTimer)
      updateBroadcastTimer = setTimeout(
        () => void broadcastPublishedUpdate(metadataFileName),
        750,
      )
    },
  )
  updateDirectoryWatcher.on('error', (error) => {
    console.error('[Update] Directory watcher failed:', error)
  })
}

function isSynchronizedMutation(method, pathname) {
  if (!['POST', 'PUT', 'DELETE'].includes(method)) return false
  if (!pathname.startsWith('/api/')) return false
  if (pathname.startsWith('/api/auth/')) return false
  if (/^\/api\/reminders\/[^/]+\/(snooze|dismiss)$/.test(pathname)) {
    return false
  }
  if (/^\/api\/tasks\/[^/]+\/(favorite|recent)$/.test(pathname)) {
    return false
  }
  return true
}

function sendJson(response, statusCode, body) {
  let syncEvent = null
  const syncContext = response.syncContext
  if (
    statusCode < 400 &&
    syncContext?.isMutation &&
    !syncContext.committed
  ) {
    syncContext.committed = true
    syncEvent = commitSyncChange(syncContext)
    try {
      const activity = describeMutation(syncContext, body)
      if (activity) recordActivity({ ...activity, revision: syncEvent.revision })
    } catch (error) {
      console.error('[Briefing] Failed to record activity:', error)
    }
  }
  const json = JSON.stringify(body)
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-File-Name, X-Client-ID, X-Base-Revision',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Expose-Headers': 'X-Change-Revision, X-Server-Revision',
    'X-Server-Revision': String(getCurrentSyncRevision()),
    ...(syncEvent ? { 'X-Change-Revision': String(syncEvent.revision) } : {}),
    'Cache-Control': 'no-store',
  })
  response.end(json)
  if (syncEvent) queueMicrotask(() => broadcastSyncEvent(syncEvent))
}

async function readBuffer(request, limit = maxAttachmentBytes) {
  const chunks = []
  let size = 0

  for await (const chunk of request) {
    size += chunk.length
    if (size > limit) {
      throw new Error('ATTACHMENT_TOO_LARGE')
    }
    chunks.push(chunk)
  }

  return Buffer.concat(chunks)
}

function sanitizeFileName(fileName) {
  return String(fileName || 'attachment')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .slice(0, 180)
}

function getReminderForUser(reminderId, userId) {
  const reminder = getDb().prepare(`
    SELECT
      reminder.id,
      task_detail.nav_node_id AS taskId
    FROM reminders AS reminder
    JOIN task_details AS task_detail ON task_detail.id = reminder.task_detail_id
    JOIN nav_nodes AS nav_node ON nav_node.id = task_detail.nav_node_id
    WHERE
      reminder.id = ?
      AND EXISTS (
        SELECT 1
        FROM task_assignees AS task_assignee
        WHERE
          task_assignee.task_detail_id = task_detail.id
          AND task_assignee.user_id = ?
      )
      AND nav_node.deleted_at IS NULL
  `).get(reminderId, userId)

  if (!reminder) {
    throw new Error(`Reminder not found: ${reminderId}`)
  }

  return reminder
}

async function readJson(request) {
  const chunks = []
  let size = 0

  for await (const chunk of request) {
    size += chunk.length
    if (size > 1024 * 1024) {
      throw new Error('REQUEST_TOO_LARGE')
    }
    chunks.push(chunk)
  }

  if (chunks.length === 0) {
    return {}
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new Error('INVALID_JSON')
  }
}

function issueSession(userId) {
  const db = getDb()
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000)

  db.prepare(`
    INSERT INTO auth_sessions (id, user_id, token_hash, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(
    `session-${randomUUID()}`,
    userId,
    hashToken(token),
    formatSqliteDateTime(expiresAt),
  )

  return { token, expiresAt: expiresAt.toISOString() }
}

function getBearerToken(request) {
  const authorization = String(request.headers.authorization || '')
  return authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : ''
}

function requireSession(request) {
  const db = getDb()
  const token = getBearerToken(request)

  if (!token) {
    throw new Error('AUTH_REQUIRED')
  }

  const session = db.prepare(`
    SELECT id, user_id AS userId
    FROM auth_sessions
    WHERE token_hash = ? AND expires_at > CURRENT_TIMESTAMP
    LIMIT 1
  `).get(hashToken(token))

  if (!session) {
    throw new Error('AUTH_REQUIRED')
  }

  const user = getSessionUser(session.userId)
  if (!user) {
    db.prepare(`DELETE FROM auth_sessions WHERE id = ?`).run(session.id)
    throw new Error('AUTH_REQUIRED')
  }

  db.prepare(`
    UPDATE auth_sessions
    SET last_used_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(session.id)

  if (request.syncContext) {
    request.syncContext.actorUserId = user.id
    request.syncContext.actorName = user.name
  }

  return { sessionId: session.id, user, token }
}

function requireAdmin(request) {
  const session = requireSession(request)
  if (session.user.role !== 'admin') {
    throw new Error('ADMIN_REQUIRED')
  }
  return session
}

function getErrorStatus(code) {
  if (code === 'LOGIN_FAILED' || code === 'AUTH_REQUIRED') return 401
  if (code === 'ADMIN_REQUIRED') return 403
  if (code === 'USER_NOT_FOUND' || code.toLowerCase().includes('not found')) {
    return 404
  }
  if (
    code === 'LOGIN_ID_OR_EMAIL_EXISTS' ||
    code === 'USER_HAS_RELATED_DATA' ||
    code === 'USER_NOT_PENDING' ||
    code === 'SYNC_CONFLICT' ||
    code === 'CLIENT_UPDATE_REQUIRED'
  ) return 409
  if (
    code === 'INVALID_JSON' ||
    code === 'REQUEST_TOO_LARGE' ||
    code === 'CURRENT_PASSWORD_INCORRECT' ||
    code.includes('required') ||
    code.includes('must be') ||
    code.startsWith('ADMIN_CANNOT') ||
    code === 'LAST_ADMIN_REQUIRED' ||
    code === 'INVALID_TASK_PRIORITY' ||
    code === 'INVALID_WORKFLOW_STATUS' ||
    code === 'INVALID_WORKSPACE_VIEW' ||
    code === 'INVALID_WORKSPACE_SCOPE' ||
    code === 'TASK_BULK_SIZE_INVALID' ||
    code === 'TASK_BULK_CHANGES_REQUIRED' ||
    code === 'TASK_BULK_TARGET_NOT_FOUND' ||
    code === 'TASK_BULK_TARGET_INVALID' ||
    code === 'INVALID_TASK_TAGS' ||
    code === 'INVALID_TASK_DUE_DATE' ||
    code === 'INVALID_TASK_COMPLETED' ||
    code === 'INVALID_TASK_ASSIGNEES' ||
    code === 'INVALID_TASK_PARENT' ||
    code === 'INVALID_TASK_FAVORITE' ||
    code === 'ASSIGNEE_USER_NOT_FOUND' ||
    code === 'TARGET_FOLDER_NOT_FOUND'
  ) {
    return 400
  }
  if (code === 'ATTACHMENT_TOO_LARGE') return 413
  if (code === 'USER_DELETE_FAILED') return 500
  return 500
}

async function handleRequest(request, response) {
  const method = request.method || 'GET'
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
  const pathname = url.pathname

  if (
    (method === 'GET' || method === 'HEAD') &&
    pathname.startsWith('/updates/')
  ) {
    await serveUpdateFile(request, response, pathname)
    return
  }

  if (response.syncContext?.isMutation) {
    if (response.syncContext.baseRevision === null) {
      throw new Error('CLIENT_UPDATE_REQUIRED')
    }
    if (response.syncContext.baseRevision !== getCurrentSyncRevision()) {
      throw new Error('SYNC_CONFLICT')
    }
  }

  if (method === 'OPTIONS') {
    sendJson(response, 204, {})
    return
  }

  if (method === 'GET' && pathname === '/health') {
    sendJson(response, 200, {
      ok: true,
      service: 'investment-planning-team-workspace-server',
      version: serverVersion,
      serverTime: new Date().toISOString(),
    })
    return
  }

  if (method === 'GET' && pathname === '/api/sync/state') {
    requireSession(request)
    sendJson(response, 200, { revision: getCurrentSyncRevision() })
    return
  }

  if (method === 'GET' && pathname === '/api/sync/events') {
    requireSession(request)
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    })
    response.write(
      `event: sync\ndata: ${JSON.stringify({
        revision: getCurrentSyncRevision(),
        sourceClientId: '',
        method: 'GET',
        pathname: '/api/sync/state',
        changedAt: new Date().toISOString(),
        kind: 'connected',
      })}\n\n`,
    )
    syncClients.add(response)
    const heartbeat = setInterval(() => {
      if (!response.destroyed) response.write(': heartbeat\n\n')
    }, 20000)
    request.on('close', () => {
      clearInterval(heartbeat)
      syncClients.delete(response)
    })
    return
  }

  if (method === 'GET' && pathname === '/api/workspace/tasks') {
    const session = requireSession(request)
    const view = String(url.searchParams.get('view') || 'incomplete')
    const scope = String(url.searchParams.get('scope') || 'all')
    if (!['all', 'mine'].includes(scope)) {
      throw new Error('INVALID_WORKSPACE_SCOPE')
    }
    sendJson(response, 200, {
      tasks: getWorkspaceTasks(session.user.id, view, scope),
    })
    return
  }

  if (method === 'GET' && pathname === '/api/briefing') {
    const session = requireSession(request)
    const days = Number(url.searchParams.get('days') || 7)
    sendJson(response, 200, { briefing: getBriefingData(days, session.user.id) })
    return
  }

  if (method === 'POST' && pathname === '/api/auth/login') {
    const body = await readJson(request)
    const user = authenticateUser(body.loginId, body.password)
    const session = issueSession(user.id)
    sendJson(response, 200, { user, ...session })
    return
  }

  // Self-service signup request. Creates a pending (inactive) account that
  // cannot log in until an admin approves it. Unauthenticated by design.
  if (method === 'POST' && pathname === '/api/auth/signup') {
    const body = await readJson(request)
    sendJson(response, 201, { result: createSignupRequest(body) })
    return
  }

  if (method === 'GET' && pathname === '/api/auth/session') {
    const session = requireSession(request)
    sendJson(response, 200, { user: session.user })
    return
  }

  if (method === 'POST' && pathname === '/api/auth/logout') {
    const session = requireSession(request)
    getDb().prepare(`DELETE FROM auth_sessions WHERE id = ?`).run(session.sessionId)
    sendJson(response, 200, { success: true })
    return
  }

  // Self-service: the logged-in user edits their own name/email.
  if (method === 'PUT' && pathname === '/api/me/profile') {
    const session = requireSession(request)
    const body = await readJson(request)
    sendJson(response, 200, { user: updateOwnProfile(session.user.id, body) })
    return
  }

  // Self-service: the logged-in user changes their own password.
  if (method === 'POST' && pathname === '/api/me/password') {
    const session = requireSession(request)
    const body = await readJson(request)
    sendJson(response, 200, {
      result: changeOwnPassword(
        session.user.id,
        body.currentPassword,
        body.newPassword,
      ),
    })
    return
  }

  if (method === 'GET' && pathname === '/api/users/assignees') {
    requireSession(request)
    sendJson(response, 200, { users: getAssigneeUsers() })
    return
  }

  if (method === 'GET' && pathname === '/api/navigation') {
    const session = requireSession(request)
    const query = String(url.searchParams.get('query') || '')
    const scope = String(url.searchParams.get('scope') || 'all')
    if (!['all', 'mine'].includes(scope)) {
      throw new Error('INVALID_WORKSPACE_SCOPE')
    }
    sendJson(response, 200, {
      nodes: getNavigationTree({
        query,
        assignedUserId: scope === 'mine' ? session.user.id : '',
      }),
    })
    return
  }

  if (method === 'GET' && pathname === '/api/navigation/trash') {
    const session = requireSession(request)
    sendJson(response, 200, { nodes: getTrashNodes(session.user.id) })
    return
  }

  if (method === 'POST' && pathname === '/api/navigation/folders') {
    const session = requireSession(request)
    const body = await readJson(request)
    const folder = createFolder(
      body.title,
      body.parentId ?? null,
      session.user.id,
    )
    sendJson(response, 201, { folder })
    return
  }

  if (method === 'POST' && pathname === '/api/navigation/tasks') {
    const session = requireSession(request)
    const body = await readJson(request)
    const task = createTask(
      body.title,
      body.parentId ?? null,
      session.user.id,
    )
    sendJson(response, 201, { task })
    return
  }

  if (method === 'POST' && pathname === '/api/navigation/drop') {
    requireSession(request)
    const body = await readJson(request)
    const result = dropNavigationNode(
      body.nodeId,
      body.targetNodeId,
      body.position,
    )
    sendJson(response, 200, { result })
    return
  }

  if (method === 'PUT' && pathname === '/api/navigation/expand-all') {
    requireSession(request)
    const body = await readJson(request)
    sendJson(response, 200, {
      result: setAllNavigationExpanded(Boolean(body.expanded)),
    })
    return
  }

  const navigationNodeMatch = pathname.match(
    /^\/api\/navigation\/nodes\/([^/]+)(?:\/(title|move|copy|reorder|expanded|restore|permanent))?$/,
  )
  if (navigationNodeMatch) {
    const session = requireSession(request)
    const nodeId = decodeURIComponent(navigationNodeMatch[1])
    const action = navigationNodeMatch[2]

    if (method === 'PUT' && action === 'title') {
      const body = await readJson(request)
      sendJson(response, 200, {
        node: renameNavigationNode(nodeId, body.title),
      })
      return
    }

    if (method === 'DELETE' && !action) {
      sendJson(response, 200, { result: deleteNavigationNode(nodeId) })
      return
    }

    if (method === 'POST' && action === 'restore') {
      sendJson(response, 200, {
        result: restoreNavigationNode(nodeId, session.user.id),
      })
      return
    }

    if (method === 'DELETE' && action === 'permanent') {
      sendJson(response, 200, {
        result: permanentlyDeleteNavigationNode(nodeId, session.user.id),
      })
      return
    }

    if (method === 'POST' && action === 'move') {
      const body = await readJson(request)
      sendJson(response, 200, {
        result: moveNavigationNode(nodeId, body.targetFolderId ?? null),
      })
      return
    }

    if (method === 'POST' && action === 'copy') {
      const body = await readJson(request)
      sendJson(response, 201, {
        result: copyNavigationNode(nodeId, body.targetFolderId ?? null),
      })
      return
    }

    if (method === 'POST' && action === 'reorder') {
      const body = await readJson(request)
      sendJson(response, 200, {
        result: moveNavigationNodeByDirection(nodeId, body.direction),
      })
      return
    }

    if (method === 'PUT' && action === 'expanded') {
      const body = await readJson(request)
      sendJson(response, 200, {
        node: setNavigationNodeExpanded(nodeId, body.expanded),
      })
      return
    }
  }

  const taskSubTasksMatch = pathname.match(
    /^\/api\/tasks\/([^/]+)\/subtasks(?:\/(order))?$/,
  )
  if (taskSubTasksMatch) {
    requireSession(request)
    const taskId = decodeURIComponent(taskSubTasksMatch[1])
    const action = taskSubTasksMatch[2]

    if (method === 'GET' && !action) {
      sendJson(response, 200, { subTasks: getSubTasks(taskId) })
      return
    }

    if (method === 'POST' && !action) {
      const body = await readJson(request)
      sendJson(response, 201, {
        subTask: createSubTask(taskId, body.title),
      })
      return
    }

    if (method === 'PUT' && action === 'order') {
      const body = await readJson(request)
      sendJson(response, 200, {
        subTasks: reorderSubTasks(taskId, body.orderedIds),
      })
      return
    }
  }

  const subTaskMatch = pathname.match(
    /^\/api\/subtasks\/([^/]+)(?:\/(toggle))?$/,
  )
  if (subTaskMatch) {
    requireSession(request)
    const subTaskId = decodeURIComponent(subTaskMatch[1])
    const action = subTaskMatch[2]

    if (method === 'POST' && action === 'toggle') {
      sendJson(response, 200, { subTask: toggleSubTask(subTaskId) })
      return
    }

    if (method === 'PUT' && !action) {
      const body = await readJson(request)
      sendJson(response, 200, {
        subTask: updateSubTask(subTaskId, body.field, body.value),
      })
      return
    }

    if (method === 'DELETE' && !action) {
      sendJson(response, 200, { result: deleteSubTask(subTaskId) })
      return
    }
  }

  const taskMemoMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/memo$/)
  if (taskMemoMatch) {
    const session = requireSession(request)
    const taskId = decodeURIComponent(taskMemoMatch[1])

    if (method === 'GET') {
      sendJson(response, 200, { memo: getMemo(taskId) })
      return
    }

    if (method === 'PUT') {
      const body = await readJson(request)
      sendJson(response, 200, {
        memo: saveMemo(taskId, body.memo, session.user.id),
      })
      return
    }
  }

  const taskMemosMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/memos$/)
  if (taskMemosMatch) {
    const session = requireSession(request)
    const taskId = decodeURIComponent(taskMemosMatch[1])

    if (method === 'GET') {
      sendJson(response, 200, { memos: getMemos(taskId) })
      return
    }

    if (method === 'POST') {
      const body = await readJson(request)
      sendJson(response, 201, {
        memo: createMemo(taskId, body.contentHtml, session.user.id),
      })
      return
    }
  }

  const memoMatch = pathname.match(/^\/api\/memos\/([^/]+)$/)
  if (memoMatch) {
    const session = requireSession(request)
    const memoId = decodeURIComponent(memoMatch[1])

    if (method === 'PUT') {
      const body = await readJson(request)
      sendJson(response, 200, {
        memo: updateMemo(memoId, body.contentHtml, session.user.id),
      })
      return
    }

    if (method === 'DELETE') {
      sendJson(response, 200, { result: deleteMemo(memoId) })
      return
    }
  }

  const taskCommentsMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/comments$/)
  if (taskCommentsMatch) {
    const session = requireSession(request)
    const taskId = decodeURIComponent(taskCommentsMatch[1])

    if (method === 'GET') {
      sendJson(response, 200, { comments: getComments(taskId) })
      return
    }

    if (method === 'POST') {
      const body = await readJson(request)
      sendJson(response, 201, {
        comment: createComment(
          taskId,
          body.parentId ?? null,
          body.content,
          session.user.id,
        ),
      })
      return
    }
  }

  const taskAttachmentsMatch = pathname.match(
    /^\/api\/tasks\/([^/]+)\/attachments$/,
  )
  if (method === 'POST' && taskAttachmentsMatch) {
    const session = requireSession(request)
    const taskId = decodeURIComponent(taskAttachmentsMatch[1])
    const encodedName = String(request.headers['x-file-name'] || 'attachment')
    let originalName
    try {
      originalName = sanitizeFileName(decodeURIComponent(encodedName))
    } catch {
      originalName = sanitizeFileName(encodedName)
    }

    const content = await readBuffer(request)
    if (content.length === 0) {
      throw new Error('Attachment file is required')
    }

    const storedName = `${randomUUID()}-${originalName}`
    const storedPath = path.join(uploadsDirectory, storedName)
    await writeFile(storedPath, content, { flag: 'wx' })

    try {
      const attachment = createAttachment(
        taskId,
        {
          name: originalName,
          path: storedPath,
          mimeType: String(
            request.headers['content-type'] || 'application/octet-stream',
          ),
          size: content.length,
        },
        session.user.id,
      )
      sendJson(response, 201, { attachment })
    } catch (error) {
      await unlink(storedPath).catch(() => {})
      throw error
    }
    return
  }

  const attachmentContentMatch = pathname.match(
    /^\/api\/attachments\/([^/]+)\/content$/,
  )
  if (method === 'GET' && attachmentContentMatch) {
    requireSession(request)
    const attachmentId = decodeURIComponent(attachmentContentMatch[1])
    const attachment = getAttachmentRecord(attachmentId)
    const fileStat = await stat(attachment.path)
    const encodedName = encodeURIComponent(attachment.name)

    response.writeHead(200, {
      'Content-Type': attachment.mimeType,
      'Content-Length': fileStat.size,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodedName}`,
      'X-File-Name': encodedName,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'X-File-Name',
      'Cache-Control': 'private, no-store',
    })
    createReadStream(attachment.path).pipe(response)
    return
  }

  if (method === 'GET' && pathname === '/api/reminders/due') {
    const session = requireSession(request)
    const now = String(url.searchParams.get('now') || '').trim()
    if (!now) {
      throw new Error('Reminder check time is required')
    }
    sendJson(response, 200, {
      reminders: getDueDesktopReminders(now, session.user.id),
    })
    return
  }

  const reminderMatch = pathname.match(
    /^\/api\/reminders\/([^/]+)\/(snooze|dismiss|complete)$/,
  )
  if (method === 'POST' && reminderMatch) {
    const session = requireSession(request)
    const reminderId = decodeURIComponent(reminderMatch[1])
    const action = reminderMatch[2]
    const reminder = getReminderForUser(reminderId, session.user.id)

    if (action === 'snooze') {
      const body = await readJson(request)
      const remindAt = String(body.remindAt || '').trim()
      if (!remindAt) {
        throw new Error('Reminder time is required')
      }
      sendJson(response, 200, {
        result: snoozeReminderForUser(reminderId, session.user.id, remindAt),
      })
      return
    }

    if (action === 'complete') {
      const task = getTaskDetail(reminder.taskId)
      if (!task.completed) {
        toggleTaskCompleted(reminder.taskId)
      }
      markReminderSent(reminderId)
      sendJson(response, 200, {
        result: { id: reminderId, taskId: reminder.taskId },
      })
      return
    }

    sendJson(response, 200, {
      result: dismissReminderForUser(reminderId, session.user.id),
    })
    return
  }

  const commentMatch = pathname.match(/^\/api\/comments\/([^/]+)$/)
  if (commentMatch) {
    requireSession(request)
    const commentId = decodeURIComponent(commentMatch[1])

    if (method === 'PUT') {
      const body = await readJson(request)
      sendJson(response, 200, {
        comment: updateComment(commentId, body.content),
      })
      return
    }

    if (method === 'DELETE') {
      sendJson(response, 200, { comment: deleteComment(commentId) })
      return
    }
  }

  if (method === 'PUT' && pathname === '/api/tasks/bulk') {
    const session = requireSession(request)
    const body = await readJson(request)
    sendJson(response, 200, {
      tasks: bulkUpdateTasks(session.user.id, body.taskIds, body.changes),
    })
    return
  }

  const taskPersonalStateMatch = pathname.match(
    /^\/api\/tasks\/([^/]+)\/(favorite|recent)$/,
  )
  if (taskPersonalStateMatch) {
    const session = requireSession(request)
    const taskId = decodeURIComponent(taskPersonalStateMatch[1])
    const action = taskPersonalStateMatch[2]
    if (method === 'PUT' && action === 'favorite') {
      const body = await readJson(request)
      if (typeof body.isFavorite !== 'boolean') {
        throw new Error('INVALID_TASK_FAVORITE')
      }
      sendJson(response, 200, {
        state: setTaskFavorite(session.user.id, taskId, body.isFavorite),
      })
      return
    }
    if (method === 'POST' && action === 'recent') {
      sendJson(response, 200, {
        state: touchTaskRecent(session.user.id, taskId),
      })
      return
    }
  }

  const taskMatch = pathname.match(
    /^\/api\/tasks\/([^/]+)(?:\/(toggle-completed))?$/,
  )
  if (taskMatch) {
    requireSession(request)
    const taskId = decodeURIComponent(taskMatch[1])
    const action = taskMatch[2]

    if (method === 'GET' && !action) {
      sendJson(response, 200, { task: getTaskDetail(taskId) })
      return
    }

    if (method === 'PUT' && !action) {
      const body = await readJson(request)
      sendJson(response, 200, {
        task: updateTaskDetail(taskId, body),
      })
      return
    }

    if (method === 'POST' && action === 'toggle-completed') {
      sendJson(response, 200, { task: toggleTaskCompleted(taskId) })
      return
    }
  }

  if (method === 'GET' && pathname === '/api/admin/users') {
    requireAdmin(request)
    sendJson(response, 200, { users: getManagedUsers() })
    return
  }

  if (method === 'POST' && pathname === '/api/admin/users') {
    requireAdmin(request)
    const body = await readJson(request)
    sendJson(response, 201, { user: createManagedUser(body) })
    return
  }

  // Pending signup requests awaiting approval. Declared before the generic
  // /api/admin/users/:id matchers so "pending"/"approve"/"reject" are not
  // treated as a user id.
  if (method === 'GET' && pathname === '/api/admin/users/pending') {
    requireAdmin(request)
    sendJson(response, 200, { users: getPendingUsers() })
    return
  }

  const adminApproveMatch = pathname.match(
    /^\/api\/admin\/users\/([^/]+)\/approve$/,
  )
  if (method === 'POST' && adminApproveMatch) {
    requireAdmin(request)
    const userId = decodeURIComponent(adminApproveMatch[1])
    sendJson(response, 200, { user: approveUser(userId) })
    return
  }

  const adminRejectMatch = pathname.match(
    /^\/api\/admin\/users\/([^/]+)\/reject$/,
  )
  if (method === 'POST' && adminRejectMatch) {
    requireAdmin(request)
    const userId = decodeURIComponent(adminRejectMatch[1])
    sendJson(response, 200, { result: rejectUser(userId) })
    return
  }

  const adminUserMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)$/)
  const adminUserReferencesMatch = pathname.match(
    /^\/api\/admin\/users\/([^/]+)\/references$/,
  )
  if (method === 'GET' && adminUserReferencesMatch) {
    requireAdmin(request)
    const userId = decodeURIComponent(adminUserReferencesMatch[1])
    sendJson(response, 200, {
      references: getManagedUserReferences(userId),
    })
    return
  }
  if (method === 'PUT' && adminUserMatch) {
    const admin = requireAdmin(request)
    const body = await readJson(request)
    const userId = decodeURIComponent(adminUserMatch[1])
    sendJson(response, 200, {
      user: updateManagedUser(admin.user.id, userId, body),
    })
    return
  }

  if (method === 'DELETE' && adminUserMatch) {
    const admin = requireAdmin(request)
    const userId = decodeURIComponent(adminUserMatch[1])
    sendJson(response, 200, {
      result: deleteManagedUser(admin.user.id, userId),
    })
    return
  }

  sendJson(response, 404, { error: 'NOT_FOUND' })
}

initializeDb()
getDb().prepare(`DELETE FROM auth_sessions WHERE expires_at <= CURRENT_TIMESTAMP`).run()

if (!process.env.TODO_ADMIN_PASSWORD) {
  console.warn(
    '[Server] TODO_ADMIN_PASSWORD is not set. Change the initial admin password immediately.',
  )
}

let synchronizedMutationQueue = Promise.resolve()

async function executeRequest(request, response) {
  try {
    await handleRequest(request, response)
  } catch (error) {
    const code = error instanceof Error ? error.message : String(error)
    const statusCode = getErrorStatus(code)
    console.error(`[Server] ${request.method} ${request.url}:`, code)
    sendJson(response, statusCode, { error: code })
  }
}

const server = createServer((request, response) => {
  const requestUrl = new URL(
    request.url || '/',
    `http://${request.headers.host || 'localhost'}`,
  )
  const method = request.method || 'GET'
  const baseRevisionHeader = String(
    request.headers['x-base-revision'] || '',
  ).trim()
  const parsedBaseRevision = Number(baseRevisionHeader)
  response.syncContext = {
    method,
    pathname: requestUrl.pathname,
    clientId: String(request.headers['x-client-id'] || '').trim(),
    baseRevision:
      baseRevisionHeader && Number.isInteger(parsedBaseRevision)
        ? parsedBaseRevision
        : null,
    isMutation: isSynchronizedMutation(method, requestUrl.pathname),
    committed: false,
  }
  request.syncContext = response.syncContext

  if (response.syncContext.isMutation) {
    const scheduledRequest = synchronizedMutationQueue.then(() =>
      executeRequest(request, response),
    )
    synchronizedMutationQueue = scheduledRequest.catch((error) => {
      console.error('[Server] Mutation queue failed:', error)
    })
    return
  }

  void executeRequest(request, response)
})

server.listen(port, host, () => {
  console.log(`[투자기획팀 업무관리 공간 서버] API listening on http://${host}:${port}`)
  startUpdateDirectoryWatcher()
})

server.on('error', (error) => {
  console.error('[Server] Failed to start:', error)
  process.exitCode = 1
})

function shutdown() {
  clearTimeout(updateBroadcastTimer)
  updateDirectoryWatcher?.close()
  server.close(() => {
    getDb().close()
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
