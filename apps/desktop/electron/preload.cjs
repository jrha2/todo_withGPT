const { contextBridge, ipcRenderer } = require('electron')

window.__preload_ok = true

contextBridge.exposeInMainWorld('api', {
  navigation: {
    getTree: () => ipcRenderer.invoke('navigation:getTree'),
    createFolder: (title, parentId) =>
      ipcRenderer.invoke('navigation:createFolder', { title, parentId }),
    createTask: (title, parentId) =>
      ipcRenderer.invoke('navigation:createTask', { title, parentId }),
  },
  task: {
    getDetail: (taskId) => ipcRenderer.invoke('task:getDetail', taskId),
  },
})
