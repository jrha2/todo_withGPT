const { contextBridge, ipcRenderer } = require('electron')

window.__preload_ok = true

contextBridge.exposeInMainWorld('api', {
  auth: {
    getServerUrl: () => ipcRenderer.invoke('auth:getServerUrl'),
    setServerUrl: (serverUrl) => ipcRenderer.invoke('auth:setServerUrl', serverUrl),
    getSession: () => ipcRenderer.invoke('auth:getSession'),
    login: (loginId, password) =>
      ipcRenderer.invoke('auth:login', { loginId, password }),
    logout: () => ipcRenderer.invoke('auth:logout'),
  },
  admin: {
    getUsers: () => ipcRenderer.invoke('admin:getUsers'),
    createUser: (input) => ipcRenderer.invoke('admin:createUser', input),
    updateUser: (userId, changes) =>
      ipcRenderer.invoke('admin:updateUser', { userId, changes }),
    deleteUser: (userId) => ipcRenderer.invoke('admin:deleteUser', userId),
    getUserReferences: (userId) =>
      ipcRenderer.invoke('admin:getUserReferences', userId),
  },
  app: {
    onSelectTask: (callback) => {
      const listener = (_event, taskId) => callback(taskId)
      ipcRenderer.on('app:selectTask', listener)
      return () => ipcRenderer.removeListener('app:selectTask', listener)
    },
    onTaskUpdated: (callback) => {
      const listener = (_event, task) => callback(task)
      ipcRenderer.on('app:taskUpdated', listener)
      return () => ipcRenderer.removeListener('app:taskUpdated', listener)
    },
    onOpenBriefing: (callback) => {
      const listener = () => callback()
      ipcRenderer.on('app:openBriefing', listener)
      return () => ipcRenderer.removeListener('app:openBriefing', listener)
    },
  },
  briefing: {
    getData: (days = 7) => ipcRenderer.invoke('briefing:getData', days),
    openMain: () => ipcRenderer.invoke('briefing:openMain'),
    hideWindow: () => ipcRenderer.invoke('briefing:hideWindow'),
  },
  sync: {
    getState: () => ipcRenderer.invoke('sync:getState'),
    acknowledge: (revision) => ipcRenderer.invoke('sync:acknowledge', revision),
    onRemoteChange: (callback) => {
      const listener = (_event, change) => callback(change)
      ipcRenderer.on('sync:remoteChange', listener)
      return () => ipcRenderer.removeListener('sync:remoteChange', listener)
    },
  },
  navigation: {
    getTree: () => ipcRenderer.invoke('navigation:getTree'),
    createFolder: (title, parentId) =>
      ipcRenderer.invoke('navigation:createFolder', { title, parentId }),
    createTask: (title, parentId) =>
      ipcRenderer.invoke('navigation:createTask', { title, parentId }),
    renameNode: (nodeId, title) =>
      ipcRenderer.invoke('navigation:renameNode', { nodeId, title }),
    deleteNode: (nodeId) =>
      ipcRenderer.invoke('navigation:deleteNode', nodeId),
    moveNode: (nodeId, targetFolderId) =>
      ipcRenderer.invoke('navigation:moveNode', { nodeId, targetFolderId }),
    copyNode: (nodeId, targetFolderId) =>
      ipcRenderer.invoke('navigation:copyNode', { nodeId, targetFolderId }),
    reorderNode: (nodeId, direction) =>
      ipcRenderer.invoke('navigation:reorderNode', { nodeId, direction }),
    dropNode: (nodeId, targetNodeId, position) =>
      ipcRenderer.invoke('navigation:dropNode', {
        nodeId,
        targetNodeId,
        position,
      }),
    setExpanded: (nodeId, expanded) =>
      ipcRenderer.invoke('navigation:setExpanded', { nodeId, expanded }),
  },
  task: {
    getDetail: (taskId) => ipcRenderer.invoke('task:getDetail', taskId),
    toggleCompleted: (taskId) => ipcRenderer.invoke('task:toggleCompleted', taskId),
    updateDetail: (taskId, changes) =>
      ipcRenderer.invoke('task:updateDetail', { taskId, changes }),
  },
  user: {
    getAssignees: () => ipcRenderer.invoke('user:getAssignees'),
  },
  subTask: {
    getByTask: (taskId) => ipcRenderer.invoke('subTask:getByTask', taskId),
    create: (taskId, title) =>
      ipcRenderer.invoke('subTask:create', { taskId, title }),
    toggle: (subTaskId) => ipcRenderer.invoke('subTask:toggle', subTaskId),
    delete: (subTaskId) => ipcRenderer.invoke('subTask:delete', subTaskId),
    update: (subTaskId, field, value) =>
      ipcRenderer.invoke('subTask:update', { subTaskId, field, value }),
    reorder: (taskId, orderedIds) =>
      ipcRenderer.invoke('subTask:reorder', { taskId, orderedIds }),
  },
  memo: {
    getByTask: (taskId) => ipcRenderer.invoke('memo:getByTask', taskId),
    save: (taskId, memo) => ipcRenderer.invoke('memo:save', { taskId, memo }),
    getAllByTask: (taskId) => ipcRenderer.invoke('memo:getAllByTask', taskId),
    create: (taskId, contentHtml) =>
      ipcRenderer.invoke('memo:create', { taskId, contentHtml }),
    update: (memoId, contentHtml) =>
      ipcRenderer.invoke('memo:update', { memoId, contentHtml }),
    delete: (memoId) => ipcRenderer.invoke('memo:delete', memoId),
  },
  comment: {
    getByTask: (taskId) => ipcRenderer.invoke('comment:getByTask', taskId),
    create: (taskId, parentId, content) =>
      ipcRenderer.invoke('comment:create', { taskId, parentId, content }),
    update: (commentId, content) =>
      ipcRenderer.invoke('comment:update', { commentId, content }),
    delete: (commentId) => ipcRenderer.invoke('comment:delete', commentId),
  },
  attachment: {
    selectAndCreate: (taskId) =>
      ipcRenderer.invoke('attachment:selectAndCreate', taskId),
    open: (attachmentId) => ipcRenderer.invoke('attachment:open', attachmentId),
  },
  reminder: {
    getItems: () => ipcRenderer.invoke('reminder:getItems'),
    onItems: (callback) => {
      const listener = (_event, items) => callback(items)
      ipcRenderer.on('reminder:items', listener)
      return () => ipcRenderer.removeListener('reminder:items', listener)
    },
    openTask: (taskId) => ipcRenderer.invoke('reminder:openTask', taskId),
    snooze: (reminderId, minutes) =>
      ipcRenderer.invoke('reminder:snooze', { reminderId, minutes }),
    complete: (reminderId, taskId) =>
      ipcRenderer.invoke('reminder:complete', { reminderId, taskId }),
    dismiss: (reminderId) => ipcRenderer.invoke('reminder:dismiss', reminderId),
    hideWindow: () => ipcRenderer.invoke('reminder:hideWindow'),
  },
})
