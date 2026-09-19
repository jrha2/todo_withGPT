import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  powerMonitor,
  screen,
  shell,
  Tray,
} from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Holidays from 'date-holidays'
import electronUpdater from 'electron-updater'
import {
  copyNavigationOnServer,
  bulkUpdateTasksOnServer,
  createCommentOnServer,
  createFolderOnServer,
  createMemoOnServer,
  createSubTaskOnServer,
  createTaskOnServer,
  createUserOnServer,
  signupOnServer,
  updateOwnProfileOnServer,
  changeOwnPasswordOnServer,
  getPendingUsersFromServer,
  approveUserOnServer,
  rejectUserOnServer,
  deleteUserOnServer,
  deleteCommentOnServer,
  deleteNavigationOnServer,
  deleteMemoOnServer,
  deleteSubTaskOnServer,
  dismissReminderOnServer,
  downloadAttachmentFromServer,
  dropNavigationOnServer,
  getAssigneesFromServer,
  getCommentsFromServer,
  getDueRemindersFromServer,
  getBriefingFromServer,
  getMemoFromServer,
  getMemosFromServer,
  getNavigationFromServer,
  getTrashFromServer,
  getWorkspaceTasksFromServer,
  getServerSession,
  getSyncStateFromServer,
  getServerUrl,
  getSubTasksFromServer,
  getTaskFromServer,
  getUsersFromServer,
  getUserReferencesFromServer,
  loginToServer,
  logoutFromServer,
  moveNavigationOnServer,
  permanentlyDeleteNavigationOnServer,
  restoreNavigationOnServer,
  renameNavigationOnServer,
  reorderNavigationOnServer,
  reorderSubTasksOnServer,
  saveMemoOnServer,
  completeReminderOnServer,
  setServerUrl,
  setAcknowledgedSyncRevision,
  getAcknowledgedSyncRevision,
  setTaskFavoriteOnServer,
  setSyncRequestContext,
  setNavigationExpandedOnServer,
  setAllNavigationExpandedOnServer,
  toggleSubTaskOnServer,
  toggleTaskOnServer,
  touchTaskRecentOnServer,
  snoozeReminderOnServer,
  uploadAttachmentToServer,
  updateCommentOnServer,
  updateMemoOnServer,
  updateSubTaskOnServer,
  updateTaskOnServer,
  updateUserOnServer,
  streamSyncEventsFromServer,
} from './server-api.js'

const { autoUpdater } = electronUpdater

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const startedHidden = process.argv.includes('--hidden')
const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
}

let mainWindow = null
let reminderWindow = null
let dailyBriefingWindow = null
let tray = null
let isQuitting = false
let reminderCheckRunning = false
let reminderCheckTimer = null
let dailyBriefingCheckTimer = null
let dailyBriefingScheduleTimer = null
let dailyBriefingTopmostTimer = null
let isScreenLocked = false
let saveBoundsTimer = null
let currentUser = null
let currentAuthToken = null
let syncAbortController = null

// One-time server relocation (old on-prem server -> new Tailscale HTTPS server).
// On startup, if the saved server address matches an OLD address, it is replaced
// with SERVER_MIGRATION.to and the saved session token is dropped so the user
// re-logs in against the new server. Env override (TODO_SERVER_URL) is respected
// and takes precedence, so this only affects clients that stored an old address.
const SERVER_MIGRATION = {
  from: ['http://130.1.14.61:4310', 'http://127.0.0.1:4310'],
  to: 'https://home-desktop.tailf5d646.ts.net:10000',
}
let serverMigrationNotice = null
let pendingSyncEvent = null
let latestServerRevision = 0
let syncStatus = {
  phase: 'offline',
  latestRevision: 0,
  acknowledgedRevision: 0,
  pendingRevision: null,
  lastConnectedAt: null,
  lastSyncedAt: null,
  lastError: null,
}
const syncClientId = randomUUID()
const activeReminders = new Map()
const koreanHolidays = new Holidays('KR')
koreanHolidays.setTimezone('Asia/Seoul')

app.setAppUserModelId('com.jrha2.investmentplanningteamworkspace')
setSyncRequestContext(syncClientId, 0)

let updatePromptOpen = false
let updateDownloadStarted = false
let updateCheckRunning = false

function getUpdateFeedUrl() {
  return `${getServerUrl().replace(/\/$/, '')}/updates`
}

function setUpdateFeed() {
  if (!app.isPackaged) return
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: getUpdateFeedUrl(),
    useMultipleRangeRequest: false,
  })
}

async function checkForAppUpdate() {
  if (
    !app.isPackaged ||
    updatePromptOpen ||
    updateDownloadStarted ||
    updateCheckRunning
  ) return

  updateCheckRunning = true
  try {
    setUpdateFeed()
    await autoUpdater.checkForUpdates()
  } catch (error) {
    console.error('[Update] Failed to check for updates:', error)
  } finally {
    updateCheckRunning = false
  }
}

function configureAutoUpdater() {
  if (!app.isPackaged) return

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = app.getVersion().includes('-')
  autoUpdater.channel = app.getVersion().includes('-beta') ? 'beta' : 'latest'
  setUpdateFeed()

  autoUpdater.on('update-available', async (info) => {
    if (updatePromptOpen || updateDownloadStarted) return
    updatePromptOpen = true

    const result = await dialog.showMessageBox(mainWindow || undefined, {
      type: 'info',
      title: '새 버전 업데이트',
      message: `새 버전 ${info.version}이 준비되었습니다.`,
      detail: '지금 다운로드하면 완료 후 앱을 재시작하여 자동으로 설치할 수 있습니다.',
      buttons: ['지금 업데이트', '나중에'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    })

    updatePromptOpen = false
    if (result.response !== 0) return

    updateDownloadStarted = true
    try {
      await autoUpdater.downloadUpdate()
    } catch (error) {
      updateDownloadStarted = false
      console.error('[Update] Failed to download update:', error)
      await dialog.showMessageBox(mainWindow || undefined, {
        type: 'error',
        title: '업데이트 다운로드 실패',
        message: '업데이트 파일을 내려받지 못했습니다.',
        detail: '서버 연결을 확인한 뒤 앱을 다시 실행해 주세요.',
        buttons: ['확인'],
      })
    }
  })

  autoUpdater.on('download-progress', (progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setProgressBar(Math.max(0, Math.min(1, progress.percent / 100)))
    }
  })

  autoUpdater.on('update-downloaded', async (info) => {
    updateDownloadStarted = false
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setProgressBar(-1)
    }

    const result = await dialog.showMessageBox(mainWindow || undefined, {
      type: 'info',
      title: '업데이트 준비 완료',
      message: `버전 ${info.version} 다운로드가 완료되었습니다.`,
      detail: '지금 앱을 재시작하면 업데이트가 자동으로 설치됩니다.',
      buttons: ['재시작하여 설치', '종료할 때 설치'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    })

    if (result.response === 0) {
      isQuitting = true
      autoUpdater.quitAndInstall(false, true)
    }
  })

  autoUpdater.on('update-not-available', () => {
    updatePromptOpen = false
  })

  autoUpdater.on('error', (error) => {
    updatePromptOpen = false
    updateDownloadStarted = false
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setProgressBar(-1)
    }
    console.error('[Update] Auto updater error:', error)
  })

  setTimeout(checkForAppUpdate, 10 * 1000)
}

function getSyncStatus() {
  return {
    ...syncStatus,
    latestRevision: latestServerRevision,
    acknowledgedRevision: getAcknowledgedSyncRevision(),
    pendingRevision: pendingSyncEvent
      ? Number(pendingSyncEvent.revision) || null
      : null,
  }
}

function updateSyncStatus(changes = {}) {
  syncStatus = { ...syncStatus, ...changes }
  const status = getSyncStatus()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('sync:statusChanged', status)
  }
  return status
}

function sendRemoteSyncEvent(event) {
  if (!event || Number(event.revision) <= 0) return
  if (
    !pendingSyncEvent ||
    Number(event.revision) > Number(pendingSyncEvent.revision)
  ) {
    pendingSyncEvent = event
    updateSyncStatus({ phase: 'syncing', lastError: null })
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('sync:remoteChange', pendingSyncEvent)
  }
}

function stopSyncEvents() {
  syncAbortController?.abort()
  syncAbortController = null
}

async function startSyncEvents() {
  stopSyncEvents()
  if (!currentAuthToken) {
    updateSyncStatus({ phase: 'offline' })
    return
  }

  const controller = new AbortController()
  syncAbortController = controller
  const token = currentAuthToken
  updateSyncStatus({ phase: 'connecting', lastError: null })

  while (!controller.signal.aborted && token === currentAuthToken) {
    try {
      updateSyncStatus({ phase: 'connecting', lastError: null })
      const revision = await getSyncStateFromServer(token)
      const acknowledgedRevision = getAcknowledgedSyncRevision()
      latestServerRevision = revision
      if (revision > Number(pendingSyncEvent?.revision || acknowledgedRevision)) {
        sendRemoteSyncEvent({
          revision,
          sourceClientId: '',
          method: 'GET',
          pathname: '/api/sync/state',
          changedAt: new Date().toISOString(),
          kind: 'catch-up',
        })
      } else if (!pendingSyncEvent) {
        setAcknowledgedSyncRevision(revision)
      }
      updateSyncStatus({
        phase: pendingSyncEvent ? 'syncing' : 'synced',
        lastConnectedAt: new Date().toISOString(),
        lastSyncedAt: pendingSyncEvent ? syncStatus.lastSyncedAt : new Date().toISOString(),
        lastError: null,
      })

      await streamSyncEventsFromServer(
        token,
        syncClientId,
        controller.signal,
        (event) => {
          if (event?.kind === 'app-update') {
            void checkForAppUpdate()
            return
          }

          const revision = Number(event?.revision) || 0
          const previousLatestRevision = latestServerRevision
          latestServerRevision = Math.max(latestServerRevision, revision)
          if (event?.kind === 'connected') {
            void checkForAppUpdate()
            updateSyncStatus({
              phase: pendingSyncEvent ? 'syncing' : 'synced',
              lastConnectedAt: new Date().toISOString(),
              lastError: null,
            })
          }
          if (event?.kind === 'connected' && revision <= previousLatestRevision) {
            return
          }
          if (event?.sourceClientId === syncClientId) {
            setAcknowledgedSyncRevision(revision)
            if (!pendingSyncEvent) {
              updateSyncStatus({
                phase: 'synced',
                lastSyncedAt: new Date().toISOString(),
                lastError: null,
              })
            }
            return
          }
          if (revision > 0 && revision > Number(pendingSyncEvent?.revision || 0)) {
            sendRemoteSyncEvent(event)
          } else {
            updateSyncStatus({})
          }
        },
      )
      if (!controller.signal.aborted) {
        updateSyncStatus({ phase: 'offline', lastError: 'SYNC_STREAM_CLOSED' })
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        const code = error instanceof Error ? error.message : String(error)
        console.error('[Sync] Connection failed:', error)
        updateSyncStatus({
          phase: syncStatus.lastConnectedAt ? 'offline' : 'failed',
          lastError: code,
        })
      }
    }
    if (!controller.signal.aborted) {
      await new Promise((resolve) => setTimeout(resolve, 3000))
    }
  }
}

function getAuthSessionPath() {
  return path.join(app.getPath('userData'), 'auth-session.json')
}

async function restoreAuthSession() {
  try {
    const saved = JSON.parse(readFileSync(getAuthSessionPath(), 'utf8'))

    // Server relocation: if the stored address is a known OLD address, switch to
    // the NEW address, drop the old-server session token (invalid on the new
    // server), persist the new address, and force a re-login. Env override wins.
    const savedUrl = String(saved?.serverUrl ?? '').replace(/\/$/, '')
    if (
      !process.env.TODO_SERVER_URL &&
      savedUrl &&
      SERVER_MIGRATION.from.includes(savedUrl)
    ) {
      setServerUrl(SERVER_MIGRATION.to)
      serverMigrationNotice = { from: savedUrl, to: SERVER_MIGRATION.to }
      currentUser = null
      currentAuthToken = null
      // Persist the new address (without a token) so future starts use it.
      saveAuthSession(null)
      return null
    }

    if (!process.env.TODO_SERVER_URL && saved?.serverUrl) {
      setServerUrl(saved.serverUrl)
    }
    const token = String(saved?.token ?? '')

    if (!token) {
      currentUser = null
      currentAuthToken = null
      return null
    }

    currentUser = await getServerSession(token)
    currentAuthToken = token
  } catch {
    currentUser = null
    currentAuthToken = null
  }

  return currentUser
}

function saveAuthSession(user, token = currentAuthToken) {
  currentUser = user
  currentAuthToken = user ? token : null

  try {
    writeFileSync(
      getAuthSessionPath(),
      JSON.stringify(
        user
          ? { token: currentAuthToken, serverUrl: getServerUrl() }
          : { serverUrl: getServerUrl() },
        null,
        2,
      ),
      'utf8',
    )
  } catch (error) {
    console.error('[Auth] Failed to save local login session:', error)
  }
}

function requireAuthenticatedUser() {
  if (!currentUser || !currentAuthToken) {
    throw new Error('AUTH_REQUIRED')
  }

  return currentUser
}

function requireAdminUser() {
  const user = requireAuthenticatedUser()

  if (user.role !== 'admin') {
    throw new Error('ADMIN_REQUIRED')
  }

  return user
}

function formatLocalDateTime(date) {
  const pad = (value) => String(value).padStart(2, '0')
  return (
    date.getFullYear() +
    '-' +
    pad(date.getMonth() + 1) +
    '-' +
    pad(date.getDate()) +
    ' ' +
    pad(date.getHours()) +
    ':' +
    pad(date.getMinutes()) +
    ':' +
    pad(date.getSeconds())
  )
}

function getReminderStatePath() {
  return path.join(app.getPath('userData'), 'reminder-window-state.json')
}

function readReminderBounds() {
  try {
    return JSON.parse(readFileSync(getReminderStatePath(), 'utf8'))
  } catch {
    return null
  }
}

function getVisibleReminderBounds() {
  const saved = readReminderBounds()
  const primaryWorkArea = screen.getPrimaryDisplay().workArea
  const width = Math.min(
    Math.max(Number(saved?.width) || 520, 420),
    primaryWorkArea.width,
  )
  const height = Math.min(
    Math.max(Number(saved?.height) || 420, 300),
    primaryWorkArea.height,
  )
  const savedX = Number(saved?.x)
  const savedY = Number(saved?.y)
  const savedIsVisible = Number.isFinite(savedX) && Number.isFinite(savedY)
    ? screen.getAllDisplays().some((display) => {
        const area = display.workArea
        return (
          savedX + width > area.x + 80 &&
          savedX < area.x + area.width - 80 &&
          savedY + height > area.y + 50 &&
          savedY < area.y + area.height - 50
        )
      })
    : false

  if (savedIsVisible) {
    return { x: savedX, y: savedY, width, height }
  }

  return {
    x: Math.round(primaryWorkArea.x + (primaryWorkArea.width - width) / 2),
    y: Math.round(primaryWorkArea.y + (primaryWorkArea.height - height) / 2),
    width,
    height,
  }
}

function saveReminderBounds() {
  if (!reminderWindow || reminderWindow.isDestroyed()) {
    return
  }

  try {
    writeFileSync(
      getReminderStatePath(),
      JSON.stringify(reminderWindow.getBounds(), null, 2),
      'utf8',
    )
  } catch (error) {
    console.error('[Reminder] Failed to save window bounds:', error)
  }
}

function scheduleReminderBoundsSave() {
  clearTimeout(saveBoundsTimer)
  saveBoundsTimer = setTimeout(saveReminderBounds, 250)
}

function showMainWindow(taskId = null, view = null) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow(true)
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }

  mainWindow.show()
  mainWindow.focus()

  if (taskId) {
    mainWindow.webContents.send('app:selectTask', taskId)
  } else if (view === 'briefing') {
    mainWindow.webContents.send('app:openBriefing')
  }
}

if (hasSingleInstanceLock) {
  app.on('second-instance', () => showMainWindow())
}

function createMainWindow(showOnReady = true) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 1000,
    minWidth: 960,
    minHeight: 1000,
    show: showOnReady,
    backgroundColor: '#f3f4f6',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  } else {
    mainWindow.loadURL('http://localhost:5173')
  }

  mainWindow.once('ready-to-show', () => {
    if (showOnReady && !mainWindow.isVisible()) {
      mainWindow.show()
    }
  })

  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedUrl) => {
      console.error(
        '[Window] Failed to load:',
        errorCode,
        errorDescription,
        validatedUrl,
      )
    },
  )

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  return mainWindow
}

function createTrayIcon() {
  const trayIconPath = path.join(app.getAppPath(), 'build', 'tray-icon.png')
  const trayIcon = nativeImage.createFromPath(trayIconPath)
  if (!trayIcon.isEmpty()) {
    return trayIcon
  }

  console.error(`[Tray] Failed to load tray icon: ${trayIconPath}`)
  const fallbackSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">' +
    '<rect x="2" y="2" width="28" height="28" rx="7" fill="#07343a" stroke="#2dd4e8" stroke-width="2"/>' +
    '<path d="M9 16l5 5 10-11" fill="none" stroke="white" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>'
  const fallbackUrl =
    'data:image/svg+xml;base64,' +
    Buffer.from(fallbackSvg).toString('base64')
  const fallbackIcon = nativeImage.createFromDataURL(fallbackUrl)
  if (fallbackIcon.isEmpty()) {
    throw new Error('Tray icon and its fallback could not be loaded.')
  }
  return fallbackIcon
}

function createTray() {
  tray = new Tray(createTrayIcon())
  tray.setToolTip('투자기획팀 업무관리 공간')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: '업무관리 공간 열기',
        click: () => showMainWindow(),
      },
      {
        label: 'To Do Briefing 열기',
        click: () => showMainWindow(null, 'briefing'),
      },
      {
        label: '알림창 열기',
        click: async () => {
          await showReminderWindow(false)
        },
      },
      { type: 'separator' },
      {
        label: '종료',
        click: () => {
          isQuitting = true
          app.quit()
        },
      },
    ]),
  )
  tray.on('double-click', () => showMainWindow())
}

function formatLocalDate(date) {
  const pad = (value) => String(value).padStart(2, '0')
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-')
}

function getDailyBriefingStatePath() {
  return path.join(app.getPath('userData'), 'daily-briefing-state.json')
}

function readDailyBriefingState() {
  try {
    return JSON.parse(readFileSync(getDailyBriefingStatePath(), 'utf8'))
  } catch {
    return {}
  }
}

function markDailyBriefingShown(date) {
  try {
    const currentState = readDailyBriefingState()
    const userKey = currentUser?.id || 'anonymous'
    writeFileSync(
      getDailyBriefingStatePath(),
      JSON.stringify({
        ...currentState,
        lastShownByUser: {
          ...(currentState.lastShownByUser || {}),
          [userKey]: formatLocalDate(date),
        },
      }, null, 2),
      'utf8',
    )
  } catch (error) {
    console.error('[Briefing] Failed to save popup state:', error)
  }
}

function isKoreanBusinessDay(date) {
  const day = date.getDay()
  if (day === 0 || day === 6) return false
  const holidays = koreanHolidays.isHoliday(date)
  return !holidays || !holidays.some((holiday) => holiday.type === 'public')
}

async function createDailyBriefingWindow() {
  const workArea = screen.getPrimaryDisplay().workArea
  const width = Math.min(920, workArea.width)
  const height = Math.min(620, workArea.height)
  dailyBriefingWindow = new BrowserWindow({
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2),
    width,
    height,
    minWidth: 760,
    minHeight: 520,
    show: false,
    skipTaskbar: false,
    alwaysOnTop: false,
    autoHideMenuBar: true,
    title: '투자기획팀 업무관리 공간 - To Do Briefing',
    backgroundColor: '#edf2f3',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  dailyBriefingWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      dailyBriefingWindow.hide()
      dailyBriefingWindow.flashFrame(false)
    }
  })
  dailyBriefingWindow.on('closed', () => {
    dailyBriefingWindow = null
  })
  await dailyBriefingWindow.loadFile(path.join(__dirname, 'briefing.html'))
  return dailyBriefingWindow
}

async function showDailyBriefingWindow(playAlert = true) {
  if (!currentUser || isScreenLocked) return false
  if (!dailyBriefingWindow || dailyBriefingWindow.isDestroyed()) {
    await createDailyBriefingWindow()
  } else {
    await dailyBriefingWindow.reload()
  }

  clearTimeout(dailyBriefingTopmostTimer)
  dailyBriefingWindow.setAlwaysOnTop(true, 'floating')
  dailyBriefingWindow.show()
  dailyBriefingWindow.moveTop()
  dailyBriefingWindow.focus()
  dailyBriefingWindow.flashFrame(true)
  dailyBriefingTopmostTimer = setTimeout(() => {
    if (dailyBriefingWindow && !dailyBriefingWindow.isDestroyed()) {
      dailyBriefingWindow.setAlwaysOnTop(false)
    }
  }, 10 * 1000)

  if (playAlert) shell.beep()
  return true
}

async function checkDailyBriefing() {
  try {
    if (isScreenLocked) return
    if (!currentUser) {
      await restoreAuthSession()
    }
    if (!currentUser || isScreenLocked) return

    const now = new Date()
    if (!isKoreanBusinessDay(now) || now.getHours() < 8) return
    const today = formatLocalDate(now)
    const state = readDailyBriefingState()
    const userKey = currentUser.id
    if (state.lastShownByUser?.[userKey] === today) return

    const wasShown = await showDailyBriefingWindow(true)
    if (wasShown) {
      markDailyBriefingShown(now)
    }
  } catch (error) {
    console.error('[Briefing] Failed to show daily popup:', error)
  }
}

function handleScreenLock() {
  isScreenLocked = true
}

function checkDailyBriefingAfterUnlock() {
  setTimeout(checkDailyBriefing, 1000)
}

function handleScreenUnlock() {
  isScreenLocked = false
  checkDailyBriefingAfterUnlock()
}

function handleSystemResume() {
  if (!isScreenLocked) {
    checkDailyBriefingAfterUnlock()
  }
}

function scheduleNextDailyBriefingCheck() {
  clearTimeout(dailyBriefingScheduleTimer)
  const now = new Date()
  const next = new Date(now)
  next.setHours(8, 0, 2, 0)
  if (next <= now) next.setDate(next.getDate() + 1)
  dailyBriefingScheduleTimer = setTimeout(async () => {
    await checkDailyBriefing()
    scheduleNextDailyBriefingCheck()
  }, Math.max(1000, next.getTime() - now.getTime()))
}

function sendReminderItems() {
  if (!reminderWindow || reminderWindow.isDestroyed()) {
    return
  }

  reminderWindow.webContents.send(
    'reminder:items',
    Array.from(activeReminders.values()),
  )
}

async function createReminderWindow() {
  reminderWindow = new BrowserWindow({
    ...getVisibleReminderBounds(),
    minWidth: 420,
    minHeight: 300,
    show: false,
    skipTaskbar: false,
    alwaysOnTop: false,
    autoHideMenuBar: true,
    title: '투자기획팀 업무관리 공간 - 미리 알림',
    backgroundColor: '#f5f6fb',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  reminderWindow.on('move', scheduleReminderBoundsSave)
  reminderWindow.on('resize', scheduleReminderBoundsSave)
  reminderWindow.on('close', (event) => {
    saveReminderBounds()

    if (!isQuitting) {
      event.preventDefault()
      reminderWindow.hide()
      reminderWindow.flashFrame(false)
    }
  })
  reminderWindow.on('closed', () => {
    reminderWindow = null
  })

  await reminderWindow.loadFile(path.join(__dirname, 'reminder.html'))
  sendReminderItems()
  return reminderWindow
}

async function showReminderWindow(playAlert = true) {
  if (!reminderWindow || reminderWindow.isDestroyed()) {
    await createReminderWindow()
  }

  sendReminderItems()
  reminderWindow.showInactive()
  reminderWindow.flashFrame(true)

  if (playAlert) {
    shell.beep()
  }
}

function removeActiveReminder(reminderId) {
  activeReminders.delete(reminderId)
  sendReminderItems()

  if (
    activeReminders.size === 0 &&
    reminderWindow &&
    !reminderWindow.isDestroyed()
  ) {
    reminderWindow.flashFrame(false)
    reminderWindow.hide()
  }
}

function removeActiveRemindersForTask(taskId) {
  Array.from(activeReminders.values())
    .filter((reminder) => reminder.taskId === taskId)
    .forEach((reminder) => activeReminders.delete(reminder.id))
  sendReminderItems()

  if (
    activeReminders.size === 0 &&
    reminderWindow &&
    !reminderWindow.isDestroyed()
  ) {
    reminderWindow.flashFrame(false)
    reminderWindow.hide()
  }
}

function sendTaskUpdated(task) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  mainWindow.webContents.send('app:taskUpdated', {
    taskId: task.navNodeId ?? task.taskId,
    completed: task.completed,
  })
}

async function checkDueReminders() {
  if (reminderCheckRunning || !currentUser) {
    return
  }

  reminderCheckRunning = true

  try {
    const dueReminders = await getDueRemindersFromServer(
      currentAuthToken,
      formatLocalDateTime(new Date()),
    )
    const newReminders = dueReminders.filter(
      (reminder) => !activeReminders.has(reminder.id),
    )

    const dueReminderIds = new Set(dueReminders.map((reminder) => reminder.id))
    Array.from(activeReminders.keys()).forEach((reminderId) => {
      if (!dueReminderIds.has(reminderId)) {
        activeReminders.delete(reminderId)
      }
    })

    dueReminders.forEach((reminder) => {
      activeReminders.set(reminder.id, reminder)
    })

    sendReminderItems()

    if (
      activeReminders.size === 0 &&
      reminderWindow &&
      !reminderWindow.isDestroyed()
    ) {
      reminderWindow.flashFrame(false)
      reminderWindow.hide()
    }

    if (newReminders.length > 0) {
      await showReminderWindow(true)
    }
  } catch (error) {
    console.error('[Reminder] Failed to check reminders:', error)
  } finally {
    reminderCheckRunning = false
  }
}

function registerIpcHandlers() {
  ipcMain.handle('auth:getServerUrl', () => getServerUrl())
  // One-time server-relocation notice; cleared after the renderer reads it so
  // the banner shows only once after the automatic switch.
  ipcMain.handle('auth:getServerMigrationNotice', () => {
    const notice = serverMigrationNotice
    serverMigrationNotice = null
    return notice
  })
  ipcMain.handle('auth:setServerUrl', (_event, serverUrl) => {
    const value = setServerUrl(serverUrl)
    saveAuthSession(null)
    setUpdateFeed()
    setTimeout(checkForAppUpdate, 500)
    return { serverUrl: value }
  })
  ipcMain.handle('auth:getSession', () => currentUser)
  ipcMain.handle('auth:login', async (_event, payload) => {
    try {
      const result = await loginToServer(payload.loginId, payload.password)
      saveAuthSession(result.user, result.token)
      startSyncEvents()
      setTimeout(checkDueReminders, 200)
      setTimeout(checkDailyBriefing, 400)
      return { success: true, user: result.user }
    } catch (error) {
      const code = error instanceof Error ? error.message : String(error)
      console.error('[Auth] Login failed:', code)
      return { success: false, code }
    }
  })
  ipcMain.handle('auth:logout', async () => {
    if (currentAuthToken) {
      try {
        await logoutFromServer(currentAuthToken)
      } catch (error) {
        console.error('[Auth] Server logout failed:', error)
      }
    }

    stopSyncEvents()
    pendingSyncEvent = null
    latestServerRevision = 0
    setAcknowledgedSyncRevision(0)
    updateSyncStatus({
      phase: 'offline',
      lastConnectedAt: null,
      lastSyncedAt: null,
      lastError: null,
    })
    saveAuthSession(null)
    activeReminders.clear()
    sendReminderItems()

    if (reminderWindow && !reminderWindow.isDestroyed()) {
      reminderWindow.hide()
    }
    if (dailyBriefingWindow && !dailyBriefingWindow.isDestroyed()) {
      dailyBriefingWindow.hide()
    }

    return { success: true }
  })

  // Self-service signup (no auth required). Uses the current server URL.
  ipcMain.handle('auth:signup', async (_event, payload) => {
    try {
      const result = await signupOnServer(payload)
      return { success: true, result }
    } catch (error) {
      const code = error instanceof Error ? error.message : String(error)
      console.error('[Auth] Signup failed:', code)
      return { success: false, code }
    }
  })

  // Self-service: current user updates their own profile / password.
  ipcMain.handle('me:updateProfile', async (_event, payload) => {
    const user = requireAuthenticatedUser()
    const updated = await updateOwnProfileOnServer(currentAuthToken, payload)
    if (updated.id === user.id) {
      saveAuthSession(updated)
    }
    return updated
  })
  ipcMain.handle('me:changePassword', async (_event, payload) => {
    requireAuthenticatedUser()
    return changeOwnPasswordOnServer(
      currentAuthToken,
      payload.currentPassword,
      payload.newPassword,
    )
  })

  ipcMain.handle('sync:getState', () => {
    requireAuthenticatedUser()
    return {
      pendingEvent: pendingSyncEvent,
      latestRevision: latestServerRevision,
      status: getSyncStatus(),
    }
  })
  ipcMain.handle('sync:getStatus', () => {
    requireAuthenticatedUser()
    return getSyncStatus()
  })
  ipcMain.handle('sync:retry', () => {
    requireAuthenticatedUser()
    void startSyncEvents()
    return getSyncStatus()
  })
  ipcMain.handle('sync:acknowledge', (_event, revision) => {
    requireAuthenticatedUser()
    const value = Math.min(
      latestServerRevision,
      Math.max(0, Number(revision) || 0),
    )
    setAcknowledgedSyncRevision(value)
    if (pendingSyncEvent && Number(pendingSyncEvent.revision) <= value) {
      pendingSyncEvent = null
    }
    updateSyncStatus({
      phase: pendingSyncEvent ? 'syncing' : 'synced',
      lastSyncedAt: pendingSyncEvent ? syncStatus.lastSyncedAt : new Date().toISOString(),
      lastError: null,
    })
    return { revision: value, status: getSyncStatus() }
  })

  ipcMain.handle('admin:getUsers', async () => {
    requireAdminUser()
    return getUsersFromServer(currentAuthToken)
  })
  ipcMain.handle('admin:createUser', async (_event, payload) => {
    requireAdminUser()
    return createUserOnServer(currentAuthToken, payload)
  })
  ipcMain.handle('admin:updateUser', async (_event, payload) => {
    const admin = requireAdminUser()
    const updated = await updateUserOnServer(
      currentAuthToken,
      payload.userId,
      payload.changes,
    )

    if (updated.id === admin.id) {
      saveAuthSession(updated)
    }

    return updated
  })
  ipcMain.handle('admin:deleteUser', async (_event, userId) => {
    const admin = requireAdminUser()
    if (admin.id === userId) {
      throw new Error('ADMIN_CANNOT_DELETE_SELF')
    }
    return deleteUserOnServer(currentAuthToken, userId)
  })
  ipcMain.handle('admin:getUserReferences', async (_event, userId) => {
    requireAdminUser()
    return getUserReferencesFromServer(currentAuthToken, userId)
  })
  ipcMain.handle('admin:getPendingUsers', async () => {
    requireAdminUser()
    return getPendingUsersFromServer(currentAuthToken)
  })
  ipcMain.handle('admin:approveUser', async (_event, userId) => {
    requireAdminUser()
    return approveUserOnServer(currentAuthToken, userId)
  })
  ipcMain.handle('admin:rejectUser', async (_event, userId) => {
    requireAdminUser()
    return rejectUserOnServer(currentAuthToken, userId)
  })

  const handleAuthenticated = (channel, listener) => {
    ipcMain.handle(channel, async (event, ...args) => {
      requireAuthenticatedUser()
      try {
        return await listener(event, ...args)
      } catch (error) {
        const code = error instanceof Error ? error.message : String(error)
        if (code === 'SYNC_CONFLICT') {
          try {
            latestServerRevision = await getSyncStateFromServer(currentAuthToken)
          } catch {}
          sendRemoteSyncEvent({
            revision: latestServerRevision,
            sourceClientId: '',
            method: 'CONFLICT',
            pathname: '',
            changedAt: new Date().toISOString(),
            kind: 'conflict',
          })
        }
        throw error
      }
    })
  }

  handleAuthenticated('navigation:getTree', (_event, options = {}) =>
    getNavigationFromServer(currentAuthToken, options),
  )
  handleAuthenticated('navigation:getTrash', () =>
    getTrashFromServer(currentAuthToken),
  )
  handleAuthenticated('navigation:restoreNode', (_event, nodeId) =>
    restoreNavigationOnServer(currentAuthToken, nodeId),
  )
  handleAuthenticated('navigation:permanentlyDeleteNode', (_event, nodeId) =>
    permanentlyDeleteNavigationOnServer(currentAuthToken, nodeId),
  )
  handleAuthenticated('briefing:getData', (_event, days) =>
    getBriefingFromServer(currentAuthToken, days),
  )
  handleAuthenticated('briefing:openMain', () => {
    showMainWindow(null, 'briefing')
    if (dailyBriefingWindow && !dailyBriefingWindow.isDestroyed()) {
      dailyBriefingWindow.hide()
      dailyBriefingWindow.flashFrame(false)
    }
    return { opened: true }
  })
  handleAuthenticated('briefing:hideWindow', () => {
    if (dailyBriefingWindow && !dailyBriefingWindow.isDestroyed()) {
      dailyBriefingWindow.hide()
      dailyBriefingWindow.flashFrame(false)
    }
    return { hidden: true }
  })
  handleAuthenticated('navigation:createFolder', (_event, payload) =>
    createFolderOnServer(
      currentAuthToken,
      payload.title,
      payload.parentId ?? null,
    ),
  )
  handleAuthenticated('navigation:createTask', (_event, payload) =>
    createTaskOnServer(
      currentAuthToken,
      payload.title,
      payload.parentId ?? null,
    ),
  )
  handleAuthenticated('navigation:renameNode', (_event, payload) =>
    renameNavigationOnServer(currentAuthToken, payload.nodeId, payload.title),
  )
  handleAuthenticated('navigation:deleteNode', (_event, nodeId) =>
    deleteNavigationOnServer(currentAuthToken, nodeId),
  )
  handleAuthenticated('navigation:moveNode', (_event, payload) =>
    moveNavigationOnServer(
      currentAuthToken,
      payload.nodeId,
      payload.targetFolderId ?? null,
    ),
  )
  handleAuthenticated('navigation:copyNode', (_event, payload) =>
    copyNavigationOnServer(
      currentAuthToken,
      payload.nodeId,
      payload.targetFolderId ?? null,
    ),
  )
  handleAuthenticated('navigation:reorderNode', (_event, payload) =>
    reorderNavigationOnServer(
      currentAuthToken,
      payload.nodeId,
      payload.direction,
    ),
  )
  handleAuthenticated('navigation:dropNode', (_event, payload) =>
    dropNavigationOnServer(
      currentAuthToken,
      payload.nodeId,
      payload.targetNodeId,
      payload.position,
    ),
  )
  handleAuthenticated('navigation:setExpanded', (_event, payload) =>
    setNavigationExpandedOnServer(
      currentAuthToken,
      payload.nodeId,
      payload.expanded,
    ),
  )
  handleAuthenticated('navigation:setAllExpanded', (_event, payload) =>
    setAllNavigationExpandedOnServer(currentAuthToken, payload.expanded),
  )

  handleAuthenticated('workspace:getTasks', (_event, payload = {}) =>
    getWorkspaceTasksFromServer(
      currentAuthToken,
      payload.view,
      payload.scope,
    ),
  )

  handleAuthenticated('task:getDetail', (_event, taskId) =>
    getTaskFromServer(currentAuthToken, taskId),
  )
  handleAuthenticated('task:toggleCompleted', async (_event, taskId) => {
    const detail = await toggleTaskOnServer(currentAuthToken, taskId)

    if (detail.completed) {
      removeActiveRemindersForTask(taskId)
    }

    sendTaskUpdated(detail)

    return detail
  })
  handleAuthenticated('task:updateDetail', async (_event, payload) => {
    const detail = await updateTaskOnServer(
      currentAuthToken,
      payload.taskId,
      payload.changes,
    )

    Array.from(activeReminders.values())
      .filter((reminder) => reminder.taskId === payload.taskId)
      .forEach((reminder) => {
        if (reminder.remindAt !== detail.alarm) {
          activeReminders.delete(reminder.id)
          return
        }

        activeReminders.set(reminder.id, {
          ...reminder,
          title: detail.title,
          description: detail.description,
          dueDate: detail.dueDate,
          assignee: detail.assignee,
        })
      })
    sendReminderItems()

    if (
      activeReminders.size === 0 &&
      reminderWindow &&
      !reminderWindow.isDestroyed()
    ) {
      reminderWindow.flashFrame(false)
      reminderWindow.hide()
    }

    return detail
  })

  handleAuthenticated('task:bulkUpdate', async (_event, payload) => {
    const tasks = await bulkUpdateTasksOnServer(
      currentAuthToken,
      payload.taskIds,
      payload.changes,
    )
    tasks.forEach((task) => {
      if (task.completed) removeActiveRemindersForTask(task.taskId)
      sendTaskUpdated(task)
    })
    return tasks
  })
  handleAuthenticated('task:setFavorite', (_event, payload) =>
    setTaskFavoriteOnServer(
      currentAuthToken,
      payload.taskId,
      payload.isFavorite,
    ),
  )
  handleAuthenticated('task:touchRecent', (_event, taskId) =>
    touchTaskRecentOnServer(currentAuthToken, taskId),
  )

  handleAuthenticated('user:getAssignees', () =>
    getAssigneesFromServer(currentAuthToken),
  )

  handleAuthenticated('subTask:getByTask', (_event, taskId) =>
    getSubTasksFromServer(currentAuthToken, taskId),
  )
  handleAuthenticated('subTask:create', (_event, payload) =>
    createSubTaskOnServer(currentAuthToken, payload.taskId, payload.title),
  )
  handleAuthenticated('subTask:toggle', (_event, subTaskId) =>
    toggleSubTaskOnServer(currentAuthToken, subTaskId),
  )
  handleAuthenticated('subTask:delete', (_event, subTaskId) =>
    deleteSubTaskOnServer(currentAuthToken, subTaskId),
  )
  handleAuthenticated('subTask:update', (_event, payload) =>
    updateSubTaskOnServer(
      currentAuthToken,
      payload.subTaskId,
      payload.field,
      payload.value,
    ),
  )
  handleAuthenticated('subTask:reorder', (_event, payload) =>
    reorderSubTasksOnServer(
      currentAuthToken,
      payload.taskId,
      payload.orderedIds,
    ),
  )

  handleAuthenticated('memo:getByTask', (_event, taskId) =>
    getMemoFromServer(currentAuthToken, taskId),
  )
  handleAuthenticated('memo:save', (_event, payload) =>
    saveMemoOnServer(currentAuthToken, payload.taskId, payload.memo),
  )
  handleAuthenticated('memo:getAllByTask', (_event, taskId) =>
    getMemosFromServer(currentAuthToken, taskId),
  )
  handleAuthenticated('memo:create', (_event, payload) =>
    createMemoOnServer(
      currentAuthToken,
      payload.taskId,
      payload.contentHtml,
    ),
  )
  handleAuthenticated('memo:update', (_event, payload) =>
    updateMemoOnServer(
      currentAuthToken,
      payload.memoId,
      payload.contentHtml,
    ),
  )
  handleAuthenticated('memo:delete', (_event, memoId) =>
    deleteMemoOnServer(currentAuthToken, memoId),
  )

  handleAuthenticated('comment:getByTask', (_event, taskId) =>
    getCommentsFromServer(currentAuthToken, taskId),
  )
  handleAuthenticated('comment:create', (_event, payload) => {
    return createCommentOnServer(
      currentAuthToken,
      payload.taskId,
      payload.parentId ?? null,
      payload.content,
    )
  })
  handleAuthenticated('comment:update', (_event, payload) =>
    updateCommentOnServer(
      currentAuthToken,
      payload.commentId,
      payload.content,
    ),
  )
  handleAuthenticated('comment:delete', (_event, commentId) =>
    deleteCommentOnServer(currentAuthToken, commentId),
  )

  handleAuthenticated('attachment:selectAndCreate', async (_event, taskId) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      title: 'Task에 첨부할 파일 선택',
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const filePath = result.filePaths[0]
    return uploadAttachmentToServer(currentAuthToken, taskId, {
      name: path.basename(filePath),
      data: await readFile(filePath),
    })
  })
  handleAuthenticated('attachment:open', async (_event, attachmentId) => {
    const attachment = await downloadAttachmentFromServer(
      currentAuthToken,
      attachmentId,
    )
    const safeName = attachment.name
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
      .slice(0, 180)
    const downloadDirectory = path.join(
      app.getPath('temp'),
      'todo-withgpt-attachments',
    )
    await mkdir(downloadDirectory, { recursive: true })
    const localPath = path.join(
      downloadDirectory,
      `${attachmentId.replace(/[^a-zA-Z0-9_-]/g, '_')}-${safeName}`,
    )
    await writeFile(localPath, attachment.data)
    const errorMessage = await shell.openPath(localPath)

    if (errorMessage) {
      throw new Error(errorMessage)
    }

    return { id: attachmentId }
  })

  handleAuthenticated('reminder:getItems', () =>
    Array.from(activeReminders.values()),
  )
  handleAuthenticated('reminder:openTask', (_event, taskId) => {
    showMainWindow(taskId)
    return { taskId }
  })
  handleAuthenticated('reminder:snooze', async (_event, payload) => {
    const remindAt = formatLocalDateTime(
      new Date(Date.now() + Number(payload.minutes) * 60 * 1000),
    )
    const result = await snoozeReminderOnServer(
      currentAuthToken,
      payload.reminderId,
      remindAt,
    )
    removeActiveReminder(payload.reminderId)
    return result
  })
  handleAuthenticated('reminder:complete', async (_event, payload) => {
    const result = await completeReminderOnServer(
      currentAuthToken,
      payload.reminderId,
    )
    const task = await getTaskFromServer(currentAuthToken, result.taskId)
    sendTaskUpdated(task)
    removeActiveReminder(payload.reminderId)
    return result
  })
  handleAuthenticated('reminder:dismiss', async (_event, reminderId) => {
    const result = await dismissReminderOnServer(
      currentAuthToken,
      reminderId,
    )
    removeActiveReminder(reminderId)
    return result
  })
  handleAuthenticated('reminder:hideWindow', () => {
    if (reminderWindow && !reminderWindow.isDestroyed()) {
      saveReminderBounds()
      reminderWindow.hide()
      reminderWindow.flashFrame(false)
    }
  })
}

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) {
    return
  }

  await restoreAuthSession()
  registerIpcHandlers()
  Menu.setApplicationMenu(null)

  if (process.platform === 'win32' && app.isPackaged) {
    app.setLoginItemSettings({
      openAtLogin: true,
      path: process.execPath,
      args: ['--hidden'],
    })
  }

  createTray()
  createMainWindow(!startedHidden)
  configureAutoUpdater()
  powerMonitor.on('lock-screen', handleScreenLock)
  powerMonitor.on('unlock-screen', handleScreenUnlock)
  powerMonitor.on('resume', handleSystemResume)
  reminderCheckTimer = setInterval(checkDueReminders, 30 * 1000)
  dailyBriefingCheckTimer = setInterval(checkDailyBriefing, 60 * 1000)
  scheduleNextDailyBriefingCheck()
  setTimeout(checkDueReminders, 1500)
  setTimeout(checkDailyBriefing, 1800)
  startSyncEvents()

  app.on('activate', () => showMainWindow())
})

app.on('before-quit', () => {
  isQuitting = true
  clearInterval(reminderCheckTimer)
  clearInterval(dailyBriefingCheckTimer)
  clearTimeout(dailyBriefingScheduleTimer)
  clearTimeout(dailyBriefingTopmostTimer)
  clearTimeout(saveBoundsTimer)
  powerMonitor.removeListener('lock-screen', handleScreenLock)
  powerMonitor.removeListener('unlock-screen', handleScreenUnlock)
  powerMonitor.removeListener('resume', handleSystemResume)
  saveReminderBounds()
  stopSyncEvents()
})

app.on('window-all-closed', () => {
  // The tray keeps the desktop reminder process alive.
})
