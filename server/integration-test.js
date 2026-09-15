import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const databasePath = path.join(root, '.tmp-integration.db')
const uploadsPath = path.join(root, '.tmp-integration-uploads')
const updatesPath = path.join(root, '.tmp-integration-updates')
const port = 4313
const cleanupTargets = [
  databasePath,
  `${databasePath}-shm`,
  `${databasePath}-wal`,
  uploadsPath,
  updatesPath,
]

function cleanup() {
  cleanupTargets.forEach((target) => {
    if (existsSync(target)) rmSync(target, { recursive: true, force: true })
  })
}

cleanup()
mkdirSync(updatesPath, { recursive: true })
writeFileSync(
  path.join(updatesPath, 'latest.yml'),
  'version: 9.9.9\npath: test-update.exe\n',
  'utf8',
)
writeFileSync(path.join(updatesPath, 'test-update.exe'), '0123456789', 'utf8')

const child = spawn(process.execPath, [path.join(root, 'server', 'index.js')], {
  env: {
    ...process.env,
    TODO_DATABASE_PATH: databasePath,
    TODO_UPLOADS_PATH: uploadsPath,
    TODO_UPDATES_PATH: updatesPath,
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
  const updateMetadataResponse = await fetch(`${baseUrl}/updates/latest.yml`)
  if (
    !updateMetadataResponse.ok ||
    !(await updateMetadataResponse.text()).includes('version: 9.9.9') ||
    !String(updateMetadataResponse.headers.get('cache-control')).includes('no-cache')
  ) {
    throw new Error('Update metadata endpoint failed')
  }

  const updateRangeResponse = await fetch(
    `${baseUrl}/updates/test-update.exe`,
    { headers: { Range: 'bytes=2-5' } },
  )
  if (
    updateRangeResponse.status !== 206 ||
    (await updateRangeResponse.text()) !== '2345' ||
    updateRangeResponse.headers.get('content-range') !== 'bytes 2-5/10'
  ) {
    throw new Error('Update artifact range endpoint failed')
  }

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
  if (
    createdSubTasks.some(
      (subTask) =>
        subTask.assigneeId !== login.user.id ||
        subTask.assignee !== login.user.name,
    )
  ) {
    throw new Error('New Sub Task did not inherit the first Task assignee')
  }
  if (createdSubTasks.some((subTask) => subTask.dueDate)) {
    throw new Error('New Sub Task should allow an empty due date')
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
  const unchangedSubTasks = (
    await request(`/api/tasks/${encodeURIComponent(taskId)}/subtasks`, { token })
  ).subTasks
  if (unchangedSubTasks.map((subTask) => subTask.title).join(',') !== '정렬 A,정렬 B,정렬 C') {
    throw new Error('Sub Task order changed automatically after a due-date edit')
  }
  const reorderedSubTasks = (
    await request(`/api/tasks/${encodeURIComponent(taskId)}/subtasks/order`, {
      method: 'PUT',
      token,
      body: {
        orderedIds: [createdSubTasks[2].id, createdSubTasks[0].id, createdSubTasks[1].id],
      },
    })
  ).subTasks
  if (reorderedSubTasks.map((subTask) => subTask.title).join(',') !== '정렬 C,정렬 A,정렬 B') {
    throw new Error('Sub Task drag-and-drop ordering failed')
  }
  const persistedSubTaskOrder = (
    await request(`/api/tasks/${encodeURIComponent(taskId)}/subtasks`, { token })
  ).subTasks
  if (persistedSubTaskOrder.map((subTask) => subTask.title).join(',') !== '정렬 C,정렬 A,정렬 B') {
    throw new Error('Sub Task drag-and-drop order was not persisted')
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
  const noDueDateSubTask = (
    await request(`/api/subtasks/${encodeURIComponent(createdSubTasks[0].id)}`, {
      method: 'PUT',
      token,
      body: { field: 'dueDate', value: '' },
    })
  ).subTask
  if (noDueDateSubTask.dueDate) {
    throw new Error('Sub Task due date could not be cleared')
  }

  const taskWithoutAssignees = (
    await request(`/api/tasks/${encodeURIComponent(taskId)}`, {
      method: 'PUT',
      token,
      body: {
        ...(await request(`/api/tasks/${encodeURIComponent(taskId)}`, { token })).task,
        assigneeIds: [],
        manualAssigneeNames: [],
      },
    })
  ).task
  if (taskWithoutAssignees.assignee || taskWithoutAssignees.assignees.length > 0) {
    throw new Error('Task assignees could not be cleared')
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

  const createdMemo = (
    await request(`/api/tasks/${encodeURIComponent(taskId)}/memos`, {
      method: 'POST',
      token,
      body: { contentHtml: '<strong>두 번째 메모</strong>' },
    })
  ).memo
  const thirdMemo = (
    await request(`/api/tasks/${encodeURIComponent(taskId)}/memos`, {
      method: 'POST',
      token,
      body: { contentHtml: '<span style="color:#c2410c">세 번째 메모</span>' },
    })
  ).memo
  const allMemos = (
    await request(`/api/tasks/${encodeURIComponent(taskId)}/memos`, { token })
  ).memos
  if (
    allMemos.length !== 3 ||
    !allMemos.some((memo) => memo.contentHtml.includes('<strong>'))
  ) {
    throw new Error('Multiple memo creation or rich-text content failed')
  }
  const updatedMemo = (
    await request(`/api/memos/${encodeURIComponent(createdMemo.id)}`, {
      method: 'PUT',
      token,
      body: { contentHtml: '<strong>수정된 메모</strong>' },
    })
  ).memo
  if (!updatedMemo.contentHtml.includes('수정된 메모')) {
    throw new Error('Rich memo update failed')
  }
  await request(`/api/memos/${encodeURIComponent(thirdMemo.id)}`, {
    method: 'DELETE', token,
  })
  const remainingMemos = (
    await request(`/api/tasks/${encodeURIComponent(taskId)}/memos`, { token })
  ).memos
  if (remainingMemos.length !== 2) {
    throw new Error('Memo deletion failed')
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
  const inheritedSubTask = (
    await request(`/api/tasks/${encodeURIComponent(taskId)}/subtasks`, {
      method: 'POST', token, body: { title: '복수 담당자 상속 확인' },
    })
  ).subTask
  if (inheritedSubTask.assignees.length !== 2 || inheritedSubTask.dueDate) {
    throw new Error('New Sub Task did not inherit every Task assignee with an empty due date')
  }
  const multiAssigneeSubTask = (
    await request(`/api/subtasks/${encodeURIComponent(createdSubTasks[0].id)}`, {
      method: 'PUT',
      token,
      body: { field: 'assignees', value: [login.user.id, jh.id] },
    })
  ).subTask
  if (
    multiAssigneeSubTask.assignees.length !== 2 ||
    !multiAssigneeSubTask.assignee.includes(login.user.name) ||
    !multiAssigneeSubTask.assignee.includes(jh.name)
  ) {
    throw new Error('Multiple Sub Task assignees were not saved')
  }
  const clearedSubTaskAssignees = (
    await request(`/api/subtasks/${encodeURIComponent(createdSubTasks[0].id)}`, {
      method: 'PUT',
      token,
      body: { field: 'assignees', value: [] },
    })
  ).subTask
  if (clearedSubTaskAssignees.assignees.length || clearedSubTaskAssignees.assignee) {
    throw new Error('Sub Task assignees could not be cleared when the Task has assignees')
  }

  const userReferences = (
    await request(`/api/admin/users/${encodeURIComponent(jh.id)}/references`, { token })
  ).references
  if (!userReferences.hasRelatedData || !userReferences.tasks.some((task) => task.taskId === taskId)) {
    throw new Error('Admin user reference details are missing')
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

  // A user whose only remaining references live on a TRASHED task must still be
  // deletable: the preview reports no blocking data (hasRelatedData=false) but
  // flags the trashed references, and the delete cleans them up without hitting
  // a foreign-key violation.
  const trashedRefUser = (
    await request('/api/admin/users', {
      method: 'POST',
      token,
      body: {
        loginId: 'trash.ref',
        name: 'Trash Ref',
        email: 'trash.ref@example.com',
        phone: '',
        password: 'Trash1234!',
        role: 'user',
      },
    })
  ).user
  const trashedRefLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { loginId: 'trash.ref', password: 'Trash1234!' },
  })
  const trashTask = (
    await request('/api/navigation/tasks', {
      method: 'POST',
      token,
      body: { title: '휴지통 이동 예정 Task', parentId: null },
    })
  ).task
  // The user authors a comment on the task, creating a NO-ACTION FK reference.
  await request(`/api/tasks/${encodeURIComponent(trashTask.id)}/comments`, {
    method: 'POST',
    token: trashedRefLogin.token,
    body: { parentId: null, content: '휴지통 참조 확인용 댓글' },
  })
  // Move the task to the trash (soft delete).
  await request(`/api/navigation/nodes/${encodeURIComponent(trashTask.id)}`, {
    method: 'DELETE',
    token,
  })

  const trashedRefReferences = (
    await request(`/api/admin/users/${encodeURIComponent(trashedRefUser.id)}/references`, { token })
  ).references
  if (trashedRefReferences.hasRelatedData) {
    throw new Error('Trashed-only references should not block deletion')
  }
  if (!(trashedRefReferences.trashedReferenceCount > 0)) {
    throw new Error('Trashed reference count was not reported')
  }

  await request(`/api/admin/users/${encodeURIComponent(trashedRefUser.id)}`, {
    method: 'DELETE',
    token,
  })
  const managedUsersAfterTrashedDelete = (
    await request('/api/admin/users', { token })
  ).users
  if (managedUsersAfterTrashedDelete.some((user) => user.id === trashedRefUser.id)) {
    throw new Error('User with trashed-only references could not be deleted')
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

  writeFileSync(
    path.join(updatesPath, 'beta.yml'),
    'version: 9.9.10\npath: test-update.exe\n',
    'utf8',
  )
  let updatePushChunk = ''
  const updatePushDeadline = Date.now() + 4000
  while (!updatePushChunk.includes('"kind":"app-update"')) {
    const remaining = updatePushDeadline - Date.now()
    if (remaining <= 0) throw new Error('Update Push event timed out')
    const readResult = await Promise.race([
      syncReader.read(),
      new Promise((_, reject) => setTimeout(
        () => reject(new Error('Update Push event timed out')),
        remaining,
      )),
    ])
    updatePushChunk += Buffer.from(readResult.value || []).toString('utf8')
  }
  if (!updatePushChunk.includes('"version":"9.9.10"')) {
    throw new Error('Update Push event did not include the published version')
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
  if (
    briefing.changes.some((change) => typeof change.isMine !== 'boolean') ||
    briefing.dueItems.some((item) => typeof item.isMine !== 'boolean')
  ) {
    throw new Error('To Do Briefing personal scope marker is missing')
  }

  console.log('PASS server API, Push update announcement, automatic update files/ranges, navigation auto-expand, empty dates/reminders, Task title editing, SSE sync, conflict prevention, Briefing, Sub Task editing/order/unassigned state, memo authorship, safe user deletion, attachment, multi-assignee, and reminder integration')
} finally {
  child.kill('SIGTERM')
  await new Promise((resolve) => child.once('exit', resolve))
  cleanup()
}
