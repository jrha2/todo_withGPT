import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createFolder,
  createTask,
  getNavigationTree,
  initializeDb,
} from './db.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#f3f4f6',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  console.log('[Main] preload path:', path.join(__dirname, 'preload.cjs'))

  mainWindow.loadURL('http://localhost:5173')

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  initializeDb()

  ipcMain.handle('navigation:getTree', async () => {
    const tree = getNavigationTree()
    console.log('[Main] navigation:getTree result:', tree)
    return tree
  })

  ipcMain.handle('navigation:createFolder', async (_event, payload) => {
    return createFolder(payload.title, payload.parentId ?? null)
  })

  ipcMain.handle('navigation:createTask', async (_event, payload) => {
    return createTask(payload.title, payload.parentId ?? null)
  })

  ipcMain.handle('task:getDetail', async (_event, taskId) => {
    return { taskId }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
