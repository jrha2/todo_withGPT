import Database from 'better-sqlite3'
import {
  randomBytes,
  randomUUID,
  pbkdf2Sync,
  timingSafeEqual,
} from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let dbInstance = null

const DEFAULT_ADMIN_LOGIN_ID = process.env.TODO_ADMIN_LOGIN_ID || 'admin'
const DEFAULT_ADMIN_PASSWORD = process.env.TODO_ADMIN_PASSWORD || 'Admin1234!'
const PASSWORD_ITERATIONS = 210000

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function hashPassword(password) {
  const normalized = String(password ?? '')

  if (normalized.length < 8) {
    throw new Error('Password must be at least 8 characters')
  }

  const salt = randomBytes(16).toString('hex')
  const hash = pbkdf2Sync(
    normalized,
    salt,
    PASSWORD_ITERATIONS,
    64,
    'sha512',
  ).toString('hex')
  return `pbkdf2:${PASSWORD_ITERATIONS}:${salt}:${hash}`
}

function verifyPassword(password, storedHash) {
  const [algorithm, iterationText, salt, expectedHex] = String(
    storedHash ?? '',
  ).split(':')
  const iterations = Number(iterationText)

  if (
    algorithm !== 'pbkdf2' ||
    !Number.isInteger(iterations) ||
    iterations < 100000 ||
    !salt ||
    !expectedHex
  ) {
    return false
  }

  const expected = Buffer.from(expectedHex, 'hex')
  const actual = pbkdf2Sync(
    String(password ?? ''),
    salt,
    iterations,
    expected.length,
    'sha512',
  )
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

function toPublicUser(user) {
  if (!user) {
    return null
  }

  return {
    id: user.id,
    loginId: user.loginId,
    name: user.name,
    email: user.email,
    phone: user.phone ?? '',
    role: user.role,
    isActive: Boolean(user.isActive),
    status: user.status ?? 'active',
  }
}

function formatDateOnly(date) {
  const pad = (value) => String(value).padStart(2, '0')
  return (
    date.getFullYear() +
    '-' +
    pad(date.getMonth() + 1) +
    '-' +
    pad(date.getDate())
  )
}

function getDefaultTaskDates() {
  const dueDate = new Date()
  dueDate.setHours(0, 0, 0, 0)
  dueDate.setDate(dueDate.getDate() + 7)

  const alarmDate = new Date(dueDate)
  alarmDate.setDate(alarmDate.getDate() - 2)
  alarmDate.setHours(9, 0, 0, 0)

  return {
    dueDate: formatDateOnly(dueDate),
    alarmAt: formatDateOnly(alarmDate) + ' 09:00:00',
  }
}

function getDatabasePath() {
  if (process.env.TODO_DATABASE_PATH) {
    return path.resolve(process.env.TODO_DATABASE_PATH)
  }

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

function migrateCompositeAssigneeUsers(db) {
  const compositeUsers = db.prepare(`
    SELECT id, name
    FROM users
    WHERE login_id IS NULL AND name LIKE '%,%'
  `).all()

  if (compositeUsers.length === 0) return

  const findManagedUsers = db.prepare(`
    SELECT id, name, email
    FROM users
    WHERE
      login_id IS NOT NULL
      AND is_active = 1
      AND name = ? COLLATE NOCASE
  `)
  const taskLinks = db.prepare(`
    SELECT task_detail_id AS taskDetailId, order_index AS orderIndex
    FROM task_assignees
    WHERE user_id = ?
  `)
  const subTaskLinks = db.prepare(`
    SELECT sub_task_id AS subTaskId, order_index AS orderIndex
    FROM sub_task_assignees
    WHERE user_id = ?
  `)
  const deleteTaskLink = db.prepare(`
    DELETE FROM task_assignees
    WHERE task_detail_id = ? AND user_id = ?
  `)
  const deleteSubTaskLink = db.prepare(`
    DELETE FROM sub_task_assignees
    WHERE sub_task_id = ? AND user_id = ?
  `)
  const insertTaskLink = db.prepare(`
    INSERT OR IGNORE INTO task_assignees (
      task_detail_id, user_id, order_index
    ) VALUES (?, ?, ?)
  `)
  const insertSubTaskLink = db.prepare(`
    INSERT OR IGNORE INTO sub_task_assignees (
      sub_task_id, user_id, order_index
    ) VALUES (?, ?, ?)
  `)
  const hasRemainingReferences = db.prepare(`
    SELECT (
      EXISTS(SELECT 1 FROM nav_nodes WHERE owner_user_id = @userId)
      OR EXISTS(
        SELECT 1 FROM task_details
        WHERE assignee_user_id = @userId OR memo_author_user_id = @userId
      )
      OR EXISTS(SELECT 1 FROM task_assignees WHERE user_id = @userId)
      OR EXISTS(SELECT 1 FROM sub_tasks WHERE assignee_user_id = @userId)
      OR EXISTS(SELECT 1 FROM sub_task_assignees WHERE user_id = @userId)
      OR EXISTS(SELECT 1 FROM memos WHERE author_user_id = @userId)
      OR EXISTS(SELECT 1 FROM comments WHERE author_user_id = @userId)
      OR EXISTS(SELECT 1 FROM attachments WHERE uploaded_by_user_id = @userId)
      OR EXISTS(SELECT 1 FROM reminder_user_states WHERE user_id = @userId)
      OR EXISTS(SELECT 1 FROM auth_sessions WHERE user_id = @userId)
      OR EXISTS(SELECT 1 FROM activity_logs WHERE actor_user_id = @userId)
    ) AS referenced
  `)

  const migrate = db.transaction(() => {
    let migratedCount = 0

    compositeUsers.forEach((compositeUser) => {
      const names = Array.from(new Map(
        compositeUser.name
          .split(',')
          .map((name) => name.trim())
          .filter(Boolean)
          .map((name) => [name.toLocaleLowerCase(), name]),
      ).values())
      if (names.length < 2) return

      const managedUsers = []
      for (const name of names) {
        const matches = findManagedUsers.all(name)
        if (matches.length !== 1) return
        managedUsers.push(matches[0])
      }
      if (new Set(managedUsers.map((user) => user.id)).size < 2) return

      taskLinks.all(compositeUser.id).forEach((link) => {
        deleteTaskLink.run(link.taskDetailId, compositeUser.id)
        managedUsers.forEach((user, index) => {
          insertTaskLink.run(
            link.taskDetailId,
            user.id,
            link.orderIndex + index,
          )
        })
      })
      subTaskLinks.all(compositeUser.id).forEach((link) => {
        deleteSubTaskLink.run(link.subTaskId, compositeUser.id)
        managedUsers.forEach((user, index) => {
          insertSubTaskLink.run(
            link.subTaskId,
            user.id,
            link.orderIndex + index,
          )
        })
      })

      db.prepare(`
        UPDATE task_details
        SET assignee_user_id = ?
        WHERE assignee_user_id = ?
      `).run(managedUsers[0].id, compositeUser.id)
      db.prepare(`
        UPDATE sub_tasks
        SET assignee_user_id = ?
        WHERE assignee_user_id = ?
      `).run(managedUsers[0].id, compositeUser.id)

      const references = hasRemainingReferences.get({
        userId: compositeUser.id,
      })
      if (!references.referenced) {
        db.prepare(`DELETE FROM users WHERE id = ?`).run(compositeUser.id)
      }
      migratedCount += 1
    })

    return migratedCount
  })

  const migratedCount = migrate()
  if (migratedCount > 0) {
    console.info(
      `[DB] Migrated ${migratedCount} composite assignee user(s).`,
    )
  }
}

export function initializeDb() {
  const db = getDb()

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      login_id TEXT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL DEFAULT '',
      password_hash TEXT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending')),
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
      deleted_at DATETIME NULL,
      deleted_batch_id TEXT NULL,
      FOREIGN KEY (parent_id) REFERENCES nav_nodes(id) ON DELETE CASCADE,
      FOREIGN KEY (owner_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS task_details (
      id TEXT PRIMARY KEY,
      nav_node_id TEXT NOT NULL UNIQUE,
      description TEXT NULL,
      due_date DATE NULL,
      alarm_at DATETIME NULL,
      assignee_user_id TEXT NULL,
      memo_content TEXT NOT NULL DEFAULT '',
      memo_author_user_id TEXT NULL,
      memo_updated_at DATETIME NULL,
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
      priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
      workflow_status TEXT NOT NULL DEFAULT 'todo' CHECK (workflow_status IN ('todo', 'in_progress', 'blocked', 'done')),
      tags_json TEXT NOT NULL DEFAULT '[]',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (nav_node_id) REFERENCES nav_nodes(id) ON DELETE CASCADE,
      FOREIGN KEY (assignee_user_id) REFERENCES users(id),
      FOREIGN KEY (memo_author_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS task_assignees (
      task_detail_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      order_index INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (task_detail_id, user_id),
      FOREIGN KEY (task_detail_id) REFERENCES task_details(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sub_tasks (
      id TEXT PRIMARY KEY,
      task_detail_id TEXT NOT NULL,
      title TEXT NOT NULL,
      due_date DATE NULL,
      assignee_user_id TEXT NULL,
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
      order_index INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_detail_id) REFERENCES task_details(id) ON DELETE CASCADE,
      FOREIGN KEY (assignee_user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_sub_tasks_task_order
      ON sub_tasks(task_detail_id, order_index);

    CREATE TABLE IF NOT EXISTS sub_task_assignees (
      sub_task_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      order_index INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (sub_task_id, user_id),
      FOREIGN KEY (sub_task_id) REFERENCES sub_tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sub_task_assignees_user
      ON sub_task_assignees(user_id, sub_task_id);

    CREATE INDEX IF NOT EXISTS idx_task_assignees_user
      ON task_assignees(user_id, task_detail_id);

    CREATE TABLE IF NOT EXISTS memos (
      id TEXT PRIMARY KEY,
      task_detail_id TEXT NOT NULL,
      content_html TEXT NOT NULL DEFAULT '',
      author_user_id TEXT NOT NULL,
      order_index INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_detail_id) REFERENCES task_details(id) ON DELETE CASCADE,
      FOREIGN KEY (author_user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_memos_task_order
      ON memos(task_detail_id, order_index, created_at);

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      task_detail_id TEXT NOT NULL,
      parent_comment_id TEXT NULL,
      author_user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_detail_id) REFERENCES task_details(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_comment_id) REFERENCES comments(id) ON DELETE CASCADE,
      FOREIGN KEY (author_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      task_detail_id TEXT NOT NULL,
      original_name TEXT NOT NULL,
      stored_path TEXT NOT NULL,
      mime_type TEXT NULL,
      file_size INTEGER NULL,
      uploaded_by_user_id TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_detail_id) REFERENCES task_details(id) ON DELETE CASCADE,
      FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY,
      task_detail_id TEXT NOT NULL,
      remind_at DATETIME NOT NULL,
      notify_desktop INTEGER NOT NULL DEFAULT 1 CHECK (notify_desktop IN (0, 1)),
      notify_email INTEGER NOT NULL DEFAULT 0 CHECK (notify_email IN (0, 1)),
      notify_mobile INTEGER NOT NULL DEFAULT 0 CHECK (notify_mobile IN (0, 1)),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_detail_id) REFERENCES task_details(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reminder_user_states (
      reminder_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'dismissed')),
      snoozed_until DATETIME NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (reminder_id, user_id),
      FOREIGN KEY (reminder_id) REFERENCES reminders(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_task_state (
      user_id TEXT NOT NULL,
      nav_node_id TEXT NOT NULL,
      is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
      last_opened_at DATETIME NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, nav_node_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (nav_node_id) REFERENCES nav_nodes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sync_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      revision INTEGER NOT NULL DEFAULT 0,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      revision INTEGER NULL,
      actor_user_id TEXT NULL,
      actor_name TEXT NOT NULL DEFAULT '팀원',
      action_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NULL,
      task_id TEXT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS access_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NULL,
      login_id TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      event TEXT NOT NULL CHECK (event IN ('login', 'logout')),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS announcement_dismissals (
      announcement_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (announcement_id, user_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_announcement_dismissals_ann
      ON announcement_dismissals(announcement_id);

    CREATE INDEX IF NOT EXISTS idx_nav_nodes_parent_order
      ON nav_nodes(parent_id, order_index);

    CREATE INDEX IF NOT EXISTS idx_nav_nodes_owner_user
      ON nav_nodes(owner_user_id);

    CREATE INDEX IF NOT EXISTS idx_user_task_state_recent
      ON user_task_state(user_id, last_opened_at DESC);

    CREATE INDEX IF NOT EXISTS idx_user_task_state_favorite
      ON user_task_state(user_id, is_favorite, updated_at DESC);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_task_details_nav_node
      ON task_details(nav_node_id);

    CREATE INDEX IF NOT EXISTS idx_task_details_assignee
      ON task_details(assignee_user_id);

    CREATE INDEX IF NOT EXISTS idx_sub_tasks_assignee
      ON sub_tasks(assignee_user_id);

    CREATE INDEX IF NOT EXISTS idx_comments_task_parent_created
      ON comments(task_detail_id, parent_comment_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_comments_author
      ON comments(author_user_id);

    CREATE INDEX IF NOT EXISTS idx_attachments_task
      ON attachments(task_detail_id);

    CREATE INDEX IF NOT EXISTS idx_reminders_task
      ON reminders(task_detail_id);

    CREATE INDEX IF NOT EXISTS idx_reminders_remind_status
      ON reminders(remind_at, status);

    CREATE INDEX IF NOT EXISTS idx_reminder_user_states_user
      ON reminder_user_states(user_id, status, snoozed_until);

    CREATE INDEX IF NOT EXISTS idx_auth_sessions_user
      ON auth_sessions(user_id);

    CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires
      ON auth_sessions(expires_at);

    CREATE INDEX IF NOT EXISTS idx_activity_logs_created
      ON activity_logs(created_at DESC, id);

    CREATE INDEX IF NOT EXISTS idx_activity_logs_task
      ON activity_logs(task_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_access_logs_user_created
      ON access_logs(user_id, created_at DESC, id);

    CREATE INDEX IF NOT EXISTS idx_access_logs_created
      ON access_logs(created_at DESC, id);
  `)

  const userColumns = db.prepare(`PRAGMA table_info(users)`).all()
  const userColumnNames = new Set(userColumns.map((column) => column.name))
  const userMigrations = [
    ['login_id', `ALTER TABLE users ADD COLUMN login_id TEXT NULL`],
    ['phone', `ALTER TABLE users ADD COLUMN phone TEXT NOT NULL DEFAULT ''`],
    ['password_hash', `ALTER TABLE users ADD COLUMN password_hash TEXT NULL`],
    [
      'role',
      `ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user'))`,
    ],
    [
      'is_active',
      `ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))`,
    ],
    [
      'status',
      `ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending'))`,
    ],
  ]

  userMigrations.forEach(([columnName, sql]) => {
    if (!userColumnNames.has(columnName)) {
      db.exec(sql)
    }
  })

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_login_id
    ON users(login_id COLLATE NOCASE)
    WHERE login_id IS NOT NULL;
  `)

  db.prepare(`
    INSERT OR IGNORE INTO sync_state (id, revision)
    VALUES (1, 0)
  `).run()

  const taskDetailColumns = db.prepare(`PRAGMA table_info(task_details)`).all()
  const hasCompletedColumn = taskDetailColumns.some(
    (column) => column.name === 'completed',
  )

  if (!hasCompletedColumn) {
    db.exec(`
      ALTER TABLE task_details
      ADD COLUMN completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1));
    `)
  }

  const currentTaskDetailColumns = new Set(
    db.prepare(`PRAGMA table_info(task_details)`).all().map((column) => column.name),
  )
  if (!currentTaskDetailColumns.has('memo_author_user_id')) {
    db.exec(`ALTER TABLE task_details ADD COLUMN memo_author_user_id TEXT NULL`)
  }
  if (!currentTaskDetailColumns.has('memo_updated_at')) {
    db.exec(`ALTER TABLE task_details ADD COLUMN memo_updated_at DATETIME NULL`)
  }
  if (!currentTaskDetailColumns.has('priority')) {
    db.exec(`ALTER TABLE task_details ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent'))`)
  }
  if (!currentTaskDetailColumns.has('workflow_status')) {
    db.exec(`ALTER TABLE task_details ADD COLUMN workflow_status TEXT NOT NULL DEFAULT 'todo' CHECK (workflow_status IN ('todo', 'in_progress', 'blocked', 'done'))`)
  }
  if (!currentTaskDetailColumns.has('tags_json')) {
    db.exec(`ALTER TABLE task_details ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]'`)
  }
  db.exec(`
    UPDATE task_details
    SET workflow_status = 'done'
    WHERE completed = 1 AND workflow_status <> 'done';

    UPDATE task_details
    SET completed = 1
    WHERE workflow_status = 'done' AND completed <> 1;
  `)

  const navNodeColumns = new Set(
    db.prepare(`PRAGMA table_info(nav_nodes)`).all().map((column) => column.name),
  )
  if (!navNodeColumns.has('deleted_batch_id')) {
    db.exec(`ALTER TABLE nav_nodes ADD COLUMN deleted_batch_id TEXT NULL`)
  }
  const backfillLegacyTrash = db.transaction(() => {
    const roots = db.prepare(`
      SELECT node.id
      FROM nav_nodes AS node
      LEFT JOIN nav_nodes AS parent ON parent.id = node.parent_id
      WHERE node.deleted_at IS NOT NULL
        AND node.deleted_batch_id IS NULL
        AND (
          parent.id IS NULL
          OR parent.deleted_at IS NULL
          OR parent.deleted_batch_id IS NOT NULL
        )
      ORDER BY node.deleted_at, node.id
    `).all()
    const assignBatch = db.prepare(`
      WITH RECURSIVE subtree(id) AS (
        SELECT id FROM nav_nodes
        WHERE id = ? AND deleted_at IS NOT NULL AND deleted_batch_id IS NULL
        UNION ALL
        SELECT child.id
        FROM nav_nodes AS child
        JOIN subtree AS parent ON child.parent_id = parent.id
        WHERE child.deleted_at IS NOT NULL AND child.deleted_batch_id IS NULL
      )
      UPDATE nav_nodes
      SET deleted_batch_id = ?
      WHERE id IN (SELECT id FROM subtree)
    `)
    roots.forEach((root) => assignBatch.run(root.id, randomUUID()))
  })
  backfillLegacyTrash()
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_nav_nodes_deleted_batch
      ON nav_nodes(deleted_batch_id, deleted_at);
  `)

  const userCount = db.prepare(`SELECT COUNT(*) AS count FROM users`).get()
  if (userCount.count === 0) {
    db.prepare(`
      INSERT INTO users (
        id, login_id, name, email, phone, password_hash, role, is_active
      ) VALUES (?, ?, ?, ?, '', ?, 'user', 1)
    `).run('user-jh', 'jh', 'JH', 'jh@example.com', hashPassword('User1234!'))
  }

  const legacyUsers = [
    ['user-jh', 'jh', 'User1234!'],
    ['user-ps', 'ps', 'User1234!'],
  ]

  legacyUsers.forEach(([userId, loginId, password]) => {
    db.prepare(`
      UPDATE users
      SET
        login_id = COALESCE(login_id, ?),
        password_hash = CASE
          WHEN password_hash IS NULL OR password_hash LIKE 'scrypt:%' THEN ?
          ELSE password_hash
        END,
        role = COALESCE(role, 'user'),
        is_active = COALESCE(is_active, 1),
        phone = COALESCE(phone, '')
      WHERE id = ?
    `).run(loginId, hashPassword(password), userId)
  })

  const existingAdmin = db.prepare(`
    SELECT id, password_hash AS passwordHash
    FROM users
    WHERE login_id = ? COLLATE NOCASE OR id = 'user-admin'
    LIMIT 1
  `).get(DEFAULT_ADMIN_LOGIN_ID)

  if (!existingAdmin) {
    db.prepare(`
      INSERT INTO users (
        id, login_id, name, email, phone, password_hash, role, is_active
      ) VALUES ('user-admin', ?, 'Administrator', 'admin@todo.local', '', ?, 'admin', 1)
    `).run(DEFAULT_ADMIN_LOGIN_ID, hashPassword(DEFAULT_ADMIN_PASSWORD))
  } else {
    db.prepare(`
      UPDATE users
      SET
        role = 'admin',
        is_active = 1,
        password_hash = CASE
          WHEN password_hash IS NULL OR password_hash LIKE 'scrypt:%' THEN ?
          ELSE password_hash
        END
      WHERE id = ?
    `).run(hashPassword(DEFAULT_ADMIN_PASSWORD), existingAdmin.id)
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

  db.exec(`
    INSERT OR IGNORE INTO task_assignees (task_detail_id, user_id, order_index)
    SELECT id, assignee_user_id, 0
    FROM task_details
    WHERE assignee_user_id IS NOT NULL;
  `)

  db.exec(`
    INSERT OR IGNORE INTO sub_task_assignees (sub_task_id, user_id, order_index)
    SELECT id, assignee_user_id, 0
    FROM sub_tasks
    WHERE assignee_user_id IS NOT NULL;
  `)

  migrateCompositeAssigneeUsers(db)

  const legacyMemoRows = db.prepare(`
    SELECT
      task_detail.id AS taskDetailId,
      task_detail.memo_content AS content,
      COALESCE(
        task_detail.memo_author_user_id,
        nav_node.owner_user_id,
        'user-admin'
      ) AS authorUserId,
      COALESCE(task_detail.memo_updated_at, task_detail.updated_at) AS updatedAt
    FROM task_details AS task_detail
    JOIN nav_nodes AS nav_node ON nav_node.id = task_detail.nav_node_id
    WHERE
      task_detail.memo_content <> ''
      AND NOT EXISTS (
        SELECT 1 FROM memos AS memo
        WHERE memo.task_detail_id = task_detail.id
      )
  `).all()
  const insertLegacyMemo = db.prepare(`
    INSERT INTO memos (
      id, task_detail_id, content_html, author_user_id,
      order_index, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 1, ?, ?)
  `)
  legacyMemoRows.forEach((memo) => {
    const contentHtml = escapeHtml(memo.content).replace(/\r?\n/g, '<br>')
    insertLegacyMemo.run(
      `memo-${randomUUID()}`,
      memo.taskDetailId,
      contentHtml,
      memo.authorUserId,
      memo.updatedAt,
      memo.updatedAt,
    )
  })

  db.prepare(`SELECT id FROM task_details`).all().forEach((taskDetail) => {
    syncLegacyMemoForTask(db, taskDetail.id)
  })

  db.prepare(`
    INSERT INTO reminders (
      id, task_detail_id, remind_at, notify_desktop, notify_email,
      notify_mobile, status
    )
    SELECT
      'reminder-' || task_detail.id,
      task_detail.id,
      task_detail.alarm_at,
      1,
      0,
      0,
      'pending'
    FROM task_details AS task_detail
    WHERE
      task_detail.alarm_at IS NOT NULL
      AND task_detail.alarm_at <> ''
      AND NOT EXISTS (
        SELECT 1
        FROM reminders AS reminder
        WHERE reminder.task_detail_id = task_detail.id
      )
  `).run()

  return db
}

function getUserAccountRow(userId) {
  return getDb().prepare(`
    SELECT
      id,
      login_id AS loginId,
      name,
      email,
      phone,
      password_hash AS passwordHash,
      role,
      is_active AS isActive,
      status
    FROM users
    WHERE id = ?
  `).get(userId)
}

function validateAccountInput(input, requirePassword = false) {
  const loginId = String(input?.loginId ?? '').trim()
  const name = String(input?.name ?? '').trim()
  const email = String(input?.email ?? '').trim().toLowerCase()
  const phone = String(input?.phone ?? '').trim()
  const password = String(input?.password ?? '')
  const role = input?.role === 'admin' ? 'admin' : 'user'

  if (!/^[a-zA-Z0-9._-]{3,40}$/.test(loginId)) {
    throw new Error('Login ID must be 3-40 letters, numbers, dots, dashes, or underscores')
  }

  if (!name) {
    throw new Error('Assignee name is required')
  }

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error('A valid email is required')
  }

  if (requirePassword && password.length < 8) {
    throw new Error('Password must be at least 8 characters')
  }

  if (password && password.length < 8) {
    throw new Error('Password must be at least 8 characters')
  }

  return { loginId, name, email, phone, password, role }
}

export function authenticateUser(loginId, password) {
  const db = getDb()
  const normalizedLoginId = String(loginId ?? '').trim()
  const normalizedPassword = String(password ?? '').trim()
  const user = db.prepare(`
    SELECT
      id,
      login_id AS loginId,
      name,
      email,
      phone,
      password_hash AS passwordHash,
      role,
      is_active AS isActive
    FROM users
    WHERE login_id = ? COLLATE NOCASE
    LIMIT 1
  `).get(normalizedLoginId)

  if (
    !user ||
    !user.isActive ||
    !verifyPassword(normalizedPassword, user.passwordHash)
  ) {
    throw new Error('LOGIN_FAILED')
  }

  return toPublicUser(user)
}

export function getSessionUser(userId) {
  const user = getUserAccountRow(userId)
  return user?.isActive ? toPublicUser(user) : null
}

// Number of access-log rows kept per user; older rows for that user are pruned
// on each new insert so the table cannot grow without bound.
const ACCESS_LOG_KEEP_PER_USER = 100
// Cap for how many recent rows the admin access-log view returns.
const ACCESS_LOG_VIEW_LIMIT = 1000

// Record a login/logout access event and prune old rows so at most
// ACCESS_LOG_KEEP_PER_USER rows remain for that user. Best-effort: any failure
// is swallowed by the caller so access logging never blocks auth.
export function recordAccessLog({ userId, loginId, name, event }) {
  const db = getDb()
  const normalizedEvent = event === 'logout' ? 'logout' : 'login'
  const record = db.transaction(() => {
    db.prepare(`
      INSERT INTO access_logs (id, user_id, login_id, name, event)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      `access-${randomUUID()}`,
      userId ?? null,
      String(loginId ?? ''),
      String(name ?? ''),
      normalizedEvent,
    )

    if (userId) {
      // Keep only the newest ACCESS_LOG_KEEP_PER_USER rows for this user.
      db.prepare(`
        DELETE FROM access_logs
        WHERE user_id = ?
          AND id NOT IN (
            SELECT id FROM access_logs
            WHERE user_id = ?
            ORDER BY created_at DESC, id DESC
            LIMIT ?
          )
      `).run(userId, userId, ACCESS_LOG_KEEP_PER_USER)
    }
  })
  record()
}

// Recent access events (login/logout) for the admin access-log view, newest
// first. Includes the current login_id/name from the users table when the
// account still exists, falling back to the value stored at event time.
export function getAccessLogs(limit = ACCESS_LOG_VIEW_LIMIT) {
  const safeLimit = Math.min(
    Math.max(1, Number(limit) || ACCESS_LOG_VIEW_LIMIT),
    ACCESS_LOG_VIEW_LIMIT,
  )
  return getDb().prepare(`
    SELECT
      access_log.id AS id,
      access_log.user_id AS userId,
      COALESCE(user.login_id, access_log.login_id, '') AS loginId,
      COALESCE(user.name, access_log.name, '') AS name,
      access_log.event AS event,
      access_log.created_at AS createdAt
    FROM access_logs AS access_log
    LEFT JOIN users AS user ON user.id = access_log.user_id
    ORDER BY access_log.created_at DESC, access_log.id DESC
    LIMIT ?
  `).all(safeLimit)
}

// ---- Announcement dismissals (1.6.1) ----

// Record that a user dismissed an announcement ("다시 보지 않기").
// Upserts (INSERT OR IGNORE) so the same (announcement_id, user_id) pair is
// stored at most once.
export function recordAnnouncementDismissal(announcementId, userId) {
  getDb().prepare(`
    INSERT OR IGNORE INTO announcement_dismissals (announcement_id, user_id)
    VALUES (?, ?)
  `).run(String(announcementId), String(userId))
}

// Check whether every active user (status='active', login_id not null) has
// dismissed the given announcement.  Returns { dismissed: number, total: number,
// allDismissed: boolean }.
export function getAnnouncementDismissalStatus(announcementId) {
  const db = getDb()
  const total = db.prepare(`
    SELECT COUNT(*) AS count FROM users
    WHERE status = 'active' AND login_id IS NOT NULL
  `).get().count
  const dismissed = db.prepare(`
    SELECT COUNT(*) AS count FROM announcement_dismissals AS d
    INNER JOIN users AS u ON u.id = d.user_id
    WHERE d.announcement_id = ? AND u.status = 'active' AND u.login_id IS NOT NULL
  `).get(String(announcementId)).count
  return { dismissed, total, allDismissed: total > 0 && dismissed >= total }
}

export function getManagedUsers() {
  return getDb().prepare(`
    SELECT
      id,
      COALESCE(login_id, '') AS loginId,
      name,
      email,
      COALESCE(phone, '') AS phone,
      role,
      is_active AS isActive,
      status,
      created_at AS createdAt
    FROM users
    WHERE login_id IS NOT NULL AND status = 'active'
    ORDER BY
      CASE role WHEN 'admin' THEN 0 ELSE 1 END,
      name COLLATE NOCASE,
      created_at,
      id
  `).all().map(toPublicUser)
}

// Accounts awaiting admin approval (created via self-service signup).
export function getPendingUsers() {
  return getDb().prepare(`
    SELECT
      id,
      COALESCE(login_id, '') AS loginId,
      name,
      email,
      COALESCE(phone, '') AS phone,
      role,
      is_active AS isActive,
      status,
      created_at AS createdAt
    FROM users
    WHERE login_id IS NOT NULL AND status = 'pending'
    ORDER BY created_at, id
  `).all().map((row) => ({ ...toPublicUser(row), createdAt: row.createdAt }))
}

export function createManagedUser(input) {
  const db = getDb()
  const account = validateAccountInput(input, true)
  const userId = `user-${randomUUID()}`

  try {
    db.prepare(`
      INSERT INTO users (
        id, login_id, name, email, phone, password_hash, role, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      userId,
      account.loginId,
      account.name,
      account.email,
      account.phone,
      hashPassword(account.password),
      account.role,
    )
  } catch (error) {
    if (String(error?.message ?? '').includes('UNIQUE')) {
      throw new Error('LOGIN_ID_OR_EMAIL_EXISTS')
    }
    throw error
  }

  return toPublicUser(getUserAccountRow(userId))
}

// Self-service signup: creates a NON-admin account in the 'pending' state and
// inactive, so existing auth checks (authenticateUser/getSessionUser) block
// login until an admin approves it. Role is forced to 'user' regardless of input.
export function createSignupRequest(input) {
  const db = getDb()
  const account = validateAccountInput({ ...input, role: 'user' }, true)
  const userId = `user-${randomUUID()}`

  try {
    db.prepare(`
      INSERT INTO users (
        id, login_id, name, email, phone, password_hash, role, is_active, status
      ) VALUES (?, ?, ?, ?, ?, ?, 'user', 0, 'pending')
    `).run(
      userId,
      account.loginId,
      account.name,
      account.email,
      account.phone,
      hashPassword(account.password),
    )
  } catch (error) {
    if (String(error?.message ?? '').includes('UNIQUE')) {
      throw new Error('LOGIN_ID_OR_EMAIL_EXISTS')
    }
    throw error
  }

  return { id: userId, status: 'pending' }
}

// Admin approves a pending signup: activate it and move it to 'active'.
export function approveUser(userId) {
  const db = getDb()
  const user = getUserAccountRow(userId)
  if (!user) throw new Error('USER_NOT_FOUND')
  if (user.status !== 'pending') throw new Error('USER_NOT_PENDING')

  db.prepare(`
    UPDATE users
    SET is_active = 1, status = 'active', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(userId)

  return toPublicUser(getUserAccountRow(userId))
}

// Admin rejects a pending signup: remove the not-yet-approved account. Only
// pending accounts can be rejected this way (approved accounts use delete).
export function rejectUser(userId) {
  const db = getDb()
  const user = getUserAccountRow(userId)
  if (!user) throw new Error('USER_NOT_FOUND')
  if (user.status !== 'pending') throw new Error('USER_NOT_PENDING')

  db.prepare(`DELETE FROM users WHERE id = ?`).run(userId)
  return { id: userId }
}

// Self-service profile update for the logged-in user. Only name/email may
// change; loginId, role, isActive and status are intentionally left untouched.
export function updateOwnProfile(userId, input) {
  const db = getDb()
  const current = getUserAccountRow(userId)
  if (!current) throw new Error('USER_NOT_FOUND')

  const name = String(input?.name ?? '').trim()
  const email = String(input?.email ?? '').trim().toLowerCase()

  if (!name) {
    throw new Error('Assignee name is required')
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error('A valid email is required')
  }

  try {
    db.prepare(`
      UPDATE users
      SET name = ?, email = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name, email, userId)
  } catch (error) {
    if (String(error?.message ?? '').includes('UNIQUE')) {
      throw new Error('LOGIN_ID_OR_EMAIL_EXISTS')
    }
    throw error
  }

  return toPublicUser(getUserAccountRow(userId))
}

// Self-service password change: verifies the current password before applying
// the new one (min length enforced by hashPassword).
export function changeOwnPassword(userId, currentPassword, newPassword) {
  const db = getDb()
  const account = getUserAccountRow(userId)
  if (!account) throw new Error('USER_NOT_FOUND')

  if (!verifyPassword(String(currentPassword ?? ''), account.passwordHash)) {
    throw new Error('CURRENT_PASSWORD_INCORRECT')
  }

  const next = String(newPassword ?? '')
  if (next.length < 8) {
    throw new Error('Password must be at least 8 characters')
  }

  db.prepare(`
    UPDATE users
    SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(hashPassword(next), userId)

  return { id: userId }
}

export function updateManagedUser(actorUserId, userId, input) {
  const db = getDb()
  const current = getUserAccountRow(userId)

  if (!current) {
    throw new Error('USER_NOT_FOUND')
  }

  const account = validateAccountInput(input, false)
  const isActive = input?.isActive !== false

  if (actorUserId === userId && (!isActive || account.role !== 'admin')) {
    throw new Error('ADMIN_CANNOT_REMOVE_OWN_ACCESS')
  }

  if (current.role === 'admin' && (!isActive || account.role !== 'admin')) {
    const adminCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM users
      WHERE role = 'admin' AND is_active = 1
    `).get()

    if (adminCount.count <= 1) {
      throw new Error('LAST_ADMIN_REQUIRED')
    }
  }

  try {
    db.transaction(() => {
      db.prepare(`
        UPDATE users
        SET
          login_id = ?,
          name = ?,
          email = ?,
          phone = ?,
          role = ?,
          is_active = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        account.loginId,
        account.name,
        account.email,
        account.phone,
        account.role,
        isActive ? 1 : 0,
        userId,
      )

      if (account.password) {
        db.prepare(`
          UPDATE users
          SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(hashPassword(account.password), userId)
      }
    })()
  } catch (error) {
    if (String(error?.message ?? '').includes('UNIQUE')) {
      throw new Error('LOGIN_ID_OR_EMAIL_EXISTS')
    }
    throw error
  }

  return toPublicUser(getUserAccountRow(userId))
}

export function deleteManagedUser(actorUserId, userId) {
  const db = getDb()
  const user = getUserAccountRow(userId)

  if (!user) throw new Error('USER_NOT_FOUND')
  if (actorUserId === userId) throw new Error('ADMIN_CANNOT_DELETE_SELF')

  if (user.role === 'admin') {
    const adminCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM users
      WHERE role = 'admin' AND is_active = 1
    `).get()
    if (user.isActive && adminCount.count <= 1) {
      throw new Error('LAST_ADMIN_REQUIRED')
    }
  }

  // Active (non-trashed) references must be reassigned by the admin first; these
  // are exactly what the preview shows, so the disabled/enabled Delete button
  // matches the outcome.
  const references = getManagedUserReferences(userId)
  if (references.hasRelatedData) {
    throw new Error('USER_HAS_RELATED_DATA')
  }

  // References that live only on trashed tasks would still violate NO-ACTION
  // foreign keys on a hard DELETE. Reassign every such NO-ACTION reference to
  // the acting admin inside the delete transaction so the delete is atomic and
  // never fails with a raw foreign-key error. CASCADE/SET NULL references
  // (auth_sessions, task_assignees, sub_task_assignees, reminder_user_states,
  // user_task_state, activity_logs) are handled by the schema automatically.
  const runDelete = db.transaction(() => {
    // nav_nodes.owner_user_id is NOT NULL → reassign ownership.
    db.prepare(`UPDATE nav_nodes SET owner_user_id = ? WHERE owner_user_id = ?`)
      .run(actorUserId, userId)
    db.prepare(`UPDATE task_details SET assignee_user_id = ? WHERE assignee_user_id = ?`)
      .run(actorUserId, userId)
    db.prepare(`UPDATE task_details SET memo_author_user_id = ? WHERE memo_author_user_id = ?`)
      .run(actorUserId, userId)
    db.prepare(`UPDATE sub_tasks SET assignee_user_id = ? WHERE assignee_user_id = ?`)
      .run(actorUserId, userId)
    db.prepare(`UPDATE memos SET author_user_id = ? WHERE author_user_id = ?`)
      .run(actorUserId, userId)
    db.prepare(`UPDATE comments SET author_user_id = ? WHERE author_user_id = ?`)
      .run(actorUserId, userId)
    db.prepare(`UPDATE attachments SET uploaded_by_user_id = ? WHERE uploaded_by_user_id = ?`)
      .run(actorUserId, userId)

    db.prepare(`DELETE FROM users WHERE id = ?`).run(userId)
  })

  try {
    runDelete()
  } catch (error) {
    console.error('[DB] Failed to delete managed user:', error)
    throw new Error('USER_DELETE_FAILED')
  }

  return { id: userId }
}

// Build "폴더 > 폴더" path for a nav node using its ancestor chain (excluding
// the node itself). Returns '' for a root-level node.
function getNavNodePath(db, nodeId) {
  const rows = db.prepare(`
    WITH RECURSIVE ancestors(id, parent_id, title, depth) AS (
      SELECT id, parent_id, title, 0 FROM nav_nodes WHERE id = ?
      UNION ALL
      SELECT parent.id, parent.parent_id, parent.title, child.depth + 1
      FROM nav_nodes AS parent
      JOIN ancestors AS child ON child.parent_id = parent.id
    )
    SELECT title FROM ancestors WHERE depth > 0 ORDER BY depth DESC
  `).all(nodeId)
  return rows.map((row) => row.title).join(' > ')
}

// Count NO-ACTION user references that would violate a foreign key on a hard
// DELETE but which the *active* references preview does not surface (i.e. they
// live on trashed/soft-deleted tasks). Used only to inform the admin.
function countTrashedUserReferences(db, userId) {
  return db.prepare(`
    SELECT (
      (SELECT COUNT(*) FROM nav_nodes
        WHERE owner_user_id = @userId AND deleted_at IS NOT NULL)
      + (SELECT COUNT(*) FROM task_details AS detail
          JOIN nav_nodes AS nav_node ON nav_node.id = detail.nav_node_id
          WHERE (detail.assignee_user_id = @userId OR detail.memo_author_user_id = @userId)
            AND nav_node.deleted_at IS NOT NULL)
      + (SELECT COUNT(*) FROM sub_tasks AS sub_task
          JOIN task_details AS detail ON detail.id = sub_task.task_detail_id
          JOIN nav_nodes AS nav_node ON nav_node.id = detail.nav_node_id
          WHERE sub_task.assignee_user_id = @userId AND nav_node.deleted_at IS NOT NULL)
      + (SELECT COUNT(*) FROM comments AS comment
          JOIN task_details AS detail ON detail.id = comment.task_detail_id
          JOIN nav_nodes AS nav_node ON nav_node.id = detail.nav_node_id
          WHERE comment.author_user_id = @userId AND nav_node.deleted_at IS NOT NULL)
      + (SELECT COUNT(*) FROM memos AS memo
          JOIN task_details AS detail ON detail.id = memo.task_detail_id
          JOIN nav_nodes AS nav_node ON nav_node.id = detail.nav_node_id
          WHERE memo.author_user_id = @userId AND nav_node.deleted_at IS NOT NULL)
      + (SELECT COUNT(*) FROM attachments AS attachment
          JOIN task_details AS detail ON detail.id = attachment.task_detail_id
          JOIN nav_nodes AS nav_node ON nav_node.id = detail.nav_node_id
          WHERE attachment.uploaded_by_user_id = @userId AND nav_node.deleted_at IS NOT NULL)
    ) AS count
  `).get({ userId }).count
}

export function getManagedUserReferences(userId) {
  const db = getDb()
  const user = getUserAccountRow(userId)
  if (!user) throw new Error('USER_NOT_FOUND')

  // Only ACTIVE (non-trashed) references block deletion and are shown as items
  // the admin must reassign first. References that live solely on trashed tasks
  // are cleaned up automatically at delete time, so they are reported separately
  // (trashedReferenceCount) rather than blocking.
  const taskRows = db.prepare(`
    SELECT DISTINCT taskId, taskTitle, relation FROM (
      SELECT nav_node.id AS taskId, nav_node.title AS taskTitle, '업무 작성자' AS relation
      FROM nav_nodes AS nav_node
      WHERE nav_node.owner_user_id = ? AND nav_node.node_type = 'task'
        AND nav_node.deleted_at IS NULL

      UNION ALL

      SELECT nav_node.id, nav_node.title, 'Task 담당자'
      FROM task_assignees AS link
      JOIN task_details AS detail ON detail.id = link.task_detail_id
      JOIN nav_nodes AS nav_node ON nav_node.id = detail.nav_node_id
      WHERE link.user_id = ? AND nav_node.deleted_at IS NULL

      UNION ALL

      SELECT nav_node.id, nav_node.title, 'Sub Task 담당자'
      FROM sub_task_assignees AS link
      JOIN sub_tasks AS sub_task ON sub_task.id = link.sub_task_id
      JOIN task_details AS detail ON detail.id = sub_task.task_detail_id
      JOIN nav_nodes AS nav_node ON nav_node.id = detail.nav_node_id
      WHERE link.user_id = ? AND nav_node.deleted_at IS NULL

      UNION ALL

      SELECT nav_node.id, nav_node.title, '댓글 작성자'
      FROM comments AS comment
      JOIN task_details AS detail ON detail.id = comment.task_detail_id
      JOIN nav_nodes AS nav_node ON nav_node.id = detail.nav_node_id
      WHERE comment.author_user_id = ? AND nav_node.deleted_at IS NULL

      UNION ALL

      SELECT nav_node.id, nav_node.title, '메모 작성자'
      FROM memos AS memo
      JOIN task_details AS detail ON detail.id = memo.task_detail_id
      JOIN nav_nodes AS nav_node ON nav_node.id = detail.nav_node_id
      WHERE memo.author_user_id = ? AND nav_node.deleted_at IS NULL

      UNION ALL

      SELECT nav_node.id, nav_node.title, '첨부파일 등록자'
      FROM attachments AS attachment
      JOIN task_details AS detail ON detail.id = attachment.task_detail_id
      JOIN nav_nodes AS nav_node ON nav_node.id = detail.nav_node_id
      WHERE attachment.uploaded_by_user_id = ? AND nav_node.deleted_at IS NULL
    )
    ORDER BY taskTitle COLLATE NOCASE, relation
  `).all(userId, userId, userId, userId, userId, userId)

  const taskMap = new Map()
  taskRows.forEach((row) => {
    const item = taskMap.get(row.taskId) || {
      taskId: row.taskId,
      title: row.taskTitle,
      path: getNavNodePath(db, row.taskId),
      relations: [],
    }
    if (!item.relations.includes(row.relation)) item.relations.push(row.relation)
    taskMap.set(row.taskId, item)
  })

  const folders = db.prepare(`
    SELECT id, title
    FROM nav_nodes
    WHERE owner_user_id = ? AND node_type = 'folder' AND deleted_at IS NULL
    ORDER BY title COLLATE NOCASE
  `).all(userId).map((folder) => ({
    ...folder,
    path: getNavNodePath(db, folder.id),
  }))

  const activityCount = db.prepare(`
    SELECT COUNT(*) AS count FROM activity_logs WHERE actor_user_id = ?
  `).get(userId).count

  const trashedReferenceCount = countTrashedUserReferences(db, userId)

  // hasRelatedData reflects only what actually blocks deletion: active tasks or
  // owned active folders that must be reassigned first. Activity logs (SET NULL
  // on delete) and trashed-only references (cleaned up on delete) do NOT block.
  return {
    user: toPublicUser(user),
    tasks: Array.from(taskMap.values()),
    folders,
    activityCount,
    trashedReferenceCount,
    hasRelatedData: taskMap.size > 0 || folders.length > 0,
  }
}

function escapeLikePattern(value) {
  return value.replace(/[\\%_]/g, '\\$&')
}

const TASK_PRIORITIES = new Set(['low', 'normal', 'high', 'urgent'])
const WORKFLOW_STATUSES = new Set(['todo', 'in_progress', 'blocked', 'done'])

function normalizeTags(value) {
  const source = Array.isArray(value) ? value : []
  return Array.from(new Set(
    source.map((tag) => String(tag ?? '').trim()).filter(Boolean),
  ))
}

function parseTagsJson(value) {
  try {
    return normalizeTags(JSON.parse(String(value || '[]')))
  } catch {
    return []
  }
}

function createSearchSnippet(value, query) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  const normalizedQuery = String(query ?? '').toLocaleLowerCase()
  const matchIndex = text.toLocaleLowerCase().indexOf(normalizedQuery)
  if (!text || !normalizedQuery || matchIndex < 0) {
    return { snippet: text.slice(0, 180), highlights: [] }
  }
  const start = Math.max(0, matchIndex - 60)
  const end = Math.min(text.length, matchIndex + query.length + 100)
  const snippet = text.slice(start, end)
  return {
    snippet,
    highlights: [{
      start: Math.max(0, matchIndex - start),
      end: Math.min(
        snippet.length,
        Math.max(0, matchIndex - start) + String(query).length,
      ),
    }],
  }
}

export function getNavigationTree(options = {}) {
  const db = getDb()
  const query = String(options.query ?? '').trim().slice(0, 120)
  const assignedUserId = String(options.assignedUserId ?? '').trim()

  const rows = db.prepare(`
    SELECT
      nav_node.id,
      nav_node.parent_id AS parentId,
      nav_node.node_type AS type,
      nav_node.title,
      nav_node.is_expanded AS expanded,
      nav_node.order_index AS "order",
      COALESCE(task_detail.completed, 0) AS completed
    FROM nav_nodes AS nav_node
    LEFT JOIN task_details AS task_detail
      ON task_detail.nav_node_id = nav_node.id
    WHERE nav_node.deleted_at IS NULL
    ORDER BY nav_node.parent_id, nav_node.order_index
  `).all()

  const normalizedRows = rows.map((row) => ({
    ...row,
    expanded: Boolean(row.expanded),
    completed: Boolean(row.completed),
    searchHits: [],
  }))
  if (!query && !assignedUserId) return normalizedRows

  const nodeMap = new Map(normalizedRows.map((node) => [node.id, node]))
  const allTaskIds = normalizedRows
    .filter((node) => node.type === 'task')
    .map((node) => node.id)
  const taskIdsInScope = assignedUserId
    ? new Set(db.prepare(`
        SELECT task_detail.nav_node_id AS taskId
        FROM task_assignees AS task_assignee
        JOIN task_details AS task_detail
          ON task_detail.id = task_assignee.task_detail_id
        JOIN nav_nodes AS nav_node
          ON nav_node.id = task_detail.nav_node_id
        WHERE
          task_assignee.user_id = ?
          AND nav_node.deleted_at IS NULL
      `).all(assignedUserId).map((row) => row.taskId))
    : new Set(allTaskIds)
  const includedNodeIds = new Set()
  const matchKindsByNode = new Map()
  const searchHitsByNode = new Map()

  const includeWithAncestors = (nodeId) => {
    const visited = new Set()
    let current = nodeMap.get(nodeId)
    while (current && !visited.has(current.id)) {
      includedNodeIds.add(current.id)
      visited.add(current.id)
      current = current.parentId ? nodeMap.get(current.parentId) : null
    }
  }
  const addMatchKind = (nodeId, kind) => {
    const kinds = matchKindsByNode.get(nodeId) ?? new Set()
    kinds.add(kind)
    matchKindsByNode.set(nodeId, kinds)
  }
  const addSearchHit = (nodeId, entityType, entityId, kind, value) => {
    const { snippet, highlights } = createSearchSnippet(value, query)
    if (highlights.length === 0) return
    const hits = searchHitsByNode.get(nodeId) ?? []
    const resultId = [nodeId, entityType, entityId, kind].join(':')
    if (!hits.some((hit) => hit.resultId === resultId)) {
      hits.push({
        resultId,
        taskId: entityType === 'folder' ? null : nodeId,
        entityType,
        entityId,
        matchKind: kind,
        snippet,
        highlights,
      })
      searchHitsByNode.set(nodeId, hits)
    }
    addMatchKind(nodeId, kind)
  }

  if (!query) {
    taskIdsInScope.forEach(includeWithAncestors)
  } else {
    const normalizedQuery = query.toLocaleLowerCase()
    const pattern = `%${escapeLikePattern(query)}%`
    const contentMatches = db.prepare(`
      SELECT
        task_detail.nav_node_id AS taskId,
        'description' AS entityType,
        task_detail.id AS entityId,
        'Task 설명' AS kind,
        COALESCE(task_detail.description, '') AS value
      FROM task_details AS task_detail
      JOIN nav_nodes AS nav_node ON nav_node.id = task_detail.nav_node_id
      WHERE nav_node.deleted_at IS NULL
        AND COALESCE(task_detail.description, '') LIKE ? ESCAPE '\\' COLLATE NOCASE

      UNION ALL

      SELECT task_detail.nav_node_id, 'subtask', sub_task.id, 'Sub Task', sub_task.title
      FROM sub_tasks AS sub_task
      JOIN task_details AS task_detail ON task_detail.id = sub_task.task_detail_id
      JOIN nav_nodes AS nav_node ON nav_node.id = task_detail.nav_node_id
      WHERE nav_node.deleted_at IS NULL
        AND sub_task.title LIKE ? ESCAPE '\\' COLLATE NOCASE

      UNION ALL

      SELECT task_detail.nav_node_id, 'comment', comment.id, '댓글', comment.content
      FROM comments AS comment
      JOIN task_details AS task_detail ON task_detail.id = comment.task_detail_id
      JOIN nav_nodes AS nav_node ON nav_node.id = task_detail.nav_node_id
      WHERE nav_node.deleted_at IS NULL
        AND comment.is_deleted = 0
        AND comment.content LIKE ? ESCAPE '\\' COLLATE NOCASE

      UNION ALL

      SELECT task_detail.nav_node_id, 'attachment', attachment.id, '첨부파일', attachment.original_name
      FROM attachments AS attachment
      JOIN task_details AS task_detail ON task_detail.id = attachment.task_detail_id
      JOIN nav_nodes AS nav_node ON nav_node.id = task_detail.nav_node_id
      WHERE nav_node.deleted_at IS NULL
        AND attachment.original_name LIKE ? ESCAPE '\\' COLLATE NOCASE

      UNION ALL

      SELECT task_detail.nav_node_id, 'assignee', user.id, '담당자', user.name
      FROM task_assignees AS task_assignee
      JOIN users AS user ON user.id = task_assignee.user_id
      JOIN task_details AS task_detail ON task_detail.id = task_assignee.task_detail_id
      JOIN nav_nodes AS nav_node ON nav_node.id = task_detail.nav_node_id
      WHERE nav_node.deleted_at IS NULL
        AND user.name LIKE ? ESCAPE '\\' COLLATE NOCASE
    `).all(pattern, pattern, pattern, pattern, pattern)
    db.prepare(`
      SELECT
        task_detail.nav_node_id AS taskId,
        memo.id AS entityId,
        memo.content_html AS contentHtml
      FROM memos AS memo
      JOIN task_details AS task_detail ON task_detail.id = memo.task_detail_id
      JOIN nav_nodes AS nav_node ON nav_node.id = task_detail.nav_node_id
      WHERE nav_node.deleted_at IS NULL
    `).all().forEach((memo) => {
      const value = memoHtmlToPlainText(memo.contentHtml)
      if (value.toLocaleLowerCase().includes(normalizedQuery)) {
        contentMatches.push({
          taskId: memo.taskId,
          entityType: 'memo',
          entityId: memo.entityId,
          kind: '메모',
          value,
        })
      }
    })
    db.prepare(`
      SELECT
        task_detail.nav_node_id AS taskId,
        task_detail.id AS entityId,
        task_detail.tags_json AS tagsJson
      FROM task_details AS task_detail
      JOIN nav_nodes AS nav_node ON nav_node.id = task_detail.nav_node_id
      WHERE nav_node.deleted_at IS NULL
    `).all().forEach((task) => {
      parseTagsJson(task.tagsJson).forEach((tag) => {
        if (tag.toLocaleLowerCase().includes(normalizedQuery)) {
          contentMatches.push({
            taskId: task.taskId,
            entityType: 'tags',
            entityId: task.entityId,
            kind: '태그',
            value: tag,
          })
        }
      })
    })

    normalizedRows.forEach((node) => {
      if (
        node.type === 'task'
        && taskIdsInScope.has(node.id)
        && node.title.toLocaleLowerCase().includes(normalizedQuery)
      ) {
        addSearchHit(node.id, 'task', node.id, 'Task 이름', node.title)
      }
    })
    contentMatches.forEach((match) => {
      if (taskIdsInScope.has(match.taskId)) {
        addSearchHit(
          match.taskId,
          match.entityType,
          match.entityId,
          match.kind,
          match.value,
        )
      }
    })

    const scopedTreeNodeIds = new Set()
    taskIdsInScope.forEach((taskId) => {
      const visited = new Set()
      let current = nodeMap.get(taskId)
      while (current && !visited.has(current.id)) {
        scopedTreeNodeIds.add(current.id)
        visited.add(current.id)
        current = current.parentId ? nodeMap.get(current.parentId) : null
      }
    })
    const matchingFolderIds = new Set(
      normalizedRows
        .filter((node) => (
          node.type === 'folder'
          && (!assignedUserId || scopedTreeNodeIds.has(node.id))
          && node.title.toLocaleLowerCase().includes(normalizedQuery)
        ))
        .map((node) => node.id),
    )

    matchingFolderIds.forEach((folderId) => {
      const folder = nodeMap.get(folderId)
      addSearchHit(folderId, 'folder', folderId, '폴더 이름', folder?.title ?? '')
      includeWithAncestors(folderId)
    })
    taskIdsInScope.forEach((taskId) => {
      const visited = new Set()
      let current = nodeMap.get(taskId)
      let isInsideMatchingFolder = false
      while (current && !visited.has(current.id)) {
        if (matchingFolderIds.has(current.id)) {
          isInsideMatchingFolder = true
          break
        }
        visited.add(current.id)
        current = current.parentId ? nodeMap.get(current.parentId) : null
      }
      if (isInsideMatchingFolder) {
        addMatchKind(taskId, '일치 폴더 내 Task')
        includeWithAncestors(taskId)
      }
    })
    matchKindsByNode.forEach((_kinds, nodeId) => includeWithAncestors(nodeId))
  }

  return normalizedRows
    .filter((node) => includedNodeIds.has(node.id))
    .map((node) => ({
      ...node,
      matchKinds: query
        ? Array.from(matchKindsByNode.get(node.id) ?? [])
        : [],
      searchHits: query ? (searchHitsByNode.get(node.id) ?? []) : [],
    }))
}


function expandNavigationAncestors(db, parentId) {
  if (!parentId) return

  db.prepare(`
    WITH RECURSIVE ancestors(id, parent_id) AS (
      SELECT id, parent_id FROM nav_nodes WHERE id = ?
      UNION ALL
      SELECT parent.id, parent.parent_id
      FROM nav_nodes AS parent
      JOIN ancestors AS child ON child.parent_id = parent.id
    )
    UPDATE nav_nodes
    SET is_expanded = 1, updated_at = CURRENT_TIMESTAMP
    WHERE id IN (SELECT id FROM ancestors) AND node_type = 'folder'
  `).run(parentId)
}

export function createFolder(title, parentId = null, creatorUserId = 'user-jh') {
  const db = getDb()
  const id = `folder-${randomUUID()}`

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
  `).run(id, parentId, title, nextOrder, creatorUserId)

  expandNavigationAncestors(db, parentId)

  return { id }
}

export function createTask(title, parentId = null, creatorUserId = 'user-jh') {
  const db = getDb()
  const nodeId = `task-${randomUUID()}`
  const detailId = `task-detail-${randomUUID()}`
  const defaults = getDefaultTaskDates()
  const creator = db.prepare(`
    SELECT id, name
    FROM users
    WHERE id = ? AND is_active = 1
  `).get(creatorUserId)

  if (!creator) {
    throw new Error('A local Task creator is required')
  }

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
  `).run(nodeId, parentId, title, nextOrder, creator.id)

  expandNavigationAncestors(db, parentId)

  db.prepare(`
    INSERT INTO task_details (
      id, nav_node_id, description, due_date, alarm_at, assignee_user_id, memo_content
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    detailId,
    nodeId,
    '새로 생성된 Task입니다.',
    defaults.dueDate,
    defaults.alarmAt,
    creator.id,
    '',
  )

  db.prepare(`
    INSERT INTO task_assignees (task_detail_id, user_id, order_index)
    VALUES (?, ?, 0)
  `).run(detailId, creator.id)

  db.prepare(`
    INSERT INTO reminders (
      id, task_detail_id, remind_at, notify_desktop, notify_email,
      notify_mobile, status
    ) VALUES (?, ?, ?, 1, 0, 0, 'pending')
  `).run(`reminder-${randomUUID()}`, detailId, defaults.alarmAt)

  return { id: nodeId, detail: getTaskDetail(nodeId) }
}

export function setNavigationNodeExpanded(nodeId, expanded) {
  const db = getDb()
  const result = db.prepare(`
    UPDATE nav_nodes
    SET is_expanded = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND node_type = 'folder' AND deleted_at IS NULL
  `).run(expanded ? 1 : 0, nodeId)

  if (result.changes === 0) {
    throw new Error(`Navigation folder not found: ${nodeId}`)
  }

  return { id: nodeId, expanded: Boolean(expanded) }
}

export function setAllNavigationExpanded(expanded) {
  const db = getDb()
  const result = db.prepare(`
    UPDATE nav_nodes
    SET is_expanded = ?, updated_at = CURRENT_TIMESTAMP
    WHERE node_type = 'folder' AND deleted_at IS NULL
  `).run(expanded ? 1 : 0)

  return { expanded: Boolean(expanded), updated: result.changes }
}

function getTaskAssigneesByDetailId(db, taskDetailId) {
  return db.prepare(`
    SELECT
      user.id,
      user.name,
      user.email
    FROM task_assignees AS task_assignee
    JOIN users AS user ON user.id = task_assignee.user_id
    WHERE task_assignee.task_detail_id = ?
    ORDER BY task_assignee.order_index, task_assignee.created_at, user.id
  `).all(taskDetailId)
}

function getAssigneeDisplay(assignees) {
  return assignees.map((assignee) => assignee.name).join(', ')
}

function findManagedAssigneeUser(db, identifier) {
  const value = String(identifier ?? '').trim()
  if (!value) {
    return null
  }

  return db.prepare(`
    SELECT id, name, email
    FROM users
    WHERE
      (id = ? OR name = ? COLLATE NOCASE)
      AND login_id IS NOT NULL
      AND is_active = 1
    LIMIT 1
  `).get(value, value) ?? null
}

function replaceTaskAssignees(db, taskDetailId, assignees) {
  const uniqueAssignees = Array.from(
    new Map(assignees.map((assignee) => [assignee.id, assignee])).values(),
  )

  db.prepare(`DELETE FROM task_assignees WHERE task_detail_id = ?`).run(
    taskDetailId,
  )
  const insert = db.prepare(`
    INSERT INTO task_assignees (task_detail_id, user_id, order_index)
    VALUES (?, ?, ?)
  `)
  uniqueAssignees.forEach((assignee, index) => {
    insert.run(taskDetailId, assignee.id, index)
  })

  return uniqueAssignees
}

export function getTaskDetail(taskId) {
  const db = getDb()
  const detail = db.prepare(`
    SELECT
      task_detail.id,
      task_detail.nav_node_id AS navNodeId,
      nav_node.title,
      COALESCE(task_detail.description, '') AS description,
      COALESCE(task_detail.due_date, '') AS dueDate,
      COALESCE(task_detail.alarm_at, '') AS alarm,
      task_detail.completed,
      task_detail.priority,
      task_detail.workflow_status AS workflowStatus,
      task_detail.tags_json AS tagsJson
    FROM task_details AS task_detail
    JOIN nav_nodes AS nav_node ON nav_node.id = task_detail.nav_node_id
    WHERE task_detail.nav_node_id = ? AND nav_node.deleted_at IS NULL
  `).get(taskId)

  if (!detail) {
    throw new Error(`Task detail not found: ${taskId}`)
  }

  const attachments = db.prepare(`
    SELECT id, original_name AS name
    FROM attachments
    WHERE task_detail_id = ?
    ORDER BY created_at, id
  `).all(detail.id)
  const assignees = getTaskAssigneesByDetailId(db, detail.id)

  return {
    ...detail,
    assignee: getAssigneeDisplay(assignees),
    assignees,
    completed: Boolean(detail.completed),
    priority: detail.priority,
    workflowStatus: detail.workflowStatus,
    tags: parseTagsJson(detail.tagsJson),
    attachments,
  }
}

export function getAssigneeUsers() {
  const db = getDb()
  return db.prepare(`
    SELECT id, name, email
    FROM users
    WHERE is_active = 1 AND login_id IS NOT NULL
    ORDER BY name COLLATE NOCASE, created_at, id
  `).all()
}

export function toggleTaskCompleted(taskId) {
  const db = getDb()
  const toggle = db.transaction(() => {
    const result = db.prepare(`
      UPDATE task_details
      SET
        completed = CASE completed WHEN 1 THEN 0 ELSE 1 END,
        workflow_status = CASE completed WHEN 1 THEN 'todo' ELSE 'done' END,
        updated_at = CURRENT_TIMESTAMP
      WHERE nav_node_id = ?
    `).run(taskId)

    if (result.changes === 0) {
      throw new Error(`Task detail not found: ${taskId}`)
    }

    const detail = getTaskDetail(taskId)

    if (detail.completed) {
      db.prepare(`
        UPDATE reminders
        SET status = 'sent', updated_at = CURRENT_TIMESTAMP
        WHERE task_detail_id = ? AND status = 'pending'
      `).run(detail.id)
    }

    return detail
  })

  return toggle()
}

export function getDueDesktopReminders(now, assigneeUserId = null) {
  const db = getDb()
  const reminderStateJoin = assigneeUserId
    ? `LEFT JOIN reminder_user_states AS reminder_state
        ON reminder_state.reminder_id = reminder.id
        AND reminder_state.user_id = ?`
    : ''
  const assigneeFilter = assigneeUserId
    ? `AND EXISTS (
        SELECT 1
        FROM task_assignees AS assigned_user
        WHERE
          assigned_user.task_detail_id = task_detail.id
          AND assigned_user.user_id = ?
      )`
    : ''
  const reminderStateFilter = assigneeUserId
    ? `AND COALESCE(reminder_state.status, 'pending') = 'pending'
      AND COALESCE(reminder_state.snoozed_until, reminder.remind_at) <= ?`
    : 'AND reminder.remind_at <= ?'
  const parameters = assigneeUserId
    ? [assigneeUserId, now, assigneeUserId]
    : [now]

  return db.prepare(`
    SELECT
      reminder.id,
      nav_node.id AS taskId,
      nav_node.title,
      COALESCE(task_detail.description, '') AS description,
      COALESCE(task_detail.due_date, '') AS dueDate,
      reminder.remind_at AS remindAt,
      COALESCE((
        SELECT GROUP_CONCAT(assignee_name.name, ', ')
        FROM (
          SELECT user.name
          FROM task_assignees AS task_assignee
          JOIN users AS user ON user.id = task_assignee.user_id
          WHERE task_assignee.task_detail_id = task_detail.id
          ORDER BY task_assignee.order_index, task_assignee.created_at, user.id
        ) AS assignee_name
      ), '') AS assignee
    FROM reminders AS reminder
    JOIN task_details AS task_detail ON task_detail.id = reminder.task_detail_id
    JOIN nav_nodes AS nav_node ON nav_node.id = task_detail.nav_node_id
    ${reminderStateJoin}
    WHERE
      reminder.status = 'pending'
      AND reminder.notify_desktop = 1
      ${reminderStateFilter}
      AND task_detail.completed = 0
      AND nav_node.deleted_at IS NULL
      ${assigneeFilter}
    ORDER BY reminder.remind_at, reminder.created_at, reminder.id
  `).all(...parameters)
}

export function markReminderSent(reminderId) {
  const db = getDb()
  const result = db.prepare(`
    UPDATE reminders
    SET status = 'sent', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(reminderId)

  if (result.changes === 0) {
    throw new Error(`Reminder not found: ${reminderId}`)
  }

  return { id: reminderId }
}

export function snoozeReminder(reminderId, remindAt) {
  const db = getDb()
  const result = db.prepare(`
    UPDATE reminders
    SET remind_at = ?, status = 'pending', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(remindAt, reminderId)

  if (result.changes === 0) {
    throw new Error(`Reminder not found: ${reminderId}`)
  }

  return { id: reminderId, remindAt }
}

export function snoozeReminderForUser(reminderId, userId, remindAt) {
  const db = getDb()
  db.prepare(`
    INSERT INTO reminder_user_states (
      reminder_id, user_id, status, snoozed_until, updated_at
    ) VALUES (?, ?, 'pending', ?, CURRENT_TIMESTAMP)
    ON CONFLICT(reminder_id, user_id) DO UPDATE SET
      status = 'pending',
      snoozed_until = excluded.snoozed_until,
      updated_at = CURRENT_TIMESTAMP
  `).run(reminderId, userId, remindAt)

  return { id: reminderId, remindAt }
}

export function dismissReminderForUser(reminderId, userId) {
  const db = getDb()
  db.prepare(`
    INSERT INTO reminder_user_states (
      reminder_id, user_id, status, snoozed_until, updated_at
    ) VALUES (?, ?, 'dismissed', NULL, CURRENT_TIMESTAMP)
    ON CONFLICT(reminder_id, user_id) DO UPDATE SET
      status = 'dismissed',
      snoozed_until = NULL,
      updated_at = CURRENT_TIMESTAMP
  `).run(reminderId, userId)

  return { id: reminderId }
}

export function updateTaskDetail(taskId, changes) {
  const db = getDb()
  const input = changes && typeof changes === 'object' ? changes : {}
  const has = (key) => Object.hasOwn(input, key)

  const update = db.transaction(() => {
    const taskDetail = db.prepare(`
      SELECT
        task_detail.id,
        task_detail.description,
        task_detail.due_date AS dueDate,
        task_detail.alarm_at AS currentAlarm,
        task_detail.completed,
        task_detail.priority,
        task_detail.workflow_status AS workflowStatus,
        task_detail.tags_json AS tagsJson,
        nav_node.title
      FROM task_details AS task_detail
      JOIN nav_nodes AS nav_node ON nav_node.id = task_detail.nav_node_id
      WHERE task_detail.nav_node_id = ? AND nav_node.deleted_at IS NULL
    `).get(taskId)

    if (!taskDetail) {
      throw new Error(`Task detail not found: ${taskId}`)
    }

    const title = has('title')
      ? String(input.title ?? '').trim()
      : taskDetail.title
    const description = has('description')
      ? String(input.description ?? '').trim()
      : String(taskDetail.description ?? '')
    const dueDate = has('dueDate')
      ? String(input.dueDate ?? '').trim()
      : String(taskDetail.dueDate ?? '')
    const alarm = has('alarm')
      ? String(input.alarm ?? '').trim().replace('T', ' ')
      : String(taskDetail.currentAlarm ?? '')

    if (!title) {
      throw new Error('Task title is required')
    }

    if (has('tags') && (
      !Array.isArray(input.tags)
      || input.tags.some((tag) => typeof tag !== 'string')
    )) {
      throw new Error('INVALID_TASK_TAGS')
    }
    if (has('completed') && typeof input.completed !== 'boolean') {
      throw new Error('INVALID_TASK_COMPLETED')
    }

    let priority = taskDetail.priority
    if (has('priority')) {
      priority = String(input.priority ?? '').trim()
      if (!TASK_PRIORITIES.has(priority)) {
        throw new Error('INVALID_TASK_PRIORITY')
      }
    }

    let workflowStatus = taskDetail.workflowStatus
    let completed = Boolean(taskDetail.completed)
    if (has('completed')) {
      completed = Boolean(input.completed)
      if (!has('workflowStatus')) {
        workflowStatus = completed
          ? 'done'
          : workflowStatus === 'done' ? 'todo' : workflowStatus
      }
    }
    if (has('workflowStatus')) {
      workflowStatus = String(input.workflowStatus ?? '').trim()
      if (!WORKFLOW_STATUSES.has(workflowStatus)) {
        throw new Error('INVALID_WORKFLOW_STATUS')
      }
      completed = workflowStatus === 'done'
    }

    const tags = has('tags')
      ? normalizeTags(input.tags)
      : parseTagsJson(taskDetail.tagsJson)

    const currentAssignees = getTaskAssigneesByDetailId(db, taskDetail.id)
    let nextAssignees = currentAssignees
    const hasAssigneeList =
      Array.isArray(input.assigneeIds) ||
      Array.isArray(input.manualAssigneeNames)

    if (hasAssigneeList) {
      const requestedValues = [
        ...(Array.isArray(input.assigneeIds) ? input.assigneeIds : []),
        ...(Array.isArray(input.manualAssigneeNames)
          ? input.manualAssigneeNames
          : []),
      ]
      nextAssignees = requestedValues
        .map((value) => findManagedAssigneeUser(db, value))
        .filter(Boolean)
      nextAssignees = replaceTaskAssignees(db, taskDetail.id, nextAssignees)
    } else if (has('assignee')) {
      const legacyAssigneeName = String(input.assignee ?? '').trim()
      const currentDisplay = getAssigneeDisplay(currentAssignees)

      if (legacyAssigneeName !== currentDisplay) {
        const legacyAssignee = findManagedAssigneeUser(db, legacyAssigneeName)
        nextAssignees = replaceTaskAssignees(
          db,
          taskDetail.id,
          legacyAssignee ? [legacyAssignee] : [],
        )
      }
    }

    const primaryAssigneeUserId = nextAssignees[0]?.id ?? null
    db.prepare(`
      UPDATE nav_nodes
      SET title = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND node_type = 'task' AND deleted_at IS NULL
    `).run(title, taskId)

    db.prepare(`
      UPDATE task_details
      SET
        description = ?,
        due_date = ?,
        alarm_at = ?,
        assignee_user_id = ?,
        completed = CASE WHEN ? THEN ? ELSE completed END,
        priority = CASE WHEN ? THEN ? ELSE priority END,
        workflow_status = CASE WHEN ? THEN ? ELSE workflow_status END,
        tags_json = CASE WHEN ? THEN ? ELSE tags_json END,
        updated_at = CURRENT_TIMESTAMP
      WHERE nav_node_id = ?
    `).run(
      description || null,
      dueDate || null,
      alarm || null,
      primaryAssigneeUserId,
      has('completed') || has('workflowStatus') ? 1 : 0,
      completed ? 1 : 0,
      has('priority') ? 1 : 0,
      priority,
      has('completed') || has('workflowStatus') ? 1 : 0,
      workflowStatus,
      has('tags') ? 1 : 0,
      JSON.stringify(tags),
      taskId,
    )

    const nextAlarm = alarm || null
    if (has('alarm') && (taskDetail.currentAlarm ?? null) !== nextAlarm) {
      db.prepare(`DELETE FROM reminders WHERE task_detail_id = ?`).run(taskDetail.id)

      if (nextAlarm) {
        db.prepare(`
          INSERT INTO reminders (
            id, task_detail_id, remind_at, notify_desktop, notify_email,
            notify_mobile, status
          ) VALUES (?, ?, ?, 1, 0, 0, 'pending')
        `).run(`reminder-${randomUUID()}`, taskDetail.id, nextAlarm)
      }
    }

    return getTaskDetail(taskId)
  })

  return update()
}

function mapTaskSummary(db, row) {
  return {
    taskId: row.taskId,
    title: row.title,
    folderId: row.folderId || null,
    folderTitle: row.folderTitle || '',
    dueDate: row.dueDate || '',
    completed: Boolean(row.completed),
    assignees: getTaskAssigneesByDetailId(db, row.detailId),
    priority: row.priority,
    workflowStatus: row.workflowStatus,
    tags: parseTagsJson(row.tagsJson),
    isFavorite: Boolean(row.isFavorite),
    lastOpenedAt: row.lastOpenedAt || null,
  }
}

function getTaskSummariesByIds(db, userId, taskIds) {
  if (!Array.isArray(taskIds) || taskIds.length === 0) return []
  const placeholders = taskIds.map(() => '?').join(', ')
  const rows = db.prepare(`
    SELECT
      nav_node.id AS taskId,
      task_detail.id AS detailId,
      nav_node.title,
      parent.id AS folderId,
      COALESCE(parent.title, '') AS folderTitle,
      COALESCE(task_detail.due_date, '') AS dueDate,
      task_detail.completed,
      task_detail.priority,
      task_detail.workflow_status AS workflowStatus,
      task_detail.tags_json AS tagsJson,
      COALESCE(user_state.is_favorite, 0) AS isFavorite,
      user_state.last_opened_at AS lastOpenedAt
    FROM nav_nodes AS nav_node
    JOIN task_details AS task_detail ON task_detail.nav_node_id = nav_node.id
    LEFT JOIN nav_nodes AS parent ON parent.id = nav_node.parent_id
    LEFT JOIN user_task_state AS user_state
      ON user_state.nav_node_id = nav_node.id AND user_state.user_id = ?
    WHERE nav_node.deleted_at IS NULL
      AND nav_node.id IN (${placeholders})
  `).all(userId, ...taskIds)
  const byId = new Map(rows.map((row) => [row.taskId, mapTaskSummary(db, row)]))
  return taskIds.map((taskId) => byId.get(taskId)).filter(Boolean)
}

export function getTaskFavorite(userId, taskId) {
  const db = getDb()
  const task = db.prepare(`
    SELECT nav_node.id
    FROM nav_nodes AS nav_node
    JOIN task_details AS task_detail ON task_detail.nav_node_id = nav_node.id
    WHERE nav_node.id = ? AND nav_node.deleted_at IS NULL
  `).get(taskId)
  if (!task) throw new Error(`Task detail not found: ${taskId}`)
  const state = db.prepare(`
    SELECT is_favorite AS isFavorite
    FROM user_task_state
    WHERE user_id = ? AND nav_node_id = ?
  `).get(userId, taskId)
  return { taskId, isFavorite: Boolean(state?.isFavorite) }
}

export function setTaskFavorite(userId, taskId, isFavorite) {
  const db = getDb()
  getTaskFavorite(userId, taskId)
  db.prepare(`
    INSERT INTO user_task_state (
      user_id, nav_node_id, is_favorite, updated_at
    ) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, nav_node_id) DO UPDATE SET
      is_favorite = excluded.is_favorite,
      updated_at = CURRENT_TIMESTAMP
  `).run(userId, taskId, isFavorite ? 1 : 0)
  return { taskId, isFavorite: Boolean(isFavorite) }
}

export function touchTaskRecent(userId, taskId) {
  const db = getDb()
  getTaskFavorite(userId, taskId)
  db.prepare(`
    INSERT INTO user_task_state (
      user_id, nav_node_id, last_opened_at, updated_at
    ) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, nav_node_id) DO UPDATE SET
      last_opened_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  `).run(userId, taskId)
  const row = db.prepare(`
    SELECT last_opened_at AS lastOpenedAt
    FROM user_task_state
    WHERE user_id = ? AND nav_node_id = ?
  `).get(userId, taskId)
  return { taskId, lastOpenedAt: row.lastOpenedAt }
}

export function getWorkspaceTasks(userId, view, scope = 'all') {
  const db = getDb()
  const normalizedView = String(view || 'incomplete')
  const allowedViews = new Set([
    'today', 'overdue', 'week', 'incomplete', 'unassigned', 'favorites', 'recent',
  ])
  if (!allowedViews.has(normalizedView)) throw new Error('INVALID_WORKSPACE_VIEW')
  if (!['all', 'mine'].includes(scope)) throw new Error('INVALID_WORKSPACE_SCOPE')

  const filters = ['nav_node.deleted_at IS NULL']
  if (scope === 'mine') {
    filters.push(`EXISTS (
      SELECT 1 FROM task_assignees AS mine
      WHERE mine.task_detail_id = task_detail.id AND mine.user_id = @userId
    )`)
  }
  if (normalizedView === 'today') {
    filters.push(`date(task_detail.due_date) = date('now', 'localtime')`)
  } else if (normalizedView === 'overdue') {
    filters.push(`task_detail.completed = 0`)
    filters.push(`date(task_detail.due_date) < date('now', 'localtime')`)
  } else if (normalizedView === 'week') {
    filters.push(`date(task_detail.due_date) BETWEEN date('now', 'localtime') AND date('now', 'localtime', '+6 days')`)
  } else if (normalizedView === 'incomplete') {
    filters.push(`task_detail.completed = 0`)
  } else if (normalizedView === 'unassigned') {
    filters.push(`NOT EXISTS (
      SELECT 1 FROM task_assignees AS assigned
      WHERE assigned.task_detail_id = task_detail.id
    )`)
  } else if (normalizedView === 'favorites') {
    filters.push(`COALESCE(user_state.is_favorite, 0) = 1`)
  } else if (normalizedView === 'recent') {
    filters.push(`user_state.last_opened_at IS NOT NULL`)
  }

  const rows = db.prepare(`
    SELECT
      nav_node.id AS taskId,
      task_detail.id AS detailId,
      nav_node.title,
      parent.id AS folderId,
      COALESCE(parent.title, '') AS folderTitle,
      COALESCE(task_detail.due_date, '') AS dueDate,
      task_detail.completed,
      task_detail.priority,
      task_detail.workflow_status AS workflowStatus,
      task_detail.tags_json AS tagsJson,
      COALESCE(user_state.is_favorite, 0) AS isFavorite,
      user_state.last_opened_at AS lastOpenedAt
    FROM nav_nodes AS nav_node
    JOIN task_details AS task_detail ON task_detail.nav_node_id = nav_node.id
    LEFT JOIN nav_nodes AS parent ON parent.id = nav_node.parent_id
    LEFT JOIN user_task_state AS user_state
      ON user_state.nav_node_id = nav_node.id AND user_state.user_id = @userId
    WHERE ${filters.join('\n      AND ')}
    ORDER BY ${normalizedView === 'recent'
      ? 'user_state.last_opened_at DESC, nav_node.id'
      : `CASE WHEN task_detail.due_date IS NULL THEN 1 ELSE 0 END,
        task_detail.due_date, nav_node.title COLLATE NOCASE, nav_node.id`}
    ${normalizedView === 'recent' ? 'LIMIT 20' : ''}
  `).all({ userId })
  return rows.map((row) => mapTaskSummary(db, row))
}

export function getRecentTasks(userId, scope = 'all') {
  return getWorkspaceTasks(userId, 'recent', scope)
}

export function bulkUpdateTasks(userId, taskIds, changes) {
  const db = getDb()
  if (!Array.isArray(taskIds) || taskIds.length === 0 || taskIds.length > 100) {
    throw new Error('TASK_BULK_SIZE_INVALID')
  }
  if (taskIds.some((taskId) => typeof taskId !== 'string' || !taskId.trim())) {
    throw new Error('TASK_BULK_TARGET_INVALID')
  }
  const ids = Array.from(new Set(taskIds.map((taskId) => taskId.trim())))
  const input = changes && typeof changes === 'object' && !Array.isArray(changes)
    ? changes
    : null
  if (!input) throw new Error('TASK_BULK_CHANGES_REQUIRED')
  const has = (key) => Object.hasOwn(input, key)
  const allowedKeys = new Set([
    'priority', 'workflowStatus', 'tags', 'dueDate', 'completed',
    'assigneeIds', 'parentId',
  ])
  const inputKeys = Object.keys(input)
  if (
    inputKeys.length === 0
    || inputKeys.some((key) => !allowedKeys.has(key))
  ) {
    throw new Error('TASK_BULK_CHANGES_REQUIRED')
  }
  if (has('priority') && typeof input.priority !== 'string') {
    throw new Error('INVALID_TASK_PRIORITY')
  }
  if (has('workflowStatus') && typeof input.workflowStatus !== 'string') {
    throw new Error('INVALID_WORKFLOW_STATUS')
  }
  if (has('tags') && (
    !Array.isArray(input.tags)
    || input.tags.some((tag) => typeof tag !== 'string')
  )) {
    throw new Error('INVALID_TASK_TAGS')
  }
  if (has('dueDate') && input.dueDate !== null && typeof input.dueDate !== 'string') {
    throw new Error('INVALID_TASK_DUE_DATE')
  }
  if (has('completed') && typeof input.completed !== 'boolean') {
    throw new Error('INVALID_TASK_COMPLETED')
  }
  if (has('assigneeIds') && !Array.isArray(input.assigneeIds)) {
    throw new Error('INVALID_TASK_ASSIGNEES')
  }
  if (has('parentId') && input.parentId !== null && typeof input.parentId !== 'string') {
    throw new Error('INVALID_TASK_PARENT')
  }

  const update = db.transaction(() => {
    const placeholders = ids.map(() => '?').join(', ')
    const targets = db.prepare(`
      SELECT task_detail.id AS detailId, nav_node.id AS taskId,
        task_detail.completed, task_detail.workflow_status AS workflowStatus
      FROM nav_nodes AS nav_node
      JOIN task_details AS task_detail ON task_detail.nav_node_id = nav_node.id
      WHERE nav_node.deleted_at IS NULL AND nav_node.id IN (${placeholders})
    `).all(...ids)
    if (targets.length !== ids.length) throw new Error('TASK_BULK_TARGET_NOT_FOUND')

    let priority
    if (has('priority')) {
      priority = String(input.priority ?? '').trim()
      if (!TASK_PRIORITIES.has(priority)) throw new Error('INVALID_TASK_PRIORITY')
    }
    let workflowStatus
    if (has('workflowStatus')) {
      workflowStatus = String(input.workflowStatus ?? '').trim()
      if (!WORKFLOW_STATUSES.has(workflowStatus)) {
        throw new Error('INVALID_WORKFLOW_STATUS')
      }
    }
    const tags = has('tags') ? normalizeTags(input.tags) : null
    const dueDate = has('dueDate') ? String(input.dueDate ?? '').trim() : null

    let assignees = null
    if (has('assigneeIds')) {
      if (input.assigneeIds.some((id) => typeof id !== 'string' || !id.trim())) {
        throw new Error('INVALID_TASK_ASSIGNEES')
      }
      const requested = Array.from(new Set(
        input.assigneeIds.map((id) => id.trim()),
      ))
      const findAssigneeById = db.prepare(`
        SELECT id, name, email
        FROM users
        WHERE id = ? AND login_id IS NOT NULL AND is_active = 1
      `)
      assignees = requested.map((id) => findAssigneeById.get(id) ?? null)
      if (assignees.some((user) => !user)) {
        throw new Error('ASSIGNEE_USER_NOT_FOUND')
      }
    }

    let parentId
    if (has('parentId')) {
      parentId = String(input.parentId ?? '').trim() || null
      if (parentId) {
        const folder = db.prepare(`
          SELECT id FROM nav_nodes
          WHERE id = ? AND node_type = 'folder' AND deleted_at IS NULL
        `).get(parentId)
        if (!folder) throw new Error('TARGET_FOLDER_NOT_FOUND')
      }
    }

    targets.forEach((target) => {
      let nextWorkflowStatus = workflowStatus ?? target.workflowStatus
      let nextCompleted = has('completed')
        ? Boolean(input.completed)
        : Boolean(target.completed)
      if (workflowStatus !== undefined) {
        nextCompleted = workflowStatus === 'done'
      } else if (has('completed')) {
        nextWorkflowStatus = nextCompleted
          ? 'done'
          : target.workflowStatus === 'done' ? 'todo' : target.workflowStatus
      }

      db.prepare(`
        UPDATE task_details SET
          priority = CASE WHEN @hasPriority THEN @priority ELSE priority END,
          workflow_status = @workflowStatus,
          completed = @completed,
          tags_json = CASE WHEN @hasTags THEN @tagsJson ELSE tags_json END,
          due_date = CASE WHEN @hasDueDate THEN @dueDate ELSE due_date END,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = @detailId
      `).run({
        hasPriority: has('priority') ? 1 : 0,
        priority: priority ?? 'normal',
        workflowStatus: nextWorkflowStatus,
        completed: nextCompleted ? 1 : 0,
        hasTags: has('tags') ? 1 : 0,
        tagsJson: JSON.stringify(tags ?? []),
        hasDueDate: has('dueDate') ? 1 : 0,
        dueDate: dueDate || null,
        detailId: target.detailId,
      })
      if (assignees) {
        replaceTaskAssignees(db, target.detailId, assignees)
        db.prepare(`
          UPDATE task_details SET assignee_user_id = ? WHERE id = ?
        `).run(assignees[0]?.id ?? null, target.detailId)
      }
    })

    if (has('parentId')) {
      const maxOrder = db.prepare(`
        SELECT COALESCE(MAX(order_index), 0) AS value
        FROM nav_nodes
        WHERE ((parent_id IS NULL AND ? IS NULL) OR parent_id = ?)
          AND deleted_at IS NULL
          AND id NOT IN (${placeholders})
      `).get(parentId, parentId, ...ids).value
      const move = db.prepare(`
        UPDATE nav_nodes
        SET parent_id = ?, order_index = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND deleted_at IS NULL
      `)
      ids.forEach((taskId, index) => move.run(parentId, maxOrder + index + 1, taskId))
    }

    return getTaskSummariesByIds(db, userId, ids)
  })
  return update()
}

function getSubTaskAssignees(db, subTaskId) {
  return db.prepare(`
    SELECT user.id, user.name, user.email
    FROM sub_task_assignees AS link
    JOIN users AS user ON user.id = link.user_id
    WHERE link.sub_task_id = ?
    ORDER BY link.order_index, link.created_at, user.id
  `).all(subTaskId)
}

function replaceSubTaskAssignees(db, subTaskId, assigneeIds) {
  const uniqueIds = Array.from(new Set(
    (Array.isArray(assigneeIds) ? assigneeIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  ))
  const validUsers = uniqueIds.map((userId) => {
    const user = db.prepare(`
      SELECT id, name, email FROM users
      WHERE id = ? AND is_active = 1
    `).get(userId)
    if (!user) throw new Error(`Assignee user not found: ${userId}`)
    return user
  })

  db.prepare(`DELETE FROM sub_task_assignees WHERE sub_task_id = ?`).run(subTaskId)
  const insert = db.prepare(`
    INSERT INTO sub_task_assignees (sub_task_id, user_id, order_index)
    VALUES (?, ?, ?)
  `)
  validUsers.forEach((user, index) => insert.run(subTaskId, user.id, index))
  db.prepare(`
    UPDATE sub_tasks
    SET assignee_user_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(validUsers[0]?.id ?? null, subTaskId)
  return validUsers
}

function getSubTaskById(db, subTaskId) {
  const row = db.prepare(`
    SELECT
      sub_task.id,
      sub_task.title,
      COALESCE(sub_task.due_date, '') AS dueDate,
      COALESCE(sub_task.assignee_user_id, '') AS assigneeId,
      COALESCE(assignee.name, '') AS assignee,
      sub_task.completed,
      sub_task.created_at AS createdAt,
      sub_task.order_index AS creationOrder
    FROM sub_tasks AS sub_task
    LEFT JOIN users AS assignee ON assignee.id = sub_task.assignee_user_id
    WHERE sub_task.id = ?
  `).get(subTaskId)

  if (!row) {
    throw new Error(`Sub Task not found: ${subTaskId}`)
  }

  const assignees = getSubTaskAssignees(db, subTaskId)
  return {
    ...row,
    assigneeId: assignees[0]?.id ?? '',
    assignee: getAssigneeDisplay(assignees),
    assignees,
    completed: Boolean(row.completed),
  }
}

export function getSubTasks(taskId) {
  const db = getDb()
  const rows = db.prepare(`
    SELECT
      sub_task.id,
      sub_task.title,
      COALESCE(sub_task.due_date, '') AS dueDate,
      COALESCE(sub_task.assignee_user_id, '') AS assigneeId,
      COALESCE(assignee.name, '') AS assignee,
      sub_task.completed,
      sub_task.created_at AS createdAt,
      sub_task.order_index AS creationOrder
    FROM task_details AS task_detail
    JOIN sub_tasks AS sub_task
      ON sub_task.task_detail_id = task_detail.id
    LEFT JOIN users AS assignee
      ON assignee.id = sub_task.assignee_user_id
    WHERE task_detail.nav_node_id = ?
    ORDER BY sub_task.order_index, sub_task.created_at, sub_task.id
  `).all(taskId)

  return rows.map((row) => {
    const assignees = getSubTaskAssignees(db, row.id)
    return {
      ...row,
      assigneeId: assignees[0]?.id ?? '',
      assignee: getAssigneeDisplay(assignees),
      assignees,
      completed: Boolean(row.completed),
    }
  })
}

export function reorderSubTasks(taskId, orderedIds) {
  const db = getDb()
  const requestedIds = Array.isArray(orderedIds)
    ? orderedIds.map((id) => String(id || '').trim()).filter(Boolean)
    : []

  const reorder = db.transaction(() => {
    const taskDetail = db.prepare(`
      SELECT id
      FROM task_details
      WHERE nav_node_id = ?
    `).get(taskId)

    if (!taskDetail) {
      throw new Error(`Task detail not found: ${taskId}`)
    }

    const existingIds = db.prepare(`
      SELECT id
      FROM sub_tasks
      WHERE task_detail_id = ?
      ORDER BY order_index, created_at, id
    `).all(taskDetail.id).map((row) => row.id)

    if (
      requestedIds.length !== existingIds.length ||
      new Set(requestedIds).size !== requestedIds.length ||
      existingIds.some((id) => !requestedIds.includes(id))
    ) {
      throw new Error('Sub Task order must include every item exactly once')
    }

    const updateOrder = db.prepare(`
      UPDATE sub_tasks
      SET order_index = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND task_detail_id = ?
    `)
    requestedIds.forEach((subTaskId, index) => {
      updateOrder.run(index + 1, subTaskId, taskDetail.id)
    })

    return getSubTasks(taskId)
  })

  return reorder()
}

function memoHtmlToPlainText(contentHtml) {
  return String(contentHtml ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<li(?:\s[^>]*)?>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function syncLegacyMemoForTask(db, taskDetailId) {
  const firstMemo = db.prepare(`
    SELECT
      content_html AS contentHtml,
      author_user_id AS authorUserId,
      updated_at AS updatedAt
    FROM memos
    WHERE task_detail_id = ?
    ORDER BY order_index, created_at, id
    LIMIT 1
  `).get(taskDetailId)

  if (firstMemo) {
    const legacyContent = memoHtmlToPlainText(firstMemo.contentHtml)
    db.prepare(`
      UPDATE task_details
      SET
        memo_content = ?,
        memo_author_user_id = ?,
        memo_updated_at = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND (
          memo_content IS NOT ?
          OR memo_author_user_id IS NOT ?
          OR memo_updated_at IS NOT ?
        )
    `).run(
      legacyContent,
      firstMemo.authorUserId,
      firstMemo.updatedAt,
      taskDetailId,
      legacyContent,
      firstMemo.authorUserId,
      firstMemo.updatedAt,
    )
    return
  }

  db.prepare(`
    UPDATE task_details
    SET
      memo_content = '',
      memo_author_user_id = NULL,
      memo_updated_at = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND (
        memo_content <> ''
        OR memo_author_user_id IS NOT NULL
        OR memo_updated_at IS NOT NULL
      )
  `).run(taskDetailId)
}

export function getMemo(taskId) {
  const db = getDb()
  const row = db.prepare(`
    SELECT
      memo.content_html AS contentHtml,
      COALESCE(author.name, '') AS author,
      COALESCE(memo.updated_at, '') AS updatedAt
    FROM task_details AS task_detail
    LEFT JOIN memos AS memo ON memo.id = (
      SELECT candidate.id
      FROM memos AS candidate
      WHERE candidate.task_detail_id = task_detail.id
      ORDER BY candidate.order_index, candidate.created_at, candidate.id
      LIMIT 1
    )
    LEFT JOIN users AS author ON author.id = memo.author_user_id
    WHERE task_detail.nav_node_id = ?
  `).get(taskId)

  if (!row) {
    throw new Error(`Task detail not found: ${taskId}`)
  }

  return {
    content: memoHtmlToPlainText(row.contentHtml),
    author: row.author ?? '',
    updatedAt: row.updatedAt ?? '',
  }
}

export function saveMemo(taskId, memo, authorUserId) {
  const db = getDb()
  const nextMemo = String(memo ?? '')
  const nextContentHtml = escapeHtml(nextMemo).replace(/\r?\n/g, '<br>')
  const save = db.transaction(() => {
    const taskDetail = db.prepare(`
      SELECT id FROM task_details WHERE nav_node_id = ?
    `).get(taskId)
    if (!taskDetail) throw new Error(`Task detail not found: ${taskId}`)

    const firstMemo = db.prepare(`
      SELECT id FROM memos
      WHERE task_detail_id = ?
      ORDER BY order_index, created_at, id
      LIMIT 1
    `).get(taskDetail.id)

    if (firstMemo && nextMemo) {
      db.prepare(`
        UPDATE memos
        SET content_html = ?, author_user_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(nextContentHtml, authorUserId, firstMemo.id)
    } else if (firstMemo) {
      db.prepare(`DELETE FROM memos WHERE id = ?`).run(firstMemo.id)
    } else if (nextMemo) {
      db.prepare(`
        INSERT INTO memos (
          id, task_detail_id, content_html, author_user_id, order_index
        ) VALUES (?, ?, ?, ?, 1)
      `).run(`memo-${randomUUID()}`, taskDetail.id, nextContentHtml, authorUserId)
    }

    syncLegacyMemoForTask(db, taskDetail.id)
  })
  save()

  return getMemo(taskId)
}

function getMemoById(db, memoId) {
  const memo = db.prepare(`
    SELECT
      memo.id,
      memo.content_html AS contentHtml,
      author.name AS author,
      memo.author_user_id AS authorUserId,
      memo.created_at AS createdAt,
      memo.updated_at AS updatedAt,
      memo.order_index AS "order"
    FROM memos AS memo
    JOIN users AS author ON author.id = memo.author_user_id
    WHERE memo.id = ?
  `).get(memoId)
  if (!memo) throw new Error(`Memo not found: ${memoId}`)
  return memo
}

export function getMemos(taskId) {
  const db = getDb()
  return db.prepare(`
    SELECT
      memo.id,
      memo.content_html AS contentHtml,
      author.name AS author,
      memo.author_user_id AS authorUserId,
      memo.created_at AS createdAt,
      memo.updated_at AS updatedAt,
      memo.order_index AS "order"
    FROM task_details AS task_detail
    JOIN memos AS memo ON memo.task_detail_id = task_detail.id
    JOIN users AS author ON author.id = memo.author_user_id
    WHERE task_detail.nav_node_id = ?
    ORDER BY memo.order_index, memo.created_at, memo.id
  `).all(taskId)
}

export function createMemo(taskId, contentHtml, authorUserId) {
  const db = getDb()
  const nextContent = String(contentHtml ?? '').trim()
  if (!nextContent) throw new Error('Memo content is required')

  const create = db.transaction(() => {
    const taskDetail = db.prepare(`
      SELECT id FROM task_details WHERE nav_node_id = ?
    `).get(taskId)
    if (!taskDetail) throw new Error(`Task detail not found: ${taskId}`)
    const sibling = db.prepare(`
      SELECT COALESCE(MAX(order_index), 0) AS maxOrder
      FROM memos WHERE task_detail_id = ?
    `).get(taskDetail.id)
    const memoId = `memo-${randomUUID()}`
    db.prepare(`
      INSERT INTO memos (
        id, task_detail_id, content_html, author_user_id, order_index
      ) VALUES (?, ?, ?, ?, ?)
    `).run(
      memoId,
      taskDetail.id,
      nextContent,
      authorUserId,
      sibling.maxOrder + 1,
    )
    syncLegacyMemoForTask(db, taskDetail.id)
    return getMemoById(db, memoId)
  })
  return create()
}

export function updateMemo(memoId, contentHtml, authorUserId) {
  const db = getDb()
  const nextContent = String(contentHtml ?? '').trim()
  if (!nextContent) throw new Error('Memo content is required')

  const update = db.transaction(() => {
    const memo = db.prepare(`
      SELECT task_detail_id AS taskDetailId
      FROM memos
      WHERE id = ?
    `).get(memoId)
    if (!memo) throw new Error(`Memo not found: ${memoId}`)

    db.prepare(`
      UPDATE memos
      SET
        content_html = ?,
        author_user_id = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(nextContent, authorUserId, memoId)
    syncLegacyMemoForTask(db, memo.taskDetailId)
    return getMemoById(db, memoId)
  })

  return update()
}

export function deleteMemo(memoId) {
  const db = getDb()
  const remove = db.transaction(() => {
    const memo = db.prepare(`
      SELECT
        task_detail.id AS taskDetailId,
        task_detail.nav_node_id AS taskId
      FROM memos AS memo
      JOIN task_details AS task_detail ON task_detail.id = memo.task_detail_id
      WHERE memo.id = ?
    `).get(memoId)
    if (!memo) throw new Error(`Memo not found: ${memoId}`)

    const result = db.prepare(`DELETE FROM memos WHERE id = ?`).run(memoId)
    if (result.changes === 0) throw new Error(`Memo not found: ${memoId}`)
    syncLegacyMemoForTask(db, memo.taskDetailId)
    return { id: memoId, taskId: memo.taskId }
  })

  return remove()
}

function getCommentById(db, commentId) {
  const row = db.prepare(`
    SELECT
      comment.id,
      comment.parent_comment_id AS parentId,
      author.name AS author,
      comment.created_at AS createdAt,
      comment.content,
      comment.is_deleted AS deleted
    FROM comments AS comment
    JOIN users AS author ON author.id = comment.author_user_id
    WHERE comment.id = ?
  `).get(commentId)

  if (!row) {
    throw new Error(`Comment not found: ${commentId}`)
  }

  return { ...row, deleted: Boolean(row.deleted) }
}

export function getComments(taskId) {
  const db = getDb()
  const rows = db.prepare(`
    SELECT
      comment.id,
      comment.parent_comment_id AS parentId,
      author.name AS author,
      comment.created_at AS createdAt,
      comment.content,
      comment.is_deleted AS deleted
    FROM task_details AS task_detail
    JOIN comments AS comment ON comment.task_detail_id = task_detail.id
    JOIN users AS author ON author.id = comment.author_user_id
    WHERE task_detail.nav_node_id = ?
    ORDER BY comment.created_at, comment.id
  `).all(taskId)

  return rows.map((row) => ({ ...row, deleted: Boolean(row.deleted) }))
}

export function createComment(
  taskId,
  parentId,
  content,
  authorUserId = 'user-jh',
) {
  const db = getDb()
  const nextContent = String(content ?? '').trim()

  if (!nextContent) {
    throw new Error('Comment content is required')
  }

  const create = db.transaction(() => {
    const taskDetail = db.prepare(`
      SELECT id
      FROM task_details
      WHERE nav_node_id = ?
    `).get(taskId)

    if (!taskDetail) {
      throw new Error(`Task detail not found: ${taskId}`)
    }

    if (parentId !== null) {
      const parent = db.prepare(`
        SELECT id
        FROM comments
        WHERE id = ? AND task_detail_id = ?
      `).get(parentId, taskDetail.id)

      if (!parent) {
        throw new Error(`Parent comment not found in Task: ${parentId}`)
      }
    }

    const commentId = `comment-${randomUUID()}`
    db.prepare(`
      INSERT INTO comments (
        id,
        task_detail_id,
        parent_comment_id,
        author_user_id,
        content
      ) VALUES (?, ?, ?, ?, ?)
    `).run(commentId, taskDetail.id, parentId, authorUserId, nextContent)

    return getCommentById(db, commentId)
  })

  return create()
}

export function updateComment(commentId, content) {
  const db = getDb()
  const nextContent = String(content ?? '').trim()

  if (!nextContent) {
    throw new Error('Comment content is required')
  }

  const result = db.prepare(`
    UPDATE comments
    SET content = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND is_deleted = 0
  `).run(nextContent, commentId)

  if (result.changes === 0) {
    throw new Error(`Editable comment not found: ${commentId}`)
  }

  return getCommentById(db, commentId)
}

export function deleteComment(commentId) {
  const db = getDb()
  const result = db.prepare(`
    UPDATE comments
    SET content = '', is_deleted = 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND is_deleted = 0
  `).run(commentId)

  if (result.changes === 0) {
    throw new Error(`Active comment not found: ${commentId}`)
  }

  return getCommentById(db, commentId)
}

export function createAttachment(taskId, file, uploadedByUserId = 'user-jh') {
  const db = getDb()
  const taskDetail = db.prepare(`
    SELECT id
    FROM task_details
    WHERE nav_node_id = ?
  `).get(taskId)

  if (!taskDetail) {
    throw new Error(`Task detail not found: ${taskId}`)
  }

  const attachmentId = `attachment-${randomUUID()}`
  db.prepare(`
    INSERT INTO attachments (
      id,
      task_detail_id,
      original_name,
      stored_path,
      mime_type,
      file_size,
      uploaded_by_user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    attachmentId,
    taskDetail.id,
    file.name,
    file.path,
    file.mimeType ?? null,
    file.size ?? null,
    uploadedByUserId,
  )

  return { id: attachmentId, name: file.name }
}

export function getAttachmentPath(attachmentId) {
  const db = getDb()
  const row = db.prepare(`
    SELECT stored_path AS path
    FROM attachments
    WHERE id = ?
  `).get(attachmentId)

  if (!row) {
    throw new Error(`Attachment not found: ${attachmentId}`)
  }

  return row.path
}

export function getAttachmentRecord(attachmentId) {
  const db = getDb()
  const row = db.prepare(`
    SELECT
      attachment.id,
      attachment.original_name AS name,
      attachment.stored_path AS path,
      COALESCE(attachment.mime_type, 'application/octet-stream') AS mimeType,
      attachment.file_size AS size,
      task_detail.nav_node_id AS taskId
    FROM attachments AS attachment
    JOIN task_details AS task_detail ON task_detail.id = attachment.task_detail_id
    JOIN nav_nodes AS nav_node ON nav_node.id = task_detail.nav_node_id
    WHERE attachment.id = ? AND nav_node.deleted_at IS NULL
  `).get(attachmentId)

  if (!row) {
    throw new Error(`Attachment not found: ${attachmentId}`)
  }

  return row
}

export function createSubTask(taskId, title) {
  const db = getDb()
  const nextTitle = String(title ?? '').trim()

  if (!nextTitle) {
    throw new Error('Sub Task title is required')
  }

  const create = db.transaction(() => {
    const taskDetail = db.prepare(`
      SELECT
        task_detail.id,
        COALESCE(
          (
            SELECT task_assignee.user_id
            FROM task_assignees AS task_assignee
            WHERE task_assignee.task_detail_id = task_detail.id
            ORDER BY
              task_assignee.order_index,
              task_assignee.created_at,
              task_assignee.user_id
            LIMIT 1
          ),
          task_detail.assignee_user_id
        ) AS defaultAssigneeId
      FROM task_details AS task_detail
      WHERE task_detail.nav_node_id = ?
    `).get(taskId)

    if (!taskDetail) {
      throw new Error(`Task detail not found: ${taskId}`)
    }

    const sibling = db.prepare(`
      SELECT COALESCE(MAX(order_index), 0) AS maxOrder
      FROM sub_tasks
      WHERE task_detail_id = ?
    `).get(taskDetail.id)
    const subTaskId = `subtask-${randomUUID()}`

    db.prepare(`
      INSERT INTO sub_tasks (
        id,
        task_detail_id,
        title,
        due_date,
        assignee_user_id,
        completed,
        order_index
      ) VALUES (?, ?, ?, ?, ?, 0, ?)
    `).run(
      subTaskId,
      taskDetail.id,
      nextTitle,
      null,
      taskDetail.defaultAssigneeId ?? null,
      sibling.maxOrder + 1,
    )

    const inheritedAssignees = db.prepare(`
      SELECT user_id AS userId
      FROM task_assignees
      WHERE task_detail_id = ?
      ORDER BY order_index, created_at, user_id
    `).all(taskDetail.id).map((row) => row.userId)
    replaceSubTaskAssignees(db, subTaskId, inheritedAssignees)

    return getSubTaskById(db, subTaskId)
  })

  return create()
}

export function toggleSubTask(subTaskId) {
  const db = getDb()
  const result = db.prepare(`
    UPDATE sub_tasks
    SET
      completed = CASE completed WHEN 1 THEN 0 ELSE 1 END,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(subTaskId)

  if (result.changes === 0) {
    throw new Error(`Sub Task not found: ${subTaskId}`)
  }

  return getSubTaskById(db, subTaskId)
}

export function deleteSubTask(subTaskId) {
  const db = getDb()
  const result = db.prepare(`DELETE FROM sub_tasks WHERE id = ?`).run(subTaskId)

  if (result.changes === 0) {
    throw new Error(`Sub Task not found: ${subTaskId}`)
  }

  return { id: subTaskId }
}

export function updateSubTask(subTaskId, field, value) {
  const db = getDb()
  const nextValue = Array.isArray(value) ? '' : String(value ?? '').trim()

  if (!nextValue && field === 'title') {
    throw new Error('Sub Task value is required')
  }

  if (field === 'title') {
    const result = db.prepare(`
      UPDATE sub_tasks
      SET title = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(nextValue, subTaskId)

    if (result.changes === 0) {
      throw new Error(`Sub Task not found: ${subTaskId}`)
    }
  } else if (field === 'dueDate') {
    const result = db.prepare(`
      UPDATE sub_tasks
      SET due_date = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(nextValue || null, subTaskId)

    if (result.changes === 0) {
      throw new Error(`Sub Task not found: ${subTaskId}`)
    }
  } else if (field === 'assignees') {
    const updateAssignees = db.transaction(() => {
      const exists = db.prepare(`SELECT id FROM sub_tasks WHERE id = ?`).get(subTaskId)
      if (!exists) throw new Error(`Sub Task not found: ${subTaskId}`)
      replaceSubTaskAssignees(db, subTaskId, value)
    })
    updateAssignees()
  } else if (field === 'assignee') {
    const updateAssignee = db.transaction(() => {
      if (!nextValue) {
        const result = db.prepare(`
          UPDATE sub_tasks
          SET assignee_user_id = NULL, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(subTaskId)

        if (result.changes === 0) {
          throw new Error(`Sub Task not found: ${subTaskId}`)
        }
        db.prepare(`DELETE FROM sub_task_assignees WHERE sub_task_id = ?`).run(subTaskId)
        return
      }

      let user = db.prepare(`
        SELECT id
        FROM users
        WHERE id = ? OR name = ? COLLATE NOCASE
        LIMIT 1
      `).get(nextValue, nextValue)

      if (!user) {
        const userId = `user-${randomUUID()}`
        const emailId = randomUUID()
        db.prepare(`
          INSERT INTO users (id, name, email)
          VALUES (?, ?, ?)
        `).run(userId, nextValue, `local-${emailId}@todo.local`)
        user = { id: userId }
      }

      const result = db.prepare(`
        UPDATE sub_tasks
        SET assignee_user_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(user.id, subTaskId)

      if (result.changes === 0) {
        throw new Error(`Sub Task not found: ${subTaskId}`)
      }
      replaceSubTaskAssignees(db, subTaskId, [user.id])
    })

    updateAssignee()
  } else {
    throw new Error(`Unsupported Sub Task field: ${field}`)
  }

  return getSubTaskById(db, subTaskId)
}

export function renameNavigationNode(nodeId, title) {
  const db = getDb()
  const nextTitle = String(title ?? '').trim()

  if (!nextTitle) {
    throw new Error('Navigation title is required')
  }

  const result = db.prepare(`
    UPDATE nav_nodes
    SET title = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND deleted_at IS NULL
  `).run(nextTitle, nodeId)

  if (result.changes === 0) {
    throw new Error(`Navigation node not found: ${nodeId}`)
  }

  return { id: nodeId, title: nextTitle }
}

export function deleteNavigationNode(nodeId) {
  const db = getDb()
  const batchId = randomUUID()
  const target = db.prepare(`
    SELECT id
    FROM nav_nodes
    WHERE id = ? AND deleted_at IS NULL
  `).get(nodeId)

  if (!target) {
    throw new Error(`Navigation node not found: ${nodeId}`)
  }

  const result = db.prepare(`
    WITH RECURSIVE descendants(id) AS (
      SELECT id
      FROM nav_nodes
      WHERE id = ? AND deleted_at IS NULL

      UNION ALL

      SELECT child.id
      FROM nav_nodes AS child
      JOIN descendants AS parent ON child.parent_id = parent.id
      WHERE child.deleted_at IS NULL
    )
    UPDATE nav_nodes
    SET
      deleted_at = CURRENT_TIMESTAMP,
      deleted_batch_id = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id IN (SELECT id FROM descendants)
  `).run(nodeId, batchId)

  return { id: nodeId, batchId, deletedCount: result.changes }
}

export function getTrashNodes(userId) {
  const db = getDb()
  return db.prepare(`
    SELECT
      root.id,
      root.node_type AS type,
      root.title,
      root.parent_id AS parentId,
      root.deleted_at AS deletedAt,
      root.deleted_batch_id AS deletedBatchId,
      (
        SELECT COUNT(*)
        FROM nav_nodes AS item
        WHERE item.deleted_batch_id = root.deleted_batch_id
          AND item.deleted_at IS NOT NULL
      ) AS count
    FROM nav_nodes AS root
    WHERE root.deleted_at IS NOT NULL
      AND root.deleted_batch_id IS NOT NULL
      AND root.owner_user_id = ?
      AND NOT EXISTS (
        SELECT 1
        FROM nav_nodes AS parent
        WHERE parent.id = root.parent_id
          AND parent.deleted_at IS NOT NULL
          AND parent.deleted_batch_id = root.deleted_batch_id
      )
    ORDER BY root.deleted_at DESC, root.id
  `).all(userId)
}

export function restoreNavigationNode(nodeId, userId) {
  const db = getDb()
  const restore = db.transaction(() => {
    const root = db.prepare(`
      SELECT node.id, node.parent_id AS parentId, node.deleted_batch_id AS batchId
      FROM nav_nodes AS node
      WHERE node.id = ?
        AND node.owner_user_id = ?
        AND node.deleted_at IS NOT NULL
        AND node.deleted_batch_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM nav_nodes AS parent
          WHERE parent.id = node.parent_id
            AND parent.deleted_at IS NOT NULL
            AND parent.deleted_batch_id = node.deleted_batch_id
        )
    `).get(nodeId, userId)
    if (!root) throw new Error(`Trash node not found: ${nodeId}`)

    const parent = root.parentId
      ? db.prepare(`SELECT id FROM nav_nodes WHERE id = ? AND deleted_at IS NULL`).get(root.parentId)
      : null
    const nextParentId = parent?.id ?? null
    const maxOrder = db.prepare(`
      SELECT COALESCE(MAX(order_index), 0) AS value
      FROM nav_nodes
      WHERE ((parent_id IS NULL AND ? IS NULL) OR parent_id = ?)
        AND deleted_at IS NULL
    `).get(nextParentId, nextParentId).value

    db.prepare(`
      UPDATE nav_nodes
      SET parent_id = ?, order_index = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(nextParentId, maxOrder + 1, root.id)

    const result = db.prepare(`
      UPDATE nav_nodes
      SET
        deleted_at = NULL,
        deleted_batch_id = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE deleted_batch_id = ? AND deleted_at IS NOT NULL
    `).run(root.batchId)

    return {
      id: root.id,
      parentId: nextParentId,
      restoredCount: result.changes,
    }
  })
  return restore()
}

export function permanentlyDeleteNavigationNode(nodeId, userId) {
  const db = getDb()
  const remove = db.transaction(() => {
    const root = db.prepare(`
      SELECT node.id, node.deleted_batch_id AS batchId
      FROM nav_nodes AS node
      WHERE node.id = ?
        AND node.owner_user_id = ?
        AND node.deleted_at IS NOT NULL
        AND node.deleted_batch_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM nav_nodes AS parent
          WHERE parent.id = node.parent_id
            AND parent.deleted_at IS NOT NULL
            AND parent.deleted_batch_id = node.deleted_batch_id
        )
    `).get(nodeId, userId)
    if (!root) throw new Error(`Trash node not found: ${nodeId}`)

    const batchNodes = db.prepare(`
      SELECT id FROM nav_nodes
      WHERE deleted_batch_id = ? AND deleted_at IS NOT NULL
    `).all(root.batchId)
    const batchIds = batchNodes.map((node) => node.id)
    if (batchIds.length === 0) throw new Error(`Trash node not found: ${nodeId}`)

    const placeholders = batchIds.map(() => '?').join(', ')
    const boundaryNodes = db.prepare(`
      SELECT child.id
      FROM nav_nodes AS child
      WHERE child.parent_id IN (${placeholders})
        AND (
          child.deleted_at IS NULL
          OR child.deleted_batch_id IS NULL
          OR child.deleted_batch_id <> ?
        )
    `).all(...batchIds, root.batchId)
    const rootOrder = db.prepare(`
      SELECT COALESCE(MAX(order_index), 0) AS value
      FROM nav_nodes
      WHERE parent_id IS NULL AND deleted_at IS NULL
    `).get().value
    const detach = db.prepare(`
      UPDATE nav_nodes
      SET parent_id = NULL, order_index = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    boundaryNodes.forEach((node, index) => {
      detach.run(rootOrder + index + 1, node.id)
    })

    // Delete only this batch. Attachment rows are removed by SQLite cascades;
    // shared stored_path files are intentionally never unlinked here.
    db.prepare(`DELETE FROM nav_nodes WHERE id = ?`).run(root.id)
    return { id: nodeId, deletedCount: batchIds.length }
  })
  return remove()
}

export function moveNavigationNode(nodeId, targetFolderId = null) {
  const db = getDb()

  const moveNode = db.transaction(() => {
    const node = db.prepare(`
      SELECT id, node_type AS type
      FROM nav_nodes
      WHERE id = ? AND deleted_at IS NULL
    `).get(nodeId)

    if (!node) {
      throw new Error(`Navigation node not found: ${nodeId}`)
    }

    if (targetFolderId !== null) {
      const targetFolder = db.prepare(`
        SELECT id
        FROM nav_nodes
        WHERE id = ? AND node_type = 'folder' AND deleted_at IS NULL
      `).get(targetFolderId)

      if (!targetFolder) {
        throw new Error(`Target folder not found: ${targetFolderId}`)
      }
    }

    if (node.type === 'folder' && targetFolderId !== null) {
      const invalidTarget = db.prepare(`
        WITH RECURSIVE descendants(id) AS (
          SELECT id
          FROM nav_nodes
          WHERE id = ? AND deleted_at IS NULL

          UNION ALL

          SELECT child.id
          FROM nav_nodes AS child
          JOIN descendants AS parent ON child.parent_id = parent.id
          WHERE child.deleted_at IS NULL
        )
        SELECT id
        FROM descendants
        WHERE id = ?
      `).get(nodeId, targetFolderId)

      if (invalidTarget) {
        throw new Error('A folder cannot be moved into itself or its descendant')
      }
    }

    const sibling = db.prepare(`
      SELECT COALESCE(MAX(order_index), 0) AS maxOrder
      FROM nav_nodes
      WHERE
        (
          (parent_id IS NULL AND ? IS NULL)
          OR parent_id = ?
        )
        AND deleted_at IS NULL
        AND id <> ?
    `).get(targetFolderId, targetFolderId, nodeId)

    const nextOrder = sibling.maxOrder + 1

    db.prepare(`
      UPDATE nav_nodes
      SET
        parent_id = ?,
        order_index = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND deleted_at IS NULL
    `).run(targetFolderId, nextOrder, nodeId)

    return { id: nodeId, parentId: targetFolderId, order: nextOrder }
  })

  return moveNode()
}

export function copyNavigationNode(nodeId, targetFolderId = null) {
  const db = getDb()

  const copyNode = db.transaction(() => {
    const sourceRoot = db.prepare(`
      SELECT id, node_type AS type
      FROM nav_nodes
      WHERE id = ? AND deleted_at IS NULL
    `).get(nodeId)

    if (!sourceRoot) {
      throw new Error(`Navigation node not found: ${nodeId}`)
    }

    if (targetFolderId !== null) {
      const targetFolder = db.prepare(`
        SELECT id
        FROM nav_nodes
        WHERE id = ? AND node_type = 'folder' AND deleted_at IS NULL
      `).get(targetFolderId)

      if (!targetFolder) {
        throw new Error(`Target folder not found: ${targetFolderId}`)
      }
    }

    const sourceNodes = db.prepare(`
      WITH RECURSIVE subtree(
        id,
        parentId,
        type,
        title,
        "order",
        expanded,
        ownerUserId,
        depth
      ) AS (
        SELECT
          id,
          parent_id,
          node_type,
          title,
          order_index,
          is_expanded,
          owner_user_id,
          0
        FROM nav_nodes
        WHERE id = ? AND deleted_at IS NULL

        UNION ALL

        SELECT
          child.id,
          child.parent_id,
          child.node_type,
          child.title,
          child.order_index,
          child.is_expanded,
          child.owner_user_id,
          parent.depth + 1
        FROM nav_nodes AS child
        JOIN subtree AS parent ON child.parent_id = parent.id
        WHERE child.deleted_at IS NULL
      )
      SELECT *
      FROM subtree
      ORDER BY depth, parentId, "order"
    `).all(nodeId)

    const rootSibling = db.prepare(`
      SELECT COALESCE(MAX(order_index), 0) AS maxOrder
      FROM nav_nodes
      WHERE
        (
          (parent_id IS NULL AND ? IS NULL)
          OR parent_id = ?
        )
        AND deleted_at IS NULL
    `).get(targetFolderId, targetFolderId)

    const rootOrder = rootSibling.maxOrder + 1
    const nodeIdMap = new Map()
    const taskIdMap = {}
    const insertNode = db.prepare(`
      INSERT INTO nav_nodes (
        id,
        parent_id,
        node_type,
        title,
        order_index,
        is_expanded,
        owner_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    const getTaskDetail = db.prepare(`
      SELECT
        id,
        description,
        due_date AS dueDate,
        alarm_at AS alarmAt,
        assignee_user_id AS assigneeUserId,
        memo_content AS memoContent,
        completed,
        priority,
        workflow_status AS workflowStatus,
        tags_json AS tagsJson
      FROM task_details
      WHERE nav_node_id = ?
    `)
    const insertTaskDetail = db.prepare(`
      INSERT INTO task_details (
        id,
        nav_node_id,
        description,
        due_date,
        alarm_at,
        assignee_user_id,
        memo_content,
        completed,
        priority,
        workflow_status,
        tags_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const getSourceTaskAssignees = db.prepare(`
      SELECT user_id AS userId, order_index AS "order"
      FROM task_assignees
      WHERE task_detail_id = ?
      ORDER BY order_index, created_at, user_id
    `)
    const insertCopiedTaskAssignee = db.prepare(`
      INSERT INTO task_assignees (task_detail_id, user_id, order_index)
      VALUES (?, ?, ?)
    `)
    const getSourceSubTasks = db.prepare(`
      SELECT
        id,
        title,
        due_date AS dueDate,
        assignee_user_id AS assigneeUserId,
        completed,
        order_index AS "order"
      FROM sub_tasks
      WHERE task_detail_id = ?
      ORDER BY order_index, created_at, id
    `)
    const insertCopiedSubTask = db.prepare(`
      INSERT INTO sub_tasks (
        id,
        task_detail_id,
        title,
        due_date,
        assignee_user_id,
        completed,
        order_index
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    const getSourceSubTaskAssignees = db.prepare(`
      SELECT user_id AS userId, order_index AS "order"
      FROM sub_task_assignees
      WHERE sub_task_id = ?
      ORDER BY order_index, created_at, user_id
    `)
    const insertCopiedSubTaskAssignee = db.prepare(`
      INSERT INTO sub_task_assignees (sub_task_id, user_id, order_index)
      VALUES (?, ?, ?)
    `)
    const getSourceMemos = db.prepare(`
      SELECT
        content_html AS contentHtml,
        author_user_id AS authorUserId,
        order_index AS "order",
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM memos
      WHERE task_detail_id = ?
      ORDER BY order_index, created_at, id
    `)
    const insertCopiedMemo = db.prepare(`
      INSERT INTO memos (
        id,
        task_detail_id,
        content_html,
        author_user_id,
        order_index,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    const getSourceComments = db.prepare(`
      WITH RECURSIVE comment_tree(
        id,
        parentId,
        authorUserId,
        content,
        deleted,
        createdAt,
        updatedAt,
        depth
      ) AS (
        SELECT
          id,
          parent_comment_id,
          author_user_id,
          content,
          is_deleted,
          created_at,
          updated_at,
          0
        FROM comments
        WHERE task_detail_id = ? AND parent_comment_id IS NULL

        UNION ALL

        SELECT
          child.id,
          child.parent_comment_id,
          child.author_user_id,
          child.content,
          child.is_deleted,
          child.created_at,
          child.updated_at,
          parent.depth + 1
        FROM comments AS child
        JOIN comment_tree AS parent ON child.parent_comment_id = parent.id
        WHERE child.task_detail_id = ?
      )
      SELECT * FROM comment_tree
      ORDER BY depth, createdAt, id
    `)
    const insertCopiedComment = db.prepare(`
      INSERT INTO comments (
        id,
        task_detail_id,
        parent_comment_id,
        author_user_id,
        content,
        is_deleted,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const getSourceAttachments = db.prepare(`
      SELECT
        original_name AS name,
        stored_path AS path,
        mime_type AS mimeType,
        file_size AS size,
        uploaded_by_user_id AS uploadedByUserId,
        created_at AS createdAt
      FROM attachments
      WHERE task_detail_id = ?
      ORDER BY created_at, id
    `)
    const insertCopiedAttachment = db.prepare(`
      INSERT INTO attachments (
        id,
        task_detail_id,
        original_name,
        stored_path,
        mime_type,
        file_size,
        uploaded_by_user_id,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const getSourceReminders = db.prepare(`
      SELECT
        remind_at AS remindAt,
        notify_desktop AS notifyDesktop,
        notify_email AS notifyEmail,
        notify_mobile AS notifyMobile,
        status,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM reminders
      WHERE task_detail_id = ?
      ORDER BY created_at, id
    `)
    const insertCopiedReminder = db.prepare(`
      INSERT INTO reminders (
        id,
        task_detail_id,
        remind_at,
        notify_desktop,
        notify_email,
        notify_mobile,
        status,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    sourceNodes.forEach((sourceNode) => {
      const copiedId = `${sourceNode.type}-${randomUUID()}`
      const copiedParentId = sourceNode.depth === 0
        ? targetFolderId
        : nodeIdMap.get(sourceNode.parentId)
      const copiedTitle = sourceNode.depth === 0
        ? `${sourceNode.title} 복사본`
        : sourceNode.title
      const copiedOrder = sourceNode.depth === 0
        ? rootOrder
        : sourceNode.order

      insertNode.run(
        copiedId,
        copiedParentId,
        sourceNode.type,
        copiedTitle,
        copiedOrder,
        sourceNode.expanded,
        sourceNode.ownerUserId,
      )
      nodeIdMap.set(sourceNode.id, copiedId)

      if (sourceNode.type === 'task') {
        const sourceDetail = getTaskDetail.get(sourceNode.id)
        const copiedDetailId = `task-detail-${randomUUID()}`

        insertTaskDetail.run(
          copiedDetailId,
          copiedId,
          sourceDetail?.description ?? '복사된 Task입니다.',
          sourceDetail?.dueDate ?? null,
          sourceDetail?.alarmAt ?? null,
          sourceDetail?.assigneeUserId ?? null,
          sourceDetail?.memoContent ?? '',
          sourceDetail?.completed ?? 0,
          sourceDetail?.priority ?? 'normal',
          sourceDetail?.workflowStatus ?? (sourceDetail?.completed ? 'done' : 'todo'),
          sourceDetail?.tagsJson ?? '[]',
        )

        if (sourceDetail) {
          getSourceTaskAssignees.all(sourceDetail.id).forEach((assignee) => {
            insertCopiedTaskAssignee.run(
              copiedDetailId,
              assignee.userId,
              assignee.order,
            )
          })

          const sourceSubTasks = getSourceSubTasks.all(sourceDetail.id)
          sourceSubTasks.forEach((sourceSubTask) => {
            const copiedSubTaskId = `subtask-${randomUUID()}`
            insertCopiedSubTask.run(
              copiedSubTaskId,
              copiedDetailId,
              sourceSubTask.title,
              sourceSubTask.dueDate,
              sourceSubTask.assigneeUserId,
              sourceSubTask.completed,
              sourceSubTask.order,
            )
            getSourceSubTaskAssignees.all(sourceSubTask.id).forEach((assignee) => {
              insertCopiedSubTaskAssignee.run(
                copiedSubTaskId,
                assignee.userId,
                assignee.order,
              )
            })
          })

          getSourceMemos.all(sourceDetail.id).forEach((sourceMemo) => {
            insertCopiedMemo.run(
              `memo-${randomUUID()}`,
              copiedDetailId,
              sourceMemo.contentHtml,
              sourceMemo.authorUserId,
              sourceMemo.order,
              sourceMemo.createdAt,
              sourceMemo.updatedAt,
            )
          })

          const commentIdMap = new Map()
          const sourceComments = getSourceComments.all(
            sourceDetail.id,
            sourceDetail.id,
          )
          sourceComments.forEach((sourceComment) => {
            const copiedCommentId = `comment-${randomUUID()}`
            const copiedParentCommentId = sourceComment.parentId
              ? commentIdMap.get(sourceComment.parentId)
              : null

            insertCopiedComment.run(
              copiedCommentId,
              copiedDetailId,
              copiedParentCommentId,
              sourceComment.authorUserId,
              sourceComment.content,
              sourceComment.deleted,
              sourceComment.createdAt,
              sourceComment.updatedAt,
            )
            commentIdMap.set(sourceComment.id, copiedCommentId)
          })

          const sourceAttachments = getSourceAttachments.all(sourceDetail.id)
          sourceAttachments.forEach((sourceAttachment) => {
            insertCopiedAttachment.run(
              `attachment-${randomUUID()}`,
              copiedDetailId,
              sourceAttachment.name,
              sourceAttachment.path,
              sourceAttachment.mimeType,
              sourceAttachment.size,
              sourceAttachment.uploadedByUserId,
              sourceAttachment.createdAt,
            )
          })

          const sourceReminders = getSourceReminders.all(sourceDetail.id)
          sourceReminders.forEach((sourceReminder) => {
            insertCopiedReminder.run(
              `reminder-${randomUUID()}`,
              copiedDetailId,
              sourceReminder.remindAt,
              sourceReminder.notifyDesktop,
              sourceReminder.notifyEmail,
              sourceReminder.notifyMobile,
              sourceReminder.status,
              sourceReminder.createdAt,
              sourceReminder.updatedAt,
            )
          })
        }

        taskIdMap[sourceNode.id] = copiedId
      }
    })

    return {
      id: nodeIdMap.get(nodeId),
      type: sourceRoot.type,
      taskIdMap,
    }
  })

  return copyNode()
}

export function moveNavigationNodeByDirection(nodeId, direction) {
  const db = getDb()

  if (direction !== 'up' && direction !== 'down') {
    throw new Error(`Invalid move direction: ${direction}`)
  }

  const reorderNode = db.transaction(() => {
    const node = db.prepare(`
      SELECT id, parent_id AS parentId, order_index AS "order"
      FROM nav_nodes
      WHERE id = ? AND deleted_at IS NULL
    `).get(nodeId)

    if (!node) {
      throw new Error(`Navigation node not found: ${nodeId}`)
    }

    const operator = direction === 'up' ? '<' : '>'
    const sortDirection = direction === 'up' ? 'DESC' : 'ASC'
    const adjacent = db.prepare(`
      SELECT id, order_index AS "order"
      FROM nav_nodes
      WHERE
        (
          (parent_id IS NULL AND ? IS NULL)
          OR parent_id = ?
        )
        AND deleted_at IS NULL
        AND order_index ${operator} ?
      ORDER BY order_index ${sortDirection}
      LIMIT 1
    `).get(node.parentId, node.parentId, node.order)

    if (!adjacent) {
      return { id: nodeId, changed: false }
    }

    const updateOrder = db.prepare(`
      UPDATE nav_nodes
      SET order_index = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND deleted_at IS NULL
    `)
    updateOrder.run(adjacent.order, node.id)
    updateOrder.run(node.order, adjacent.id)

    return { id: nodeId, changed: true, order: adjacent.order }
  })

  return reorderNode()
}

export function dropNavigationNode(nodeId, targetNodeId, position) {
  const db = getDb()
  const validPositions = new Set(['before', 'after', 'inside'])

  if (!validPositions.has(position)) {
    throw new Error(`Invalid drop position: ${position}`)
  }

  const dropNode = db.transaction(() => {
    const getNode = db.prepare(`
      SELECT
        id,
        parent_id AS parentId,
        node_type AS type,
        order_index AS "order"
      FROM nav_nodes
      WHERE id = ? AND deleted_at IS NULL
    `)
    const source = getNode.get(nodeId)
    const target = getNode.get(targetNodeId)

    if (!source || !target) {
      throw new Error('Drag source or drop target was not found')
    }

    if (source.id === target.id) {
      throw new Error('A node cannot be dropped onto itself')
    }

    if (position === 'inside' && target.type !== 'folder') {
      throw new Error('Only folders can accept an inside drop')
    }

    const destinationParentId = position === 'inside'
      ? target.id
      : target.parentId

    if (source.type === 'folder' && destinationParentId !== null) {
      const invalidTarget = db.prepare(`
        WITH RECURSIVE descendants(id) AS (
          SELECT id
          FROM nav_nodes
          WHERE id = ? AND deleted_at IS NULL

          UNION ALL

          SELECT child.id
          FROM nav_nodes AS child
          JOIN descendants AS parent ON child.parent_id = parent.id
          WHERE child.deleted_at IS NULL
        )
        SELECT id
        FROM descendants
        WHERE id = ?
      `).get(source.id, destinationParentId)

      if (invalidTarget) {
        throw new Error('A folder cannot be dropped into its descendant')
      }
    }

    const getSiblings = db.prepare(`
      SELECT id
      FROM nav_nodes
      WHERE
        (
          (parent_id IS NULL AND ? IS NULL)
          OR parent_id = ?
        )
        AND deleted_at IS NULL
        AND id <> ?
      ORDER BY order_index, created_at, id
    `)
    const destinationSiblings = getSiblings.all(
      destinationParentId,
      destinationParentId,
      source.id,
    )
    let insertionIndex = destinationSiblings.length

    if (position !== 'inside') {
      const targetIndex = destinationSiblings.findIndex(
        (sibling) => sibling.id === target.id,
      )

      if (targetIndex === -1) {
        throw new Error('Drop target is not in the destination')
      }

      insertionIndex = position === 'before' ? targetIndex : targetIndex + 1
    }

    destinationSiblings.splice(insertionIndex, 0, { id: source.id })

    db.prepare(`
      UPDATE nav_nodes
      SET parent_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND deleted_at IS NULL
    `).run(destinationParentId, source.id)

    const updateOrder = db.prepare(`
      UPDATE nav_nodes
      SET order_index = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND deleted_at IS NULL
    `)
    destinationSiblings.forEach((sibling, index) => {
      updateOrder.run(index + 1, sibling.id)
    })

    if (source.parentId !== destinationParentId) {
      const oldSiblings = getSiblings.all(
        source.parentId,
        source.parentId,
        source.id,
      )
      oldSiblings.forEach((sibling, index) => {
        updateOrder.run(index + 1, sibling.id)
      })
    }

    return {
      id: source.id,
      parentId: destinationParentId,
      order: insertionIndex + 1,
    }
  })

  return dropNode()
}

export function recordActivity(input) {
  const db = getDb()
  const actorUserId = String(input?.actorUserId || '').trim() || null
  const actorName = String(input?.actorName || '').trim() || '팀원'
  const actionType = String(input?.actionType || 'updated').trim()
  const entityType = String(input?.entityType || 'workspace').trim()
  const entityId = String(input?.entityId || '').trim() || null
  const taskId = String(input?.taskId || '').trim() || null
  const title = String(input?.title || '업무 변경').trim()
  const summary = String(input?.summary || '업무 내용이 변경되었습니다.').trim()
  const revision = Number.isInteger(Number(input?.revision))
    ? Number(input.revision)
    : null

  db.prepare(`
    INSERT INTO activity_logs (
      id, revision, actor_user_id, actor_name, action_type, entity_type,
      entity_id, task_id, title, summary
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `activity-${randomUUID()}`,
    revision,
    actorUserId,
    actorName,
    actionType,
    entityType,
    entityId,
    taskId,
    title,
    summary,
  )
}

export function getBriefingData(days = 7, userId = '') {
  const db = getDb()
  const rangeDays = Math.min(31, Math.max(1, Number(days) || 7))
  let changes = db.prepare(`
    SELECT
      activity.id,
      activity.action_type AS actionType,
      activity.entity_type AS entityType,
      activity.entity_id AS entityId,
      activity.task_id AS taskId,
      activity.actor_name AS actorName,
      activity.title,
      activity.summary,
      activity.created_at AS createdAt
    FROM activity_logs AS activity
    WHERE activity.created_at >= datetime('now', '-' || ? || ' days')
    ORDER BY activity.created_at DESC, activity.id DESC
    LIMIT 300
  `).all(rangeDays)

  if (changes.length === 0) {
    changes = db.prepare(`
      SELECT * FROM (
        SELECT
          'legacy-task-' || task_detail.id AS id,
          'updated' AS actionType,
          'task' AS entityType,
          task_detail.id AS entityId,
          nav_node.id AS taskId,
          '팀원' AS actorName,
          nav_node.title AS title,
          'Task 정보가 변경되었습니다.' AS summary,
          task_detail.updated_at AS createdAt
        FROM task_details AS task_detail
        JOIN nav_nodes AS nav_node ON nav_node.id = task_detail.nav_node_id
        WHERE nav_node.deleted_at IS NULL
          AND task_detail.updated_at >= datetime('now', '-' || ? || ' days')

        UNION ALL

        SELECT
          'legacy-subtask-' || sub_task.id,
          CASE WHEN sub_task.created_at = sub_task.updated_at THEN 'created' ELSE 'updated' END,
          'subtask', sub_task.id, nav_node.id, '팀원', sub_task.title,
          CASE WHEN sub_task.completed = 1
            THEN 'Sub Task가 완료되었습니다.'
            ELSE 'Sub Task가 생성되거나 변경되었습니다.' END,
          sub_task.updated_at
        FROM sub_tasks AS sub_task
        JOIN task_details AS task_detail ON task_detail.id = sub_task.task_detail_id
        JOIN nav_nodes AS nav_node ON nav_node.id = task_detail.nav_node_id
        WHERE nav_node.deleted_at IS NULL
          AND sub_task.updated_at >= datetime('now', '-' || ? || ' days')

        UNION ALL

        SELECT
          'legacy-comment-' || comment.id, 'commented', 'comment', comment.id,
          nav_node.id, author.name, nav_node.title,
          CASE WHEN comment.is_deleted = 1 THEN '댓글이 삭제되었습니다.'
            ELSE '댓글이 등록되거나 수정되었습니다.' END,
          comment.updated_at
        FROM comments AS comment
        JOIN users AS author ON author.id = comment.author_user_id
        JOIN task_details AS task_detail ON task_detail.id = comment.task_detail_id
        JOIN nav_nodes AS nav_node ON nav_node.id = task_detail.nav_node_id
        WHERE nav_node.deleted_at IS NULL
          AND comment.updated_at >= datetime('now', '-' || ? || ' days')

        UNION ALL

        SELECT
          'legacy-attachment-' || attachment.id, 'attached', 'attachment',
          attachment.id, nav_node.id, COALESCE(uploader.name, '팀원'),
          nav_node.title, attachment.original_name || ' 파일이 첨부되었습니다.',
          attachment.created_at
        FROM attachments AS attachment
        LEFT JOIN users AS uploader ON uploader.id = attachment.uploaded_by_user_id
        JOIN task_details AS task_detail ON task_detail.id = attachment.task_detail_id
        JOIN nav_nodes AS nav_node ON nav_node.id = task_detail.nav_node_id
        WHERE nav_node.deleted_at IS NULL
          AND attachment.created_at >= datetime('now', '-' || ? || ' days')
      )
      ORDER BY createdAt DESC, id DESC
      LIMIT 300
    `).all(rangeDays, rangeDays, rangeDays, rangeDays)
  }

  const dueItems = db.prepare(`
    SELECT * FROM (
      SELECT
        nav_node.id AS id,
        nav_node.id AS taskId,
        'task' AS itemType,
        nav_node.title,
        COALESCE(parent.title, '최상위 Task') AS projectTitle,
        COALESCE(task_detail.due_date, '') AS dueDate,
        task_detail.completed AS completed,
        COALESCE((
          SELECT GROUP_CONCAT(assignee_name.name, ', ')
          FROM (
            SELECT user.name
            FROM task_assignees AS task_assignee
            JOIN users AS user ON user.id = task_assignee.user_id
            WHERE task_assignee.task_detail_id = task_detail.id
            ORDER BY task_assignee.order_index, task_assignee.created_at, user.id
          ) AS assignee_name
        ), '') AS assignee
      FROM task_details AS task_detail
      JOIN nav_nodes AS nav_node ON nav_node.id = task_detail.nav_node_id
      LEFT JOIN nav_nodes AS parent ON parent.id = nav_node.parent_id
      WHERE nav_node.deleted_at IS NULL
        AND task_detail.due_date IS NOT NULL
        AND date(task_detail.due_date) BETWEEN date('now', 'localtime', '-' || ? || ' days')
          AND date('now', 'localtime', '+' || ? || ' days')

      UNION ALL

      SELECT
        sub_task.id,
        nav_node.id,
        'subtask',
        sub_task.title,
        nav_node.title,
        COALESCE(sub_task.due_date, ''),
        sub_task.completed,
        COALESCE((
          SELECT GROUP_CONCAT(assignee_name.name, ', ')
          FROM (
            SELECT user.name
            FROM sub_task_assignees AS link
            JOIN users AS user ON user.id = link.user_id
            WHERE link.sub_task_id = sub_task.id
            ORDER BY link.order_index, link.created_at, user.id
          ) AS assignee_name
        ), '')
      FROM sub_tasks AS sub_task
      JOIN task_details AS task_detail ON task_detail.id = sub_task.task_detail_id
      JOIN nav_nodes AS nav_node ON nav_node.id = task_detail.nav_node_id
      WHERE nav_node.deleted_at IS NULL
        AND sub_task.due_date IS NOT NULL
        AND sub_task.completed = 0
        AND date(sub_task.due_date) BETWEEN date('now', 'localtime', '-' || ? || ' days')
          AND date('now', 'localtime', '+' || ? || ' days')
    )
    ORDER BY dueDate, completed, itemType, title COLLATE NOCASE, id
  `).all(rangeDays, rangeDays, rangeDays, rangeDays).map((item) => ({
    ...item,
    completed: Boolean(item.completed),
  }))

  const belongsToUser = db.prepare(`
    SELECT 1 AS matched
    FROM nav_nodes AS nav_node
    JOIN task_details AS task_detail ON task_detail.nav_node_id = nav_node.id
    WHERE nav_node.id = ? AND (
      nav_node.owner_user_id = ?
      OR EXISTS (
        SELECT 1 FROM task_assignees
        WHERE task_detail_id = task_detail.id AND user_id = ?
      )
      OR EXISTS (
        SELECT 1
        FROM sub_tasks AS sub_task
        JOIN sub_task_assignees AS link ON link.sub_task_id = sub_task.id
        WHERE sub_task.task_detail_id = task_detail.id AND link.user_id = ?
      )
    )
    LIMIT 1
  `)
  const markMine = (item) => ({
    ...item,
    isMine: Boolean(
      userId && item.taskId && belongsToUser.get(item.taskId, userId, userId, userId),
    ),
  })

  return {
    generatedAt: new Date().toISOString(),
    days: rangeDays,
    changes: changes.map(markMine),
    dueItems: dueItems.map(markMine),
  }
}
