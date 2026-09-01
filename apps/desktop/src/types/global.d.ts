export {}

type SyncPhase = 'connecting' | 'syncing' | 'synced' | 'offline' | 'failed'
type SyncStatus = {
  phase: SyncPhase
  latestRevision: number
  acknowledgedRevision: number
  pendingRevision: number | null
  lastConnectedAt: string | null
  lastSyncedAt: string | null
  lastError: string | null
}
type TaskPriority = 'low' | 'normal' | 'high' | 'urgent'
type WorkflowStatus = 'todo' | 'in_progress' | 'blocked' | 'done'
type TaskBulkChanges = {
  priority?: TaskPriority
  workflowStatus?: WorkflowStatus
  tags?: string[]
  dueDate?: string | null
  completed?: boolean
  assigneeIds?: string[]
  parentId?: string | null
}
type WorkspaceTask = {
  taskId: string
  title: string
  folderId: string | null
  folderTitle: string
  dueDate: string
  completed: boolean
  assignees: Array<{ id: string; name: string; email: string }>
  priority: TaskPriority
  workflowStatus: WorkflowStatus
  tags: string[]
  isFavorite: boolean
  lastOpenedAt: string | null
}

declare global {
  interface Window {
    api: {
      auth: {
        getServerUrl: () => Promise<unknown>
        setServerUrl: (serverUrl: string) => Promise<unknown>
        getSession: () => Promise<unknown>
        login: (loginId: string, password: string) => Promise<unknown>
        logout: () => Promise<unknown>
      }
      admin: {
        getUsers: () => Promise<unknown>
        createUser: (input: unknown) => Promise<unknown>
        updateUser: (userId: string, changes: unknown) => Promise<unknown>
        deleteUser: (userId: string) => Promise<unknown>
        getUserReferences: (userId: string) => Promise<unknown>
      }
      zoom: {
        min: number
        max: number
        get: () => number
        set: (factor: number) => number
      }
      app: {
        onSelectTask: (callback: (taskId: string) => void) => () => void
        onTaskUpdated: (
          callback: (task: { taskId: string; completed: boolean }) => void,
        ) => () => void
        onOpenBriefing: (callback: () => void) => () => void
      }
      briefing: {
        getData: (days?: number) => Promise<unknown>
        openMain: () => Promise<unknown>
        hideWindow: () => Promise<unknown>
      }
      sync: {
        getState: () => Promise<{
          pendingEvent: { revision: number } | null
          latestRevision: number
          status: SyncStatus
        }>
        getStatus: () => Promise<SyncStatus>
        retry: () => Promise<SyncStatus>
        acknowledge: (revision: number) => Promise<{ revision: number; status: SyncStatus }>
        onStatusChanged: (
          callback: (status: SyncStatus) => void,
        ) => () => void
        onRemoteChange: (
          callback: (change: { revision: number; changedAt?: string }) => void,
        ) => () => void
      }
      navigation: {
        getTree: (options?: {
          query?: string
          scope?: 'all' | 'mine'
        }) => Promise<unknown>
        getTrash: () => Promise<Array<{
          id: string
          type: 'folder' | 'task'
          title: string
          parentId: string | null
          deletedAt: string
          deletedBatchId: string
          count: number
        }>>
        restoreNode: (nodeId: string) => Promise<unknown>
        permanentlyDeleteNode: (nodeId: string) => Promise<unknown>
        createFolder: (title: string, parentId: string | null) => Promise<unknown>
        createTask: (title: string, parentId: string | null) => Promise<{
          id: string
          detail: unknown
        }>
        renameNode: (nodeId: string, title: string) => Promise<unknown>
        deleteNode: (nodeId: string) => Promise<unknown>
        moveNode: (nodeId: string, targetFolderId: string | null) => Promise<unknown>
        copyNode: (nodeId: string, targetFolderId: string | null) => Promise<unknown>
        reorderNode: (nodeId: string, direction: 'up' | 'down') => Promise<unknown>
        dropNode: (
          nodeId: string,
          targetNodeId: string,
          position: 'before' | 'after' | 'inside',
        ) => Promise<unknown>
        setExpanded: (nodeId: string, expanded: boolean) => Promise<unknown>
        setAllExpanded: (expanded: boolean) => Promise<unknown>
      }
      workspace: {
        getTasks: (
          view: 'today' | 'overdue' | 'week' | 'incomplete' | 'unassigned' | 'favorites' | 'recent',
          scope?: 'all' | 'mine',
        ) => Promise<WorkspaceTask[]>
      }
      task: {
        getDetail: (taskId: string) => Promise<unknown>
        toggleCompleted: (taskId: string) => Promise<unknown>
        updateDetail: (
          taskId: string,
          changes: {
            title?: string
            description?: string
            dueDate?: string
            alarm?: string
            assignee?: string
            assigneeIds?: string[]
            manualAssigneeNames?: string[]
            priority?: TaskPriority
            workflowStatus?: WorkflowStatus
            tags?: string[]
            completed?: boolean
          },
        ) => Promise<unknown>
        bulkUpdate: (
          taskIds: string[],
          changes: TaskBulkChanges,
        ) => Promise<WorkspaceTask[]>
        setFavorite: (
          taskId: string,
          isFavorite: boolean,
        ) => Promise<{ taskId: string; isFavorite: boolean }>
        touchRecent: (
          taskId: string,
        ) => Promise<{ taskId: string; lastOpenedAt: string }>
      }
      user: {
        getAssignees: () => Promise<unknown>
      }
      subTask: {
        getByTask: (taskId: string) => Promise<unknown>
        create: (taskId: string, title: string) => Promise<unknown>
        toggle: (subTaskId: string) => Promise<unknown>
        delete: (subTaskId: string) => Promise<unknown>
        update: (
          subTaskId: string,
          field: 'title' | 'dueDate' | 'assignee' | 'assignees',
          value: string | string[],
        ) => Promise<unknown>
        reorder: (taskId: string, orderedIds: string[]) => Promise<unknown>
      }
      memo: {
        getByTask: (taskId: string) => Promise<unknown>
        save: (taskId: string, memo: string) => Promise<unknown>
        getAllByTask: (taskId: string) => Promise<unknown>
        create: (taskId: string, contentHtml: string) => Promise<unknown>
        update: (memoId: string, contentHtml: string) => Promise<unknown>
        delete: (memoId: string) => Promise<unknown>
      }
      comment: {
        getByTask: (taskId: string) => Promise<unknown>
        create: (
          taskId: string,
          parentId: string | null,
          content: string,
        ) => Promise<unknown>
        update: (commentId: string, content: string) => Promise<unknown>
        delete: (commentId: string) => Promise<unknown>
      }
      attachment: {
        selectAndCreate: (taskId: string) => Promise<unknown>
        open: (attachmentId: string) => Promise<unknown>
      }
      reminder: {
        getItems: () => Promise<unknown>
        onItems: (callback: (items: unknown[]) => void) => () => void
        openTask: (taskId: string) => Promise<unknown>
        snooze: (reminderId: string, minutes: number) => Promise<unknown>
        complete: (reminderId: string, taskId: string) => Promise<unknown>
        dismiss: (reminderId: string) => Promise<unknown>
        hideWindow: () => Promise<unknown>
      }
    }
  }
}
