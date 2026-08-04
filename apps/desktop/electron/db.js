import Database from 'better-sqlite3'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let dbInstance = null

function getDatabasePath() {
  return path.resolve(__dirname, '../../../server/database/todo_app.db')
}

export function getDb() {
  if (dbInstance) {
    return dbInstance
  }

  const dbPath = getDatabasePath()
  dbInstance = new Database(dbPath)

  dbInstance.pragma('journal_mode = WAL')
  dbInstance.pragma('foreign_keys = ON')

  return dbInstance
}

export function initializeDb() {
  const db = getDb()

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS nav_nodes (
      id TEXT PRIMARY KEY,
      parent_id TEXT NULL,
      node_type TEXT NOT NULL CHECK (node_type IN ('folder', 'task')),
      title TEXT NOT NULL,
      order_index INTEGER NOT NULL DEFAULT 0,
      is_expanded INTEGER NOT NULL DEFAULT 1 CHECK (is_expanded IN (0, 1)),
      owner_user_id TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME NULL
    );

    CREATE TABLE IF NOT EXISTS task_details (
      id TEXT PRIMARY KEY,
      nav_node_id TEXT NOT NULL UNIQUE,
      description TEXT NULL,
      due_date DATE NULL,
      alarm_at DATETIME NULL,
      assignee_user_id TEXT NULL,
      memo_content TEXT NOT NULL DEFAULT '',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  const userCount = db.prepare(`SELECT COUNT(*) AS count FROM users`).get()
  if (userCount.count === 0) {
    db.prepare(`
      INSERT INTO users (id, name, email)
      VALUES (?, ?, ?)
    `).run('user-jh', 'JH', 'jh@example.com')
  }

  const navCount = db.prepare(`SELECT COUNT(*) AS count FROM nav_nodes`).get()
  if (navCount.count === 0) {
    const insertNav = db.prepare(`
      INSERT INTO nav_nodes (
        id, parent_id, node_type, title, order_index, is_expanded, owner_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    insertNav.run('folder-root-1', null, 'folder', '최상위 폴더', 1, 1, 'user-jh')
    insertNav.run('folder-middle-1', 'folder-root-1', 'folder', '중간폴더 1', 1, 1, 'user-jh')
    insertNav.run('folder-middle-2', 'folder-middle-1', 'folder', '중간폴더 2', 1, 1, 'user-jh')
    insertNav.run('task-1', 'folder-middle-2', 'task', '명명식 준비 체크리스트', 1, 1, 'user-jh')
    insertNav.run('task-2', 'folder-middle-2', 'task', '참석자 준비 체크리스트', 2, 1, 'user-jh')
  }

  const taskCount = db.prepare(`SELECT COUNT(*) AS count FROM task_details`).get()
  if (taskCount.count === 0) {
    const insertTaskDetail = db.prepare(`
      INSERT INTO task_details (
        id, nav_node_id, description, due_date, alarm_at, assignee_user_id, memo_content
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    insertTaskDetail.run(
      'task-detail-1',
      'task-1',
      '명명식 준비를 위한 전체 작업 및 진행상황 관리',
      '2026-08-10',
      '2026-08-09 09:00:00',
      'user-jh',
      '조선소 일정 확인 후 내부 행사 일정과 맞추기. 대모 참석 여부와 이동 일정도 함께 정리 필요.',
    )

    insertTaskDetail.run(
      'task-detail-2',
      'task-2',
      '참석자 확정, 안내 및 이동 준비를 위한 관리 화면',
      '2026-08-15',
      '2026-08-13 14:00:00',
      'user-jh',
      '참석자 확정 이후 이동 계획과 숙박 여부를 함께 정리해야 함. VIP 참석 여부는 별도 확인 필요.',
    )
  }

  return db
}

export function getNavigationTree() {
  const db = getDb()

  const rows = db.prepare(`
    SELECT
      id,
      parent_id AS parentId,
      node_type AS type,
      title,
      is_expanded AS expanded,
      order_index AS "order"
    FROM nav_nodes
    WHERE deleted_at IS NULL
    ORDER BY parent_id, order_index
  `).all()

  console.log('[DB] nav_nodes count:', rows.length)
  console.log('[DB] nav_nodes rows:', rows)

  return rows.map((row) => ({
    ...row,
    expanded: Boolean(row.expanded),
  }))
}


export function createFolder(title, parentId = null) {
  const db = getDb()
  const id = `folder-${Date.now()}`

  const sibling = db.prepare(`
    SELECT COALESCE(MAX(order_index), 0) AS maxOrder
    FROM nav_nodes
    WHERE
      (
        (parent_id IS NULL AND ? IS NULL)
        OR parent_id = ?
      )
      AND deleted_at IS NULL
  `).get(parentId, parentId)

  const nextOrder = sibling.maxOrder + 1

  db.prepare(`
    INSERT INTO nav_nodes (
      id, parent_id, node_type, title, order_index, is_expanded, owner_user_id
    ) VALUES (?, ?, 'folder', ?, ?, 1, ?)
  `).run(id, parentId, title, nextOrder, 'user-jh')

  return { id }
}

export function createTask(title, parentId = null) {
  const db = getDb()
  const nodeId = `task-${Date.now()}`
  const detailId = `task-detail-${Date.now()}`

  const sibling = db.prepare(`
    SELECT COALESCE(MAX(order_index), 0) AS maxOrder
    FROM nav_nodes
    WHERE
      (
        (parent_id IS NULL AND ? IS NULL)
        OR parent_id = ?
      )
      AND deleted_at IS NULL
  `).get(parentId, parentId)

  const nextOrder = sibling.maxOrder + 1

  db.prepare(`
    INSERT INTO nav_nodes (
      id, parent_id, node_type, title, order_index, is_expanded, owner_user_id
    ) VALUES (?, ?, 'task', ?, ?, 1, ?)
  `).run(nodeId, parentId, title, nextOrder, 'user-jh')

  db.prepare(`
    INSERT INTO task_details (
      id, nav_node_id, description, due_date, alarm_at, assignee_user_id, memo_content
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    detailId,
    nodeId,
    '새로 생성된 Task입니다.',
    '2026-08-31',
    '2026-08-31 09:00:00',
    'user-jh',
    '',
  )

  return { id: nodeId }
}
