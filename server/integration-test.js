import { spawn } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const databasePath = path.join(root, '.tmp-integration.db')
const uploadsPath = path.join(root, '.tmp-integration-uploads')
const port = 4313
const cleanupTargets = [
  databasePath,
  `${databasePath}-shm`,
  `${databasePath}-wal`,
  uploadsPath,
]

function cleanup() {
  cleanupTargets.forEach((target) => {
    if (existsSync(target)) rmSync(target, { recursive: true, force: true })
  })
}

cleanup()

const child = spawn(process.execPath, [path.join(root, 'server', 'index.js')], {
  env: {
    ...process.env,
    TODO_DATABASE_PATH: databasePath,
    TODO_UPLOADS_PATH: uploadsPath,
    TODO_SERVER_PORT: String(port),
    TODO_SERVER_HOST: '127.0.0.1',
    TODO_ADMIN_PASSWORD: 'Integration1234!',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let serverOutput = ''
child.stdout.on('data', (chunk) => { serverOutput += chunk })
child.stderr.on('data', (chunk) => { serverOutput += chunk })
const baseUrl = `http://127.0.0.1:${port}`
const primaryClientId = 'integration-primary'
let primaryRevision = 0

function isSynchronizedMutation(method, pathname) {
  if (!['POST', 'PUT', 'DELETE'].includes(method)) return false
  if (pathname.startsWith('/api/auth/')) return false
  if (/^\/api\/reminders\/[^/]+\/(snooze|dismiss)$/.test(pathname)) {
    return false
  }
  return pathname.startsWith('/api/')
}

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Server did not start.\n${serverOutput}`)
}

async function request(pathname, options = {}) {
  const method = options.method || 'GET'
  const synchronizedMutation = isSynchronizedMutation(method, pathname)
  const response = await fetch(baseUrl + pathname, {
    method,
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(synchronizedMutation
        ? {
            'X-Client-ID': primaryClientId,
            'X-Base-Revision': String(primaryRevision),
          }
        : {}),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : options.rawBody,
  })
  const body = await response.json()
  if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(body)}`)
  const changeRevisionHeader = response.headers.get('x-change-revision')
  const changeRevision = Number(changeRevisionHeader)
  if (
    changeRevisionHeader !== null &&
    Number.isInteger(changeRevision) &&
    changeRevision >= 0
  ) {
    primaryRevision = changeRevision
  }
  return body
}

try {
  await waitForServer()
  const login = await request('/api/auth/login', {
    method: 'POST',
    body: { loginId: 'admin', password: 'Integration1234!' },
  })
  const token = login.token
  const parentFolder = (
    await request('/api/navigation/folders', {
      method: 'POST',
      token,
      body: { title: '자동 펼침 상위', parentId: null },
    })
  ).folder
  await request(
    `/api/navigation/nodes/${encodeURIComponent(parentFolder.id)}/expanded`,
    { method: 'PUT', token, body: { expanded: false } },
  )
  await request('/api/navigation/tasks', {
    method: 'POST',
    token,
    body: { title: '자동 펼침 하위 Task', parentId: parentFolder.id },
  })
  const expandedTree = (await request('/api/navigation', { token })).nodes
  if (!expandedTree.find((node) => node.id === parentFolder.id)?.expanded) {
    throw new Error('New child creation did not expand its navigation path')
  }

  const created = await request('/api/navigation/tasks', {
    method: 'POST',
    token,
    body: { title: '배포 통합 검증 Task', parentId: null },
  })
  const taskId = created.task.id

  const clearedTask = (
    await request(`/api/tasks/${encodeURIComponent(taskId)}`, {
      method: 'PUT',
      token,
      body: {
        ...created.task.detail,
        title: '상세화면 이름 수정 확인',
        dueDate: '',
        alarm: '',
      },
    })
  ).task
  if (
    clearedTask.title !== '상세화면 이름 수정 확인' ||
    clearedTask.dueDate !== '' ||
    clearedTask.alarm !== ''
  ) {
    throw new Error('Task title or empty due date/reminder update failed')
  }

  await request(`/api/tasks/${encodeURIComponent(taskId)}/toggle-completed`, {
    method: 'POST', token,
  })
  let tree = (await request('/api/navigation', { token })).nodes
  if (!tree.find((node) => node.id === taskId)?.completed) {
    throw new Error('Navigation completion state was not synchronized')
  }
  await request(`/api/tasks/${encodeURIComponent(taskId)}/toggle-completed`, {
    method: 'POST', token,
  })

  const createdSubTasks = []
  for (const title of ['정렬 A', '정렬 B', '정렬 C']) {
    const result = await request(
      `/api/tasks/${encodeURIComponent(taskId)}/subtasks`,
      { method: 'POST', token, body: { title } },
    )
    createdSubTasks.push(result.subTask)
  }
  if (createdSubTasks.some((subTask) => subTask.assigneeId || subTask.assignee)) {
    throw new Error('New Sub Task should allow an unassigned state')
  }
  const dueDates = ['2026-09-02', '2026-09-01', '2026-09-01']
  for (let index = 0; index < createdSubTasks.length; index += 1) {
    await request(
      `/api/subtasks/${encodeURIComponent(createdSubTasks[index].id)}`,
      {
        method: 'PUT',
        token,
        body: { field: 'dueDate', value: dueDates[index] },
      },
    )
  }
  const sortedSubTasks = (
    await request(`/api/tasks/${encodeURIComponent(taskId)}/subtasks`, { token })
  ).subTasks
  if (sortedSubTasks.map((subTask) => subTask.title).join(',') !== '정렬 B,정렬 C,정렬 A') {
    throw new Error('Sub Task due-date and creation ordering failed')
  }
  const renamedSubTask = (
    await request(`/api/subtasks/${encodeURIComponent(createdSubTasks[0].id)}`, {
      method: 'PUT',
      token,
      body: { field: 'title', value: '이름 수정 확인' },
    })
  ).subTask
  if (renamedSubTask.title !== '이름 수정 확인') {
    throw new Error('Sub Task title update failed')
  }
  const unassignedSubTask = (
    await request(`/api/subtasks/${encodeURIComponent(createdSubTasks[0].id)}`, {
      method: 'PUT',
      token,
      body: { field: 'assignee', value: '' },
    })
  ).subTask
  if (unassignedSubTask.assigneeId || unassignedSubTask.assignee) {
    throw new Error('Sub Task assignee could not be cleared')
  }

  const savedMemo = (
    await request(`/api/tasks/${encodeURIComponent(taskId)}/memo`, {
      method: 'PUT',
      token,
      body: { memo: '작성자 저장 확인 메모' },
    })
  ).memo
  if (
    savedMemo.content !== '작성자 저장 확인 메모' ||
    savedMemo.author !== login.user.name ||
    !savedMemo.updatedAt
  ) {
    throw new Error('Memo author metadata was not saved')
  }

  const original = Buffer.from(
    'investment planning team workspace integration attachment',
    'utf8',
  )
  const upload = await request(`/api/tasks/${encodeURIComponent(taskId)}/attachments`, {
    method: 'POST',
    token,
    headers: {
      'Content-Type': 'text/plain',
      'X-File-Name': encodeURIComponent('검증.txt'),
    },
    rawBody: original,
  })
  const download = await fetch(
    `${baseUrl}/api/attachments/${encodeURIComponent(upload.attachment.id)}/content`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!download.ok || !Buffer.from(await download.arrayBuffer()).equals(original)) {
    throw new Error('Attachment upload/download validation failed')
  }

  const detail = (await request(`/api/tasks/${encodeURIComponent(taskId)}`, { token })).task
  const assignees = (await request('/api/users/assignees', { token })).users
  const jh = assignees.find((user) => user.name === 'JH')
  if (!jh) throw new Error('Secondary assignee fixture is missing')

  await request(`/api/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PUT',
    token,
    body: {
      ...detail,
      alarm: '2020-01-01 09:00:00',
      assigneeIds: [login.user.id, jh.id],
      manualAssigneeNames: [],
    },
  })
  const updatedDetail = (
    await request(`/api/tasks/${encodeURIComponent(taskId)}`, { token })
  ).task
  if (updatedDetail.assignees.length !== 2) {
    throw new Error('Multiple Task assignees were not saved')
  }

  const relatedUserDelete = await fetch(
    `${baseUrl}/api/admin/users/${encodeURIComponent(jh.id)}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Client-ID': primaryClientId,
        'X-Base-Revision': String(primaryRevision),
      },
    },
  )
  const relatedUserDeleteBody = await relatedUserDelete.json()
  if (
    relatedUserDelete.status !== 409 ||
    relatedUserDeleteBody.error !== 'USER_HAS_RELATED_DATA'
  ) {
    throw new Error('User deletion with related data was not blocked')
  }

  const disposableUser = (
    await request('/api/admin/users', {
      method: 'POST',
      token,
      body: {
        loginId: 'delete.test',
        name: 'Delete Test',
        email: 'delete.test@example.com',
        phone: '',
        password: 'Delete1234!',
        role: 'user',
      },
    })
  ).user
  await request(`/api/admin/users/${encodeURIComponent(disposableUser.id)}`, {
    method: 'DELETE',
    token,
  })
  const managedUsersAfterDelete = (
    await request('/api/admin/users', { token })
  ).users
  if (managedUsersAfterDelete.some((user) => user.id === disposableUser.id)) {
    throw new Error('Unused user deletion failed')
  }
  const legacyUpdate = (
    await request(`/api/tasks/${encodeURIComponent(taskId)}`, {
      method: 'PUT',
      token,
      body: { ...updatedDetail, dueDate: '2026-08-09' },
    })
  ).task
  if (legacyUpdate.assignees.length !== 2) {
    throw new Error('Legacy client update removed multiple assignees')
  }

  const jhLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { loginId: 'jh', password: 'User1234!' },
  })
  let due = (await request('/api/reminders/due?now=2026-08-08%2012%3A00%3A00', { token })).reminders
  if (due.length !== 1 || due[0].taskId !== taskId) {
    throw new Error('Assigned user reminder lookup failed')
  }
  let jhDue = (
    await request('/api/reminders/due?now=2026-08-08%2012%3A00%3A00', {
      token: jhLogin.token,
    })
  ).reminders
  if (jhDue.length !== 1 || jhDue[0].taskId !== taskId) {
    throw new Error('Multiple assignee reminder lookup failed')
  }
  await request(`/api/reminders/${encodeURIComponent(due[0].id)}/snooze`, {
    method: 'POST', token, body: { remindAt: '2099-01-01 09:00:00' },
  })
  due = (await request('/api/reminders/due?now=2026-08-08%2012%3A00%3A00', { token })).reminders
  if (due.length !== 0) throw new Error('Reminder snooze failed')
  jhDue = (
    await request('/api/reminders/due?now=2026-08-08%2012%3A00%3A00', {
      token: jhLogin.token,
    })
  ).reminders
  if (jhDue.length !== 1) {
    throw new Error('One assignee snoozing affected another assignee')
  }

  tree = (await request('/api/navigation', { token })).nodes
  if (!tree.some((node) => node.id === taskId)) throw new Error('Created Task is missing')

  const syncState = await request('/api/sync/state', { token })
  const syncController = new AbortController()
  const syncResponse = await fetch(`${baseUrl}/api/sync/events`, {
    headers: { Authorization: `Bearer ${token}`, 'X-Client-ID': 'client-b' },
    signal: syncController.signal,
  })
  if (!syncResponse.ok || !syncResponse.body) {
    throw new Error('SSE sync stream failed to connect')
  }
  const syncReader = syncResponse.body.getReader()
  const firstSyncChunk = Buffer.from((await syncReader.read()).value || []).toString('utf8')
  if (!firstSyncChunk.includes('"kind":"connected"')) {
    throw new Error('SSE sync stream did not send its initial state')
  }

  const synchronizedMutation = await fetch(`${baseUrl}/api/navigation/folders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Client-ID': 'client-a',
      'X-Base-Revision': String(syncState.revision),
    },
    body: JSON.stringify({ title: '실시간 동기화 검증', parentId: null }),
  })
  if (!synchronizedMutation.ok) {
    throw new Error('Synchronized mutation failed')
  }
  const changeRevision = Number(
    synchronizedMutation.headers.get('x-change-revision'),
  )
  if (changeRevision !== syncState.revision + 1) {
    throw new Error('Server sync revision did not advance')
  }
  primaryRevision = changeRevision
  const broadcastChunk = Buffer.from(
    (await syncReader.read()).value || [],
  ).toString('utf8')
  if (
    !broadcastChunk.includes('"sourceClientId":"client-a"') ||
    !broadcastChunk.includes(`"revision":${changeRevision}`)
  ) {
    throw new Error('SSE mutation event was not broadcast')
  }

  const staleMutation = await fetch(`${baseUrl}/api/navigation/folders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Client-ID': 'client-b',
      'X-Base-Revision': String(syncState.revision),
    },
    body: JSON.stringify({ title: '충돌 요청', parentId: null }),
  })
  const staleBody = await staleMutation.json()
  if (staleMutation.status !== 409 || staleBody.error !== 'SYNC_CONFLICT') {
    throw new Error('Stale client mutation was not rejected')
  }
  syncController.abort()

  const briefing = (await request('/api/briefing?days=7', { token })).briefing
  if (!Array.isArray(briefing.changes) || !Array.isArray(briefing.dueItems)) {
    throw new Error('To Do Briefing payload is invalid')
  }
  if (!briefing.changes.some((change) => change.title)) {
    throw new Error('To Do Briefing activity history is missing')
  }

  console.log('PASS server API, navigation auto-expand, empty dates/reminders, Task title editing, SSE sync, conflict prevention, Briefing, Sub Task editing/order/unassigned state, memo authorship, safe user deletion, attachment, multi-assignee, and reminder integration')
} finally {
  child.kill('SIGTERM')
  await new Promise((resolve) => child.once('exit', resolve))
  cleanup()
}
