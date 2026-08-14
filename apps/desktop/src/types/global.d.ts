export {}

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
        }>
        acknowledge: (revision: number) => Promise<unknown>
        onRemoteChange: (
          callback: (change: { revision: number; changedAt?: string }) => void,
        ) => () => void
      }
      navigation: {
        getTree: () => Promise<unknown>
        createFolder: (title: string, parentId: string | null) => Promise<unknown>
        createTask: (title: string, parentId: string | null) => Promise<unknown>
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
      }
      task: {
        getDetail: (taskId: string) => Promise<unknown>
        toggleCompleted: (taskId: string) => Promise<unknown>
        updateDetail: (
          taskId: string,
          changes: {
            title: string
            description: string
            dueDate: string
            alarm: string
            assignee: string
            assigneeIds: string[]
            manualAssigneeNames: string[]
          },
        ) => Promise<unknown>
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
          field: 'title' | 'dueDate' | 'assignee',
          value: string,
        ) => Promise<unknown>
      }
      memo: {
        getByTask: (taskId: string) => Promise<unknown>
        save: (taskId: string, memo: string) => Promise<unknown>
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
