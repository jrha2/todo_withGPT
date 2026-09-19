const { contextBridge, ipcRenderer, webFrame } = require('electron')

window.__preload_ok = true

const ZOOM_MIN = 0.7
const ZOOM_MAX = 2.0

function clampZoom(factor) {
  if (typeof factor !== 'number' || Number.isNaN(factor)) return 1
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, factor))
}

contextBridge.exposeInMainWorld('api', {
  auth: {
    getServerUrl: () => ipcRenderer.invoke('auth:getServerUrl'),
    setServerUrl: (serverUrl) => ipcRenderer.invoke('auth:setServerUrl', serverUrl),
    getSession: () => ipcRenderer.invoke('auth:getSession'),
    login: (loginId, password) =>
      ipcRenderer.invoke('auth:login', { loginId, password }),
    logout: () => ipcRenderer.invoke('auth:logout'),
    signup: (input) => ipcRenderer.invoke('auth:signup', input),
    getServerMigrationNotice: () =>
      ipcRenderer.invoke('auth:getServerMigrationNotice'),
  },
  me: {
    updateProfile: (input) => ipcRenderer.invoke('me:updateProfile', input),
    changePassword: (currentPassword, newPassword) =>
      ipcRenderer.invoke('me:changePassword', { currentPassword, newPassword }),
  },
  admin: {
    getUsers: () => ipcRenderer.invoke('admin:getUsers'),
    createUser: (input) => ipcRenderer.invoke('admin:createUser', input),
    updateUser: (userId, changes) =>
      ipcRenderer.invoke('admin:updateUser', { userId, changes }),
    deleteUser: (userId) => ipcRenderer.invoke('admin:deleteUser', userId),
    getUserReferences: (userId) =>
      ipcRenderer.invoke('admin:getUserReferences', userId),
    getPendingUsers: () => ipcRenderer.invoke('admin:getPendingUsers'),
    approveUser: (userId) => ipcRenderer.invoke('admin:approveUser', userId),
    rejectUser: (userId) => ipcRenderer.invoke('admin:rejectUser', userId),
  },
  zoom: {
    min: ZOOM_MIN,
    max: ZOOM_MAX,
    get: () => webFrame.getZoomFactor(),
    set: (factor) => {
      const next = clampZoom(factor)
      webFrame.setZoomFactor(next)
      return next
    },
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
    getStatus: () => ipcRenderer.invoke('sync:getStatus'),
    retry: () => ipcRenderer.invoke('sync:retry'),
    acknowledge: (revision) => ipcRenderer.invoke('sync:acknowledge', revision),
    onStatusChanged: (callback) => {
      const listener = (_event, status) => callback(status)
      ipcRenderer.on('sync:statusChanged', listener)
      return () => ipcRenderer.removeListener('sync:statusChanged', listener)
    },
    onRemoteChange: (callback) => {
      const listener = (_event, change) => callback(change)
      ipcRenderer.on('sync:remoteChange', listener)
      return () => ipcRenderer.removeListener('sync:remoteChange', listener)
    },
  },
  navigation: {
    getTree: (options = {}) => ipcRenderer.invoke('navigation:getTree', options),
    getTrash: () => ipcRenderer.invoke('navigation:getTrash'),
    restoreNode: (nodeId) => ipcRenderer.invoke('navigation:restoreNode', nodeId),
    permanentlyDeleteNode: (nodeId) =>
      ipcRenderer.invoke('navigation:permanentlyDeleteNode', nodeId),
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
    setAllExpanded: (expanded) =>
      ipcRenderer.invoke('navigation:setAllExpanded', { expanded }),
  },
  workspace: {
    getTasks: (view, scope = 'all') =>
      ipcRenderer.invoke('workspace:getTasks', { view, scope }),
  },
  task: {
    getDetail: (taskId) => ipcRenderer.invoke('task:getDetail', taskId),
    toggleCompleted: (taskId) => ipcRenderer.invoke('task:toggleCompleted', taskId),
    updateDetail: (taskId, changes) =>
      ipcRenderer.invoke('task:updateDetail', { taskId, changes }),
    bulkUpdate: (taskIds, changes) =>
      ipcRenderer.invoke('task:bulkUpdate', { taskIds, changes }),
    setFavorite: (taskId, isFavorite) =>
      ipcRenderer.invoke('task:setFavorite', { taskId, isFavorite }),
    touchRecent: (taskId) => ipcRenderer.invoke('task:touchRecent', taskId),
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
