import {
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from 'react'
import ToDoBriefing from '../features/briefing/components/ToDoBriefing'
import MemoSection from '../features/memo/components/MemoSection'
import NavigationBar from '../features/navigation-bar/components/NavigationBar'
import SubTaskSection from '../features/sub-task/components/SubTaskSection'
import TaskHeader from '../features/task/components/TaskHeader'
import TrashView from '../features/trash/components/TrashView'
import WorkspaceViewPanel from '../features/workspace/components/WorkspaceView'
import type { AuthUser } from '../services/api/authApi'
import {
  confirmDiscardDirtyDrafts,
  setDraftDirty,
} from '../services/draftRegistry'
import {
  openAttachment,
  selectAndCreateAttachment,
} from '../services/api/attachmentApi'
import {
  createComment,
  deleteComment,
  getComments,
  updateComment,
} from '../services/api/commentApi'
import {
  createMemo,
  deleteMemo,
  getMemos,
  updateMemo,
  type RichMemoRecord,
} from '../services/api/memoApi'
import {
  copyNavigationNode,
  createFolder,
  createTask,
  deleteNavigationNode,
  dropNavigationNode,
  getNavigationTree,
  moveNavigationNode,
  renameNavigationNode,
  reorderNavigationNode,
  setAllNavigationExpanded,
  setNavigationNodeExpanded,
  type NavigationScope,
  type NavigationSearchHit,
} from '../services/api/navigationApi'
import {
  createSubTask,
  deleteSubTask,
  getSubTasks,
  reorderSubTasks,
  toggleSubTask,
  updateSubTask,
  type SubTaskRecord,
} from '../services/api/subTaskApi'
import {
  getTaskDetail,
  setTaskFavorite,
  toggleTaskCompleted,
  touchTaskRecent,
  updateTaskDetail,
  type TaskDetailChanges,
  type TaskDetailRecord,
  type TaskPriority,
  type WorkflowStatus,
} from '../services/api/taskApi'
import {
  getWorkspaceTasks,
  type WorkspaceView,
} from '../services/api/workspaceApi'
import {
  getAssigneeUsers,
  type AssigneeUser,
} from '../services/api/userApi'

type NavigationNode = {
  id: string
  parentId: string | null
  type: 'folder' | 'task'
  title: string
  expanded?: boolean
  order: number
  completed: boolean
  matchKinds?: string[]
  searchHits: NavigationSearchHit[]
}

type TaskId = string
type TaskDetail = {
  id: string
  navNodeId: string
  path: string
  title: string
  description: string
  dueDate: string
  alarm: string
  assignee: string
  assignees: AssigneeUser[]
  completed: boolean
  priority: TaskPriority
  workflowStatus: WorkflowStatus
  tags: string[]
  isFavorite: boolean
  attachments: Array<{ id: string; name: string }>
  subTasks: SubTaskRecord[]
  memos: RichMemoRecord[]
  comments: Array<{
    id: string
    parentId: string | null
    author: string
    createdAt: string
    content: string
    deleted?: boolean
  }>
}

const MIN_NAVIGATION_WIDTH = 372
const MAX_NAVIGATION_WIDTH = 520

function sortSubTasks(items: SubTaskRecord[]) {
  const incompleteItems = items.filter((item) => !item.completed)
  const completedItems = items.filter((item) => item.completed)

  incompleteItems.sort((left, right) => {
    if (!left.dueDate && right.dueDate) return 1
    if (left.dueDate && !right.dueDate) return -1

    const dueDateOrder = left.dueDate.localeCompare(right.dueDate)
    if (dueDateOrder !== 0) return dueDateOrder

    const createdAtOrder = left.createdAt.localeCompare(right.createdAt)
    if (createdAtOrder !== 0) return createdAtOrder

    const creationOrder = left.creationOrder - right.creationOrder
    return creationOrder !== 0 ? creationOrder : left.id.localeCompare(right.id)
  })

  return [...incompleteItems, ...completedItems]
}

type MainLayoutProps = {
  currentUser: AuthUser
  userRevision: number
  remoteRefreshRevision: number | null
  onRemoteRefreshComplete: (revision: number, succeeded: boolean) => void
  onOpenAdmin: () => void
  onLogout: () => void
}

function MainLayout({
  currentUser,
  userRevision,
  remoteRefreshRevision,
  onRemoteRefreshComplete,
  onOpenAdmin,
  onLogout,
}: MainLayoutProps) {
  const [navigationWidth, setNavigationWidth] = useState(MIN_NAVIGATION_WIDTH)
  const [isNavigationCollapsed, setIsNavigationCollapsed] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState<TaskId>('')
  const [navigationTree, setNavigationTree] = useState<NavigationNode[]>([])
  const [taskDetails, setTaskDetails] = useState<Record<string, TaskDetail>>({})
  const [assigneeUsers, setAssigneeUsers] = useState<AssigneeUser[]>([])
  const [activeView, setActiveView] = useState<'task' | 'briefing' | 'workspace' | 'trash'>('task')
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>('today')
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false)
  const [quickCreateTitle, setQuickCreateTitle] = useState('')
  const [quickCreateParentId, setQuickCreateParentId] = useState('root')
  const [quickCreateError, setQuickCreateError] = useState('')
  const [isQuickCreating, setIsQuickCreating] = useState(false)
  const [pendingSearchHit, setPendingSearchHit] = useState<NavigationSearchHit | null>(null)
  const [navigationSearchQuery, setNavigationSearchQuery] = useState('')
  const [navigationScope, setNavigationScope] = useState<NavigationScope>('all')
  const completedVisibilityStorageKey = `todo:preferences:show-completed-tasks:${currentUser.id}`
  const completedSubTaskVisibilityStorageKey = `todo:preferences:show-completed-subtasks:${currentUser.id}`
  const [showCompletedTasks, setShowCompletedTasks] = useState(
    () => localStorage.getItem(completedVisibilityStorageKey) !== 'false',
  )
  const [showCompletedSubTasks, setShowCompletedSubTasks] = useState(
    () => localStorage.getItem(completedSubTaskVisibilityStorageKey) !== 'false',
  )
  const [isNavigationLoading, setIsNavigationLoading] = useState(false)
  const [navigationError, setNavigationError] = useState('')
  const deferredSearchQuery = useDeferredValue(navigationSearchQuery)
  const navigationRequestIdRef = useRef(0)
  const isDraggingRef = useRef(false)
  const remoteRefreshStateRef = useRef<{
    revision: number
    shell: boolean
    view: boolean
    failed: boolean
    completed: boolean
  } | null>(null)

  useEffect(() => {
    localStorage.setItem(completedVisibilityStorageKey, String(showCompletedTasks))
  }, [completedVisibilityStorageKey, showCompletedTasks])

  useEffect(() => {
    localStorage.setItem(
      completedSubTaskVisibilityStorageKey,
      String(showCompletedSubTasks),
    )
  }, [completedSubTaskVisibilityStorageKey, showCompletedSubTasks])

  const loadTree = useCallback(async () => {
    const requestId = ++navigationRequestIdRef.current
    setIsNavigationLoading(true)
    setNavigationError('')

    try {
      const tree = await getNavigationTree({
        query: deferredSearchQuery,
        scope: navigationScope,
      })
      if (requestId !== navigationRequestIdRef.current) return

      const navigationNodes = tree as NavigationNode[]
      setNavigationTree(navigationNodes)
      setSelectedTaskId((currentTaskId) => {
        // Search/scope filtering may hide the open Task. Keep the editor mounted so
        // filtering cannot discard an in-progress draft.
        if (currentTaskId) {
          return currentTaskId
        }

        return navigationNodes.find((node) => (
          node.type === 'task'
          && (showCompletedTasks || !node.completed)
        ))?.id ?? ''
      })
      return navigationNodes
    } catch (error) {
      if (requestId !== navigationRequestIdRef.current) return
      console.error('Failed to load navigation tree from DB:', error)
      setNavigationError('업무 목록을 불러오지 못했습니다.')
      return null
    } finally {
      if (requestId === navigationRequestIdRef.current) {
        setIsNavigationLoading(false)
      }
    }
  }, [deferredSearchQuery, navigationScope, showCompletedTasks])

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isDraggingRef.current) {
        return
      }

      const nextWidth = Math.min(
        Math.max(event.clientX, MIN_NAVIGATION_WIDTH),
        MAX_NAVIGATION_WIDTH,
      )
      setNavigationWidth(nextWidth)
    }

    const handleMouseUp = () => {
      isDraggingRef.current = false
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  useEffect(() => {
    return window.api.app.onSelectTask((taskId) => {
      if (!confirmDiscardDirtyDrafts()) return
      setSelectedTaskId(taskId)
      setActiveView('task')
    })
  }, [])

  useEffect(() => {
    return window.api.app.onOpenBriefing(() => {
      if (!confirmDiscardDirtyDrafts()) return
      setActiveView('briefing')
    })
  }, [])

  useEffect(() => {
    return window.api.app.onTaskUpdated(({ taskId, completed }) => {
      setNavigationTree((prev) =>
        prev.map((node) =>
          node.id === taskId ? { ...node, completed } : node,
        ),
      )
      setTaskDetails((prev) => {
        const currentTask = prev[taskId]
        return currentTask
          ? { ...prev, [taskId]: { ...currentTask, completed } }
          : prev
      })
    })
  }, [])

  useEffect(() => {
    // Reload server-backed navigation whenever a remote revision is applied.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTree()
  }, [loadTree, userRevision])

  useEffect(() => {
    getAssigneeUsers()
      .then(setAssigneeUsers)
      .catch((error) => {
        console.error('Failed to load assignee users from DB:', error)
      })
  }, [userRevision])

  const loadSelectedTask = useCallback(async (
    taskId = selectedTaskId,
    tree = navigationTree,
    isCancelled: () => boolean = () => false,
  ) => {
    const selectedNode = tree.find((node) => node.id === taskId)
    if (!selectedNode || selectedNode.type !== 'task') return false

    try {
      const [taskDetail, subTasks, memos, comments, favoriteTasks] = await Promise.all([
        getTaskDetail(taskId),
        getSubTasks(taskId),
        getMemos(taskId),
        getComments(taskId),
        getWorkspaceTasks('favorites'),
      ])
      if (isCancelled()) return false

      const parentNode = selectedNode.parentId
        ? tree.find((node) => node.id === selectedNode.parentId)
        : null
      const taskPath = parentNode
        ? `${parentNode.title} > ${taskDetail.title}`
        : taskDetail.title

      setTaskDetails({
        [taskId]: {
          id: taskDetail.id,
          navNodeId: taskDetail.navNodeId,
          path: taskPath,
          title: taskDetail.title,
          description: taskDetail.description,
          dueDate: taskDetail.dueDate,
          alarm: taskDetail.alarm,
          assignee: taskDetail.assignee,
          assignees: taskDetail.assignees,
          completed: taskDetail.completed,
          priority: taskDetail.priority,
          workflowStatus: taskDetail.workflowStatus,
          tags: taskDetail.tags,
          isFavorite: favoriteTasks.some((task) => task.taskId === taskId),
          attachments: taskDetail.attachments,
          subTasks,
          memos,
          comments,
        },
      })
      void touchTaskRecent(taskId).catch((error) => {
        console.error('Failed to update recent Task state:', error)
      })
      return true
    } catch (error) {
      console.error('Failed to load Task content from DB:', error)
      return false
    }
  }, [selectedTaskId, navigationTree])

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSelectedTask(selectedTaskId, navigationTree, () => cancelled)
    return () => { cancelled = true }
  }, [loadSelectedTask, selectedTaskId, navigationTree])

  useEffect(() => {
    if (remoteRefreshRevision) {
      remoteRefreshStateRef.current = {
        revision: remoteRefreshRevision,
        shell: false,
        view: false,
        failed: false,
        completed: false,
      }
    } else {
      remoteRefreshStateRef.current = null
    }
  }, [remoteRefreshRevision])

  const reportRemoteRefreshPart = useCallback((
    revision: number,
    part: 'shell' | 'view',
    succeeded: boolean,
  ) => {
    const state = remoteRefreshStateRef.current
    if (!state || state.revision !== revision || state.completed) return
    if (!succeeded) {
      state.failed = true
      state.completed = true
      onRemoteRefreshComplete(revision, false)
      return
    }
    state[part] = true
    if (state.shell && state.view) {
      state.completed = true
      onRemoteRefreshComplete(revision, true)
    }
  }, [onRemoteRefreshComplete])

  const handleChildRemoteRefresh = useCallback((revision: number, succeeded: boolean) => {
    reportRemoteRefreshPart(revision, 'view', succeeded)
  }, [reportRemoteRefreshPart])

  useEffect(() => {
    if (!remoteRefreshRevision) return
    let cancelled = false
    const refreshShell = async () => {
      const freshTree = await loadTree()
      if (!freshTree || cancelled) {
        if (!cancelled) reportRemoteRefreshPart(remoteRefreshRevision, 'shell', false)
        return
      }
      try {
        const users = await getAssigneeUsers()
        if (cancelled) return
        setAssigneeUsers(users)
        if (activeView === 'task') {
          const refreshTaskId = freshTree.some((node) => (
            node.id === selectedTaskId
            && node.type === 'task'
            && (showCompletedTasks || !node.completed)
          ))
            ? selectedTaskId
            : freshTree.find((node) => (
                node.type === 'task'
                && (showCompletedTasks || !node.completed)
              ))?.id ?? ''
          if (refreshTaskId !== selectedTaskId) {
            setSelectedTaskId(refreshTaskId)
            setTaskDetails({})
          }
          const detailSucceeded = refreshTaskId
            ? await loadSelectedTask(refreshTaskId, freshTree, () => cancelled)
            : true
          if (cancelled) return
          reportRemoteRefreshPart(remoteRefreshRevision, 'view', detailSucceeded)
        }
        reportRemoteRefreshPart(remoteRefreshRevision, 'shell', true)
      } catch (error) {
        console.error('Failed to refresh renderer after remote change:', error)
        if (!cancelled) reportRemoteRefreshPart(remoteRefreshRevision, 'shell', false)
      }
    }
    void refreshShell()
    return () => { cancelled = true }
  // A remote revision owns this transaction; child views report their own fetch result.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteRefreshRevision])

  const handleResizeMouseDown = () => {
    isDraggingRef.current = true
  }

  const handleToggleFolder = async (folderId: string) => {
    const folder = navigationTree.find((node) => node.id === folderId)

    if (!folder || folder.type !== 'folder') {
      return
    }

    const expanded = !folder.expanded
    await setNavigationNodeExpanded(folderId, expanded)

    setNavigationTree((prev) =>
      prev.map((node) =>
        node.id === folderId && node.type === 'folder'
          ? { ...node, expanded }
          : node,
      ),
    )
  }

  const handleSetAllFoldersExpanded = async (expanded: boolean) => {
    const hasChange = navigationTree.some(
      (node) => node.type === 'folder' && Boolean(node.expanded) !== expanded,
    )

    if (!hasChange) {
      return
    }

    // Optimistically flip every folder, then persist the whole change with a
    // single server call so no partially-applied sync reload can leave the tree
    // expanding one level at a time.
    setNavigationTree((prev) =>
      prev.map((node) =>
        node.type === 'folder' ? { ...node, expanded } : node,
      ),
    )

    try {
      await setAllNavigationExpanded(expanded)
    } catch (error) {
      console.error('Failed to update all folder expansion:', error)
      await loadTree()
    }
  }

  const handleRenameNode = async (nodeId: string, nextTitle: string) => {
    await renameNavigationNode(nodeId, nextTitle)
    await loadTree()
  }
  const handleCreateChildFolder = async (parentId: string, title: string) => {
    await handleCreateFolder(title, parentId)
  }
  const handleCreateChildTask = async (parentId: string, title: string) => {
    await handleCreateTask(title, parentId)
  }
  const handleDeleteNode = async (nodeId: string) => {
    const deletingIds = new Set<string>()
    const pendingIds = [nodeId]

    while (pendingIds.length > 0) {
      const currentId = pendingIds.shift()

      if (!currentId || deletingIds.has(currentId)) {
        continue
      }

      deletingIds.add(currentId)
      navigationTree
        .filter((node) => node.parentId === currentId)
        .forEach((node) => pendingIds.push(node.id))
    }

    await deleteNavigationNode(nodeId)

    const remainingTasks = navigationTree.filter(
      (node) => node.type === 'task' && !deletingIds.has(node.id),
    )

    setNavigationTree((prev) =>
      prev.filter((node) => !deletingIds.has(node.id)),
    )
    setTaskDetails((prev) =>
      Object.fromEntries(
        Object.entries(prev).filter(([taskId]) => !deletingIds.has(taskId)),
      ) as Record<string, TaskDetail>,
    )

    if (deletingIds.has(selectedTaskId)) {
      setSelectedTaskId(remainingTasks[0]?.id ?? '')
    }

    await loadTree()
  }
  const handleMoveNode = async (nodeId: string, targetFolderId: string | null) => {
    await moveNavigationNode(nodeId, targetFolderId)
    await loadTree()
  }
  const handleCopyNode = async (
    nodeId: string,
    targetFolderId: string | null,
  ) => {
    const result = (await copyNavigationNode(nodeId, targetFolderId)) as {
      id: string
      type: 'folder' | 'task'
      taskIdMap: Record<string, string>
    }

    setTaskDetails((prev) => {
      const next = { ...prev }

      Object.entries(result.taskIdMap).forEach(
        ([sourceTaskId, copiedTaskId]) => {
          const sourceDetail = prev[sourceTaskId]

          if (!sourceDetail) {
            return
          }

          const copiedDetail = structuredClone(sourceDetail) as TaskDetail
          next[copiedTaskId] = {
            ...copiedDetail,
            id: `task-detail-${copiedTaskId}`,
            navNodeId: copiedTaskId,
          } as TaskDetail
        },
      )

      return next
    })

    await loadTree()

    if (result.type === 'task') {
      setSelectedTaskId(result.id)
      setActiveView('task')
    }
  }
  const handleMoveNodeUp = async (nodeId: string) => {
    await reorderNavigationNode(nodeId, 'up')
    await loadTree()
  }
  const handleMoveNodeDown = async (nodeId: string) => {
    await reorderNavigationNode(nodeId, 'down')
    await loadTree()
  }
  const handleDropNode = async (
    nodeId: string,
    targetNodeId: string,
    position: 'before' | 'after' | 'inside',
  ) => {
    await dropNavigationNode(nodeId, targetNodeId, position)
    await loadTree()
  }
  const handleDropNodeToRoot = async (nodeId: string) => {
    await moveNavigationNode(nodeId, null)
    await loadTree()
  }

  const buildDefaultTaskDetail = (
    taskId: string,
    title: string,
    parentId: string | null,
    detail: TaskDetailRecord,
  ) => {
    const parentNode = parentId
      ? navigationTree.find((node) => node.id === parentId)
      : null

    return {
      id: detail.id,
      navNodeId: taskId,
      path: parentNode ? `${parentNode.title} > ${title}` : title,
      title,
      description: detail.description,
      dueDate: detail.dueDate,
      alarm: detail.alarm,
      assignee: detail.assignee,
      assignees: detail.assignees,
      completed: detail.completed,
      priority: detail.priority,
      workflowStatus: detail.workflowStatus,
      tags: detail.tags,
      isFavorite: false,
      attachments: detail.attachments,
      subTasks: [],
      memos: [],
      comments: [],
    } as TaskDetail
  }

  const handleCreateFolder = async (title: string, parentId: string | null) => {
    await createFolder(title, parentId)
    await loadTree()
  }

  const handleCreateTask = async (title: string, parentId: string | null) => {
    const result = (await createTask(title, parentId)) as {
      id: string
      detail: TaskDetailRecord
    }

    setTaskDetails((prev) => ({
      ...prev,
      [result.id]: buildDefaultTaskDetail(result.id, title, parentId, result.detail),
    }))

    await loadTree()
    setSelectedTaskId(result.id)
    setActiveView('task')
  }

  const handleToggleSubTask = async (subTaskId: string) => {
    const updatedSubTask = await toggleSubTask(subTaskId)

    setTaskDetails((prev) => {
      const currentTask = prev[selectedTaskId]
      if (!currentTask) {
        return prev
      }

      return {
        ...prev,
        [selectedTaskId]: {
          ...currentTask,
          subTasks: currentTask.subTasks.map((subTask) =>
            subTask.id === subTaskId
              ? updatedSubTask
              : subTask,
          ),
        },
      }
    })
  }

  const handleAddSubTask = async (title: string) => {
    const createdSubTask = await createSubTask(selectedTaskId, title)

    setTaskDetails((prev) => {
      const currentTask = prev[selectedTaskId]
      if (!currentTask) {
        return prev
      }

      return {
        ...prev,
        [selectedTaskId]: {
          ...currentTask,
          subTasks: [
            ...currentTask.subTasks,
            createdSubTask,
          ],
        },
      }
    })
  }

  const handleDeleteSubTask = async (subTaskId: string) => {
    await deleteSubTask(subTaskId)

    setTaskDetails((prev) => {
      const currentTask = prev[selectedTaskId]
      if (!currentTask) {
        return prev
      }

      return {
        ...prev,
        [selectedTaskId]: {
          ...currentTask,
          subTasks: currentTask.subTasks.filter((subTask) => subTask.id !== subTaskId),
        },
      }
    })
  }

  const handleUpdateSubTask = async (
    subTaskId: string,
    field: 'title' | 'dueDate' | 'assignee' | 'assignees',
    value: string | string[],
  ) => {
    const updatedSubTask = await updateSubTask(subTaskId, field, value)

    setTaskDetails((prev) => {
      const currentTask = prev[selectedTaskId]
      if (!currentTask) {
        return prev
      }

      return {
        ...prev,
        [selectedTaskId]: {
          ...currentTask,
          subTasks: currentTask.subTasks.map((subTask) =>
            subTask.id === subTaskId
              ? updatedSubTask
              : subTask,
          ),
        },
      }
    })
  }

  const saveSubTaskOrder = async (orderedItems: SubTaskRecord[]) => {
    const savedItems = await reorderSubTasks(
      selectedTaskId,
      orderedItems.map((subTask) => subTask.id),
    )

    setTaskDetails((prev) => {
      const currentTask = prev[selectedTaskId]
      if (!currentTask) {
        return prev
      }

      return {
        ...prev,
        [selectedTaskId]: {
          ...currentTask,
          subTasks: savedItems,
        },
      }
    })
  }

  const handleSortSubTasksByDueDate = async () => {
    const currentTask = taskDetails[selectedTaskId]
    if (!currentTask) return
    await saveSubTaskOrder(sortSubTasks(currentTask.subTasks))
  }

  const handleReorderSubTasks = async (orderedIds: string[]) => {
    const currentTask = taskDetails[selectedTaskId]
    if (!currentTask) return

    const itemMap = new Map(
      currentTask.subTasks.map((subTask) => [subTask.id, subTask]),
    )
    const orderedItems = orderedIds
      .map((id) => itemMap.get(id))
      .filter((item): item is SubTaskRecord => Boolean(item))

    if (orderedItems.length !== currentTask.subTasks.length) return
    await saveSubTaskOrder(orderedItems)
  }

  const handleCreateMemo = async (contentHtml: string) => {
    const savedMemo = await createMemo(selectedTaskId, contentHtml)

    setTaskDetails((prev) => {
      const currentTask = prev[selectedTaskId]
      if (!currentTask) {
        return prev
      }

      return {
        ...prev,
        [selectedTaskId]: {
          ...currentTask,
          memos: [...currentTask.memos, savedMemo],
        },
      }
    })
  }

  const handleUpdateMemo = async (memoId: string, contentHtml: string) => {
    const savedMemo = await updateMemo(memoId, contentHtml)
    setTaskDetails((prev) => {
      const currentTask = prev[selectedTaskId]
      if (!currentTask) return prev
      return {
        ...prev,
        [selectedTaskId]: {
          ...currentTask,
          memos: currentTask.memos.map((memo) =>
            memo.id === memoId ? savedMemo : memo,
          ),
        },
      }
    })
  }

  const handleDeleteMemo = async (memoId: string) => {
    await deleteMemo(memoId)
    setTaskDetails((prev) => {
      const currentTask = prev[selectedTaskId]
      if (!currentTask) return prev
      return {
        ...prev,
        [selectedTaskId]: {
          ...currentTask,
          memos: currentTask.memos.filter((memo) => memo.id !== memoId),
        },
      }
    })
  }

  const handleAddComment = async (parentId: string | null, content: string) => {
    const createdComment = await createComment(
      selectedTaskId,
      parentId,
      content,
    )

    setTaskDetails((prev) => {
      const currentTask = prev[selectedTaskId]
      if (!currentTask) {
        return prev
      }

      return {
        ...prev,
        [selectedTaskId]: {
          ...currentTask,
          comments: [
            ...currentTask.comments,
            createdComment,
          ],
        },
      }
    })
  }

  const handleEditComment = async (commentId: string, nextContent: string) => {
    const updatedComment = await updateComment(commentId, nextContent)

    setTaskDetails((prev) => {
      const currentTask = prev[selectedTaskId]
      if (!currentTask) {
        return prev
      }

      return {
        ...prev,
        [selectedTaskId]: {
          ...currentTask,
          comments: currentTask.comments.map((comment) =>
            comment.id === commentId
              ? updatedComment
              : comment,
          ),
        },
      }
    })
  }

  const handleDeleteComment = async (commentId: string) => {
    const deletedComment = await deleteComment(commentId)

    setTaskDetails((prev) => {
      const currentTask = prev[selectedTaskId]
      if (!currentTask) {
        return prev
      }

      return {
        ...prev,
        [selectedTaskId]: {
          ...currentTask,
          comments: currentTask.comments.map((comment) =>
            comment.id === commentId
              ? deletedComment
              : comment,
          ),
        },
      }
    })
  }

  const handleAddAttachment = async () => {
    const attachment = await selectAndCreateAttachment(selectedTaskId)

    if (!attachment) {
      return
    }

    setTaskDetails((prev) => {
      const currentTask = prev[selectedTaskId]

      if (!currentTask) {
        return prev
      }

      return {
        ...prev,
        [selectedTaskId]: {
          ...currentTask,
          attachments: [...currentTask.attachments, attachment],
        },
      }
    })

  }

  const handleOpenAttachment = async (attachmentId: string) => {
    await openAttachment(attachmentId)
  }

  const applyUpdatedTask = (updatedTask: TaskDetailRecord) => {
    const selectedNode = navigationTree.find((node) => node.id === selectedTaskId)
    const parentNode = selectedNode?.parentId
      ? navigationTree.find((node) => node.id === selectedNode.parentId)
      : null
    const path = parentNode ? `${parentNode.title} > ${updatedTask.title}` : updatedTask.title

    setTaskDetails((prev) => {
      const currentTask = prev[selectedTaskId]
      if (!currentTask) return prev
      return {
        ...prev,
        [selectedTaskId]: {
          ...currentTask,
          ...updatedTask,
          path,
        },
      }
    })
    setNavigationTree((prev) => prev.map((node) =>
      node.id === selectedTaskId
        ? { ...node, title: updatedTask.title, completed: updatedTask.completed }
        : node,
    ))
  }

  const selectNextIncompleteTask = (hiddenTaskId: string) => {
    const hiddenNode = navigationTree.find((node) => node.id === hiddenTaskId)
    const nextTask = navigationTree
      .filter((node) => (
        node.type === 'task'
        && node.id !== hiddenTaskId
        && !node.completed
      ))
      .sort((left, right) => {
        const leftSameFolder = left.parentId === hiddenNode?.parentId ? 0 : 1
        const rightSameFolder = right.parentId === hiddenNode?.parentId ? 0 : 1
        return leftSameFolder - rightSameFolder || left.order - right.order
      })[0]

    setTaskDetails({})
    setSelectedTaskId(nextTask?.id ?? '')
  }

  const handleShowCompletedTasksChange = (showCompleted: boolean) => {
    if (showCompleted === showCompletedTasks) return

    const currentTask = taskDetails[selectedTaskId]
    const currentNode = navigationTree.find((node) => node.id === selectedTaskId)
    if (
      !showCompleted
      && activeView === 'task'
      && (currentTask?.completed || currentNode?.completed)
    ) {
      if (!confirmDiscardDirtyDrafts(
        '현재 완료된 Task가 숨겨집니다. 저장하지 않은 변경사항을 버리고 완료 Task를 숨기시겠습니까?',
      )) return
      selectNextIncompleteTask(selectedTaskId)
    }

    setShowCompletedTasks(showCompleted)
  }

  const handleToggleTaskCompleted = async () => {
    const currentTask = taskDetails[selectedTaskId]
    const willComplete = !currentTask?.completed
    if (
      !showCompletedTasks
      && willComplete
      && !confirmDiscardDirtyDrafts(
        '완료 처리하면 이 Task가 숨겨집니다. 저장하지 않은 변경사항을 버리고 완료 처리하시겠습니까?',
      )
    ) return

    const updatedTask = await toggleTaskCompleted(selectedTaskId)
    applyUpdatedTask(updatedTask)
    if (!showCompletedTasks && updatedTask.completed) {
      selectNextIncompleteTask(selectedTaskId)
    }
  }

  const handleUpdateTask = async (changes: TaskDetailChanges) => {
    const currentTask = taskDetails[selectedTaskId]
    const willComplete = changes.completed === true || changes.workflowStatus === 'done'
    if (
      !showCompletedTasks
      && !currentTask?.completed
      && willComplete
      && !confirmDiscardDirtyDrafts(
        '완료 상태로 변경하면 이 Task가 숨겨집니다. 저장하지 않은 변경사항을 버리고 계속하시겠습니까?',
      )
    ) return

    const updatedTask = await updateTaskDetail(selectedTaskId, changes)
    applyUpdatedTask(updatedTask)
    if (!showCompletedTasks && updatedTask.completed) {
      selectNextIncompleteTask(selectedTaskId)
    }
    if (Object.hasOwn(changes, 'assigneeIds')) {
      setAssigneeUsers(await getAssigneeUsers())
      await loadTree()
    }
  }

  const handleUpdateTaskField = async (field: 'dueDate' | 'alarm', value: string) => {
    await handleUpdateTask({ [field]: value })
  }

  const handleUpdateTaskTitle = async (title: string) => {
    await handleUpdateTask({ title })
  }

  const handleUpdateTaskAssignees = async (assigneeIds: string[]) => {
    await handleUpdateTask({ assigneeIds })
  }

  const handleToggleFavorite = async () => {
    const currentTask = taskDetails[selectedTaskId]
    if (!currentTask) return
    const state = await setTaskFavorite(selectedTaskId, !currentTask.isFavorite) as { isFavorite: boolean }
    setTaskDetails((prev) => ({
      ...prev,
      [selectedTaskId]: { ...prev[selectedTaskId], isFavorite: state.isFavorite },
    }))
  }

  const selectedTaskDetail = taskDetails[selectedTaskId]

  // Expand every ancestor folder of a Task so it becomes visible in the
  // Navigation tree. Used when a Task is opened from a place other than the
  // tree itself (e.g. the briefing screen), where the containing folder may be
  // collapsed. Only the specific ancestor chain is expanded and persisted with
  // per-node calls; this must NOT be confused with the expand/collapse-all
  // action, which uses the dedicated bulk API.
  const expandTaskAncestors = (taskId: string) => {
    const nodesById = new Map(navigationTree.map((node) => [node.id, node]))
    const taskNode = nodesById.get(taskId)
    if (!taskNode) return

    const collapsedAncestorIds: string[] = []
    let ancestorId = taskNode.parentId
    while (ancestorId) {
      const ancestor = nodesById.get(ancestorId)
      if (!ancestor || ancestor.type !== 'folder') break
      if (!ancestor.expanded) collapsedAncestorIds.push(ancestor.id)
      ancestorId = ancestor.parentId
    }

    if (collapsedAncestorIds.length === 0) return

    const collapsedAncestorIdSet = new Set(collapsedAncestorIds)

    // Optimistically flip the ancestor chain so the Task shows immediately.
    setNavigationTree((prev) =>
      prev.map((node) =>
        collapsedAncestorIdSet.has(node.id) && node.type === 'folder'
          ? { ...node, expanded: true }
          : node,
      ),
    )

    // Persist each ancestor's expanded state; refresh from the server on failure.
    void Promise.all(
      collapsedAncestorIds.map((folderId) =>
        setNavigationNodeExpanded(folderId, true),
      ),
    ).catch(async (error) => {
      console.error('Failed to expand ancestor folders:', error)
      await loadTree()
    })
  }

  const handleSelectTask = (taskId: string) => {
    if (taskId !== selectedTaskId && !confirmDiscardDirtyDrafts()) return
    if (taskId !== selectedTaskId) setTaskDetails({})
    expandTaskAncestors(taskId)
    setSelectedTaskId(taskId)
    setActiveView('task')
  }

  const handleOpenView = (view: 'briefing' | 'workspace' | 'trash', smartView?: WorkspaceView) => {
    if (!confirmDiscardDirtyDrafts()) return
    if (smartView) setWorkspaceView(smartView)
    setActiveView(view)
  }

  const handleOpenSearchHit = (hit: NavigationSearchHit) => {
    if (!hit.taskId || !confirmDiscardDirtyDrafts()) return
    setTaskDetails({})
    setSelectedTaskId(hit.taskId)
    setPendingSearchHit(hit)
    setActiveView('task')
  }

  useEffect(() => {
    if (!pendingSearchHit || !selectedTaskDetail || pendingSearchHit.taskId !== selectedTaskId) return
    const timer = window.setTimeout(() => {
      const exactSelector = `[data-search-entity="${CSS.escape(pendingSearchHit.entityType)}"][data-search-id="${CSS.escape(pendingSearchHit.entityId)}"]`
      const fallbackSelector = `[data-search-entity="${CSS.escape(pendingSearchHit.entityType)}"]`
      const target = document.querySelector<HTMLElement>(exactSelector)
        ?? document.querySelector<HTMLElement>(fallbackSelector)
      if (!target) return
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      target.focus({ preventScroll: true })
      target.classList.add('is-search-target-highlight')
      window.setTimeout(() => target.classList.remove('is-search-target-highlight'), 2400)
      setPendingSearchHit(null)
    }, 80)
    return () => window.clearTimeout(timer)
  }, [pendingSearchHit, selectedTaskDetail, selectedTaskId])

  useEffect(() => {
    const handleQuickCreateShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'n') return
      event.preventDefault()
      if (!confirmDiscardDirtyDrafts('저장하지 않은 변경사항이 있습니다. 변경사항을 버리고 새 Task를 등록하시겠습니까?')) return
      setQuickCreateError('')
      setIsQuickCreateOpen(true)
    }
    window.addEventListener('keydown', handleQuickCreateShortcut)
    return () => window.removeEventListener('keydown', handleQuickCreateShortcut)
  }, [])

  useEffect(() => {
    const dirty = isQuickCreateOpen && Boolean(quickCreateTitle.trim())
    setDraftDirty('quick-create-task', dirty, () => {
      setQuickCreateTitle('')
      setQuickCreateParentId('root')
      setQuickCreateError('')
      setIsQuickCreateOpen(false)
    })
    return () => setDraftDirty('quick-create-task', false)
  }, [isQuickCreateOpen, quickCreateTitle])

  const handleQuickCreate = async () => {
    const title = quickCreateTitle.trim()
    if (!title) {
      setQuickCreateError('Task 제목을 입력해 주세요.')
      return
    }
    setIsQuickCreating(true)
    setQuickCreateError('')
    try {
      await handleCreateTask(title, quickCreateParentId === 'root' ? null : quickCreateParentId)
      setQuickCreateTitle('')
      setQuickCreateParentId('root')
      setIsQuickCreateOpen(false)
    } catch (error) {
      console.error('Failed to quick-create Task:', error)
      setQuickCreateError('Task를 등록하지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setIsQuickCreating(false)
    }
  }

  return (
    <>
    <div
      className={`app-shell ${isNavigationCollapsed ? 'is-navigation-collapsed' : ''}`}
      style={{
        gridTemplateColumns: isNavigationCollapsed
          ? '0 0 minmax(0, 1fr)'
          : `${navigationWidth}px 8px minmax(0, 1fr)`,
      }}
    >
      {!isNavigationCollapsed && <NavigationBar
        currentUser={currentUser}
        onOpenAdmin={onOpenAdmin}
        onLogout={onLogout}
        onCollapse={() => setIsNavigationCollapsed(true)}
        isBriefingActive={activeView === 'briefing'}
        onOpenBriefing={() => handleOpenView('briefing')}
        activeSmartView={activeView === 'workspace' ? workspaceView : null}
        onOpenSmartView={(view) => handleOpenView('workspace', view)}
        isTrashActive={activeView === 'trash'}
        onOpenTrash={() => handleOpenView('trash')}
        onOpenSearchHit={handleOpenSearchHit}
        tree={navigationTree}
        searchQuery={navigationSearchQuery}
        onSearchQueryChange={setNavigationSearchQuery}
        navigationScope={navigationScope}
        onNavigationScopeChange={setNavigationScope}
        showCompletedTasks={showCompletedTasks}
        onShowCompletedTasksChange={handleShowCompletedTasksChange}
        isNavigationLoading={isNavigationLoading}
        navigationError={navigationError}
        selectedTaskId={selectedTaskId}
        onSelectTask={handleSelectTask}
        onToggleFolder={handleToggleFolder}
        onSetAllFoldersExpanded={handleSetAllFoldersExpanded}
        onRenameNode={handleRenameNode}
        onCreateFolder={handleCreateFolder}
        onCreateTask={handleCreateTask}
        onCreateChildFolder={handleCreateChildFolder}
        onCreateChildTask={handleCreateChildTask}
        onDeleteNode={handleDeleteNode}
        onMoveNode={handleMoveNode}
        onCopyNode={handleCopyNode}
        onMoveNodeUp={handleMoveNodeUp}
        onMoveNodeDown={handleMoveNodeDown}
        onDropNode={handleDropNode}
        onDropNodeToRoot={handleDropNodeToRoot}
      />}

      {!isNavigationCollapsed && <div
        className="navigation-resize-handle"
        onMouseDown={handleResizeMouseDown}
        role="separator"
        aria-label="Navigation Bar 너비 조절"
      >
        <div className="navigation-resize-grip" />
      </div>}

      {isNavigationCollapsed && (
        <button
          className="navigation-expand-button"
          type="button"
          aria-label="Navigation Bar 펼치기"
          title="Navigation Bar 펼치기"
          onClick={() => setIsNavigationCollapsed(false)}
        >
          ›
        </button>
      )}

      <main className="detail-screen">
        <div className="detail-content">
          {activeView === 'briefing' ? (
            <ToDoBriefing key={userRevision} onOpenTask={handleSelectTask} remoteRefreshRevision={remoteRefreshRevision} onRemoteRefreshComplete={handleChildRemoteRefresh} />
          ) : activeView === 'workspace' ? (
            <WorkspaceViewPanel initialView={workspaceView} revision={userRevision} remoteRefreshRevision={remoteRefreshRevision} onRemoteRefreshComplete={handleChildRemoteRefresh} onOpenTask={handleSelectTask} onViewChange={setWorkspaceView} showCompletedTasks={showCompletedTasks} onShowCompletedTasksChange={handleShowCompletedTasksChange} />
          ) : activeView === 'trash' ? (
            <TrashView revision={userRevision} remoteRefreshRevision={remoteRefreshRevision} onRemoteRefreshComplete={handleChildRemoteRefresh} onTreeChanged={async () => { await loadTree() }} />
          ) : selectedTaskDetail ? (
            <section
              key={selectedTaskId}
              className="selected-task-detail"
              aria-label={`${selectedTaskDetail.title} 상세정보`}
            >
              <TaskHeader
                taskDetail={selectedTaskDetail}
                assigneeUsers={assigneeUsers}
                onAddAttachment={handleAddAttachment}
                onOpenAttachment={handleOpenAttachment}
                onToggleCompleted={handleToggleTaskCompleted}
                onToggleFavorite={handleToggleFavorite}
                onUpdateTitle={handleUpdateTaskTitle}
                onUpdateField={handleUpdateTaskField}
                onUpdateAssignees={handleUpdateTaskAssignees}
                onUpdateTask={handleUpdateTask}
              />
              <section className="content-card detail-task-list-card">
                <div className="detail-task-list-heading">
                  <div><span>FOLDER TASKS</span><strong>현재 폴더 업무 목록</strong></div>
                  <small>
                    {navigationTree.filter((node) =>
                      node.type === 'task' &&
                      (showCompletedTasks || !node.completed) &&
                      node.parentId === navigationTree.find((item) => item.id === selectedTaskId)?.parentId
                    ).length}개
                  </small>
                </div>
                <div className="detail-task-list">
                  {navigationTree
                    .filter((node) =>
                      node.type === 'task' &&
                      (showCompletedTasks || !node.completed) &&
                      node.parentId === navigationTree.find((item) => item.id === selectedTaskId)?.parentId
                    )
                    .sort((left, right) => left.order - right.order)
                    .map((node) => (
                      <button
                        className={`${node.id === selectedTaskId ? 'is-current' : ''}${node.completed ? ' is-completed' : ''}`}
                        type="button"
                        key={node.id}
                        onClick={() => handleSelectTask(node.id)}
                      >
                        <i aria-hidden="true">{node.completed ? '✓' : '○'}</i>
                        <span>{node.title}</span>
                      </button>
                    ))}
                </div>
              </section>
              <SubTaskSection
                taskId={selectedTaskId}
                subTasks={selectedTaskDetail.subTasks}
                taskAssignees={selectedTaskDetail.assignees}
                onToggleSubTask={handleToggleSubTask}
                onAddSubTask={handleAddSubTask}
                onDeleteSubTask={handleDeleteSubTask}
                onUpdateSubTask={handleUpdateSubTask}
                onSortByDueDate={handleSortSubTasksByDueDate}
                onReorderSubTasks={handleReorderSubTasks}
                showCompletedSubTasks={showCompletedSubTasks}
                onShowCompletedSubTasksChange={setShowCompletedSubTasks}
              />
              <MemoSection
                key={selectedTaskId}
                taskId={selectedTaskId}
                memos={selectedTaskDetail.memos}
                comments={selectedTaskDetail.comments}
                onCreateMemo={handleCreateMemo}
                onUpdateMemo={handleUpdateMemo}
                onDeleteMemo={handleDeleteMemo}
                onAddComment={handleAddComment}
                onEditComment={handleEditComment}
                onDeleteComment={handleDeleteComment}
              />
            </section>
          ) : (
            <div className="empty-detail-state">
              <div className="empty-detail-icon">✓</div>
              <h1>선택할 Task가 없습니다</h1>
              <p>왼쪽 Navigation에서 새 Task를 추가해 시작해 보세요.</p>
            </div>
          )}
        </div>
      </main>
    </div>
    {isQuickCreateOpen && (
      <div className="modal-backdrop">
        <div className="quick-create-modal">
          <div className="task-field-modal-header"><div><span>CTRL + N</span><h3>빠른 Task 등록</h3></div><button type="button" onClick={() => setIsQuickCreateOpen(false)}>×</button></div>
          <label>Task 제목<input autoFocus value={quickCreateTitle} onChange={(event) => setQuickCreateTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void handleQuickCreate(); if (event.key === 'Escape') setIsQuickCreateOpen(false) }} placeholder="새 Task 제목" /></label>
          <label>폴더<select value={quickCreateParentId} onChange={(event) => setQuickCreateParentId(event.target.value)}><option value="root">최상위</option>{navigationTree.filter((node) => node.type === 'folder').map((folder) => <option key={folder.id} value={folder.id}>{folder.title}</option>)}</select></label>
          {quickCreateError && <div className="task-field-error" role="alert">{quickCreateError}</div>}
          <div className="confirm-modal-actions"><button type="button" disabled={isQuickCreating} onClick={() => void handleQuickCreate()}>{isQuickCreating ? '등록 중...' : '등록'}</button><button type="button" disabled={isQuickCreating} onClick={() => setIsQuickCreateOpen(false)}>취소</button></div>
        </div>
      </div>
    )}
    </>
  )
}

export default MainLayout
