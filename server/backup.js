import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDb, initializeDb } from '../apps/desktop/electron/db.js'

const serverDirectory = path.dirname(fileURLToPath(import.meta.url))
const backupRoot = path.resolve(
  process.env.TODO_BACKUP_PATH || path.join(serverDirectory, 'backups'),
)
const uploadsDirectory = path.resolve(
  process.env.TODO_UPLOADS_PATH || path.join(serverDirectory, 'uploads'),
)
const retentionCount = Math.max(
  1,
  Number(process.env.TODO_BACKUP_RETENTION || 14),
)

function createTimestamp() {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
  ].join('-') + '_' + [
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('-')
}

let database

async function runBackup() {
  initializeDb()
  database = getDb()
  await mkdir(backupRoot, { recursive: true })

  const destination = path.join(backupRoot, createTimestamp())
  await mkdir(destination, { recursive: false })
  await database.backup(path.join(destination, 'todo_app.db'))

  await cp(uploadsDirectory, path.join(destination, 'uploads'), {
    recursive: true,
    force: false,
  }).catch((error) => {
    if (error.code !== 'ENOENT') throw error
  })

  await writeFile(
    path.join(destination, 'backup-info.json'),
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        databasePath: process.env.TODO_DATABASE_PATH || 'default',
        uploadsPath: uploadsDirectory,
      },
      null,
      2,
    ),
    'utf8',
  )

  const entries = (await readdir(backupRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse()

  await Promise.all(
    entries.slice(retentionCount).map((name) =>
      rm(path.join(backupRoot, name), { recursive: true, force: true }),
    ),
  )

  console.log(`[Backup] Completed: ${destination}`)
}

runBackup()
  .catch((error) => {
    console.error('[Backup] Failed:', error)
    process.exitCode = 1
  })
  .finally(() => {
    if (database?.open) database.close()
  })
