import { useEffect, useRef, useState } from 'react'
import ToDoBriefing from '../features/briefing/components/ToDoBriefing'
import MemoSection from '../features/memo/components/MemoSection'
import NavigationBar from '../features/navigation-bar/components/NavigationBar'
import SubTaskSection from '../features/sub-task/components/SubTaskSection'
import TaskHeader from '../features/task/components/TaskHeader'
import type { AuthUser } from '../services/api/authApi'
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
import { getMemo, saveMemo } from '../services/api/memoApi'
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
  setNavigationNodeExpanded,
} from '../services/api/navigationApi'
import {
  createSubTask,
  deleteSubTask,
  getSubTasks,
  toggleSubTask,
  updateSubTask,
  type SubTaskRecord,
} from '../services/api/subTaskApi'
import {
  getTaskDetail,
  toggleTaskCompleted,
  updateTaskDetail,
  type TaskDetailRecord,
} from '../services/api/taskApi'
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
  attachments: Array<{ id: string; name: string }>
  subTasks: SubTaskRecord[]
  memo: string
  memoAuthor: string
  memoUpdatedAt: string
  comments: Array<{
    id: string
    parentId: string | null
    author: string
    createdAt: string
    content: string
    deleted?: boolean
  }>
}

const MIN_NAVIGATION_WIDTH = 300
const MAX_NAVIGATION_WIDTH = 520

function sortSubTasks(items: SubTaskRecord[]) {
  return [...items].sort((left, right) => {
    if (!left.dueDate && right.dueDate) return 1
    if (left.dueDate && !right.dueDate) return -1

    const dueDateOrder = left.dueDate.localeCompare(right.dueDate)
    if (dueDateOrder !== 0) return dueDateOrder

    const createdAtOrder = left.createdAt.localeCompare(right.createdAt)
    if (createdAtOrder !== 0) return createdAtOrder

    const creationOrder = left.creationOrder - right.creationOrder
    return creationOrder !== 0 ? creationOrder : left.id.localeCompare(right.id)
  })
}

type MainLayoutProps = {
  currentUser: AuthUser
  userRevision: number
  onOpenAdmin: () => void
  onLogout: () => void
}

function MainLayout({
  currentUser,
  userRevision,
  onOpenAdmin,
  onLogout,
}: MainLayoutProps) {
  const [navigationWidth, setNavigationWidth] = useState(MIN_NAVIGATION_WIDTH)
  const [isNavigationCollapsed, setIsNavigationCollapsed] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState<TaskId>('task-1')
  const [navigationTree, setNavigationTree] = useState<NavigationNode[]>([])
  const [taskDetails, setTaskDetails] = useState<Record<string, TaskDetail>>({})
  const [assigneeUsers, setAssigneeUsers] = useState<AssigneeUser[]>([])
  const [activeView, setActiveView] = useState<'task' | 'briefing'>('task')
  const isDraggingRef = useRef(false)

  const loadTree = async () => {
    try {
      const tree = await getNavigationTree()
      const navigationNodes = tree as NavigationNode[]
      setNavigationTree(navigationNodes)
      setSelectedTaskId((currentTaskId) => {
        const currentTaskExists = navigationNodes.some(
          (node) => node.id === currentTaskId && node.type === 'task',
        )

        if (currentTaskExists) {
          return currentTaskId
        }

        return navigationNodes.find((node) => node.type === 'task')?.id ?? ''
      })
    } catch (error) {
      console.error('Failed to load navigation tree from DB:', error)
    }
  }

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
      setSelectedTaskId(taskId)
      setActiveView('task')
    })
  }, [])

  useEffect(() => {
    return window.api.app.onOpenBriefing(() => {
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
    // The initial tree is loaded from the external server after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTree()
  }, [])

  useEffect(() => {
    getAssigneeUsers()
      .then(setAssigneeUsers)
      .catch((error) => {
        console.error('Failed to load assignee users from DB:', error)
      })
  }, [userRevision])

  useEffect(() => {
    const selectedNode = navigationTree.find((node) => node.id === selectedTaskId)

    if (!selectedNode || selectedNode.type !== 'task') {
      return
    }

    let cancelled = false

    const loadTaskContent = async () => {
      try {
        const [taskDetail, subTasks, memo, comments] = await Promise.all([
          getTaskDetail(selectedTaskId),
          getSubTasks(selectedTaskId),
          getMemo(selectedTaskId),
          getComments(selectedTaskId),
        ])

        if (cancelled) {
          return
        }

        const parentNode = selectedNode.parentId
          ? navigationTree.find((node) => node.id === selectedNode.parentId)
          : null
        const taskPath = parentNode
          ? `${parentNode.title} > ${taskDetail.title}`
          : taskDetail.title

        setTaskDetails((prev) => {
          return {
            ...prev,
            [selectedTaskId]: {
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
              attachments: taskDetail.attachments,
              subTasks: sortSubTasks(subTasks),
              memo: memo.content,
              memoAuthor: memo.author,
              memoUpdatedAt: memo.updatedAt,
              comments,
            },
          }
        })
      } catch (error) {
        console.error('Failed to load Task content from DB:', error)
      }
    }

    loadTaskContent()

    return () => {
      cancelled = true
    }
  }, [selectedTaskId, navigationTree])

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
      attachments: detail.attachments,
      subTasks: [],
      memo: '',
      memoAuthor: '',
      memoUpdatedAt: '',
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
          subTasks: sortSubTasks(currentTask.subTasks.map((subTask) =>
            subTask.id === subTaskId
              ? updatedSubTask
              : subTask,
          )),
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
          subTasks: sortSubTasks([
            ...currentTask.subTasks,
            createdSubTask,
          ]),
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
    field: 'title' | 'dueDate' | 'assignee',
    value: string,
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
          subTasks: sortSubTasks(currentTask.subTasks.map((subTask) =>
            subTask.id === subTaskId
              ? updatedSubTask
              : subTask,
          )),
        },
      }
    })
  }

  const handleSaveMemo = async (nextMemo: string) => {
    const savedMemo = await saveMemo(selectedTaskId, nextMemo)

    setTaskDetails((prev) => {
      const currentTask = prev[selectedTaskId]
      if (!currentTask) {
        return prev
      }

      return {
        ...prev,
        [selectedTaskId]: {
          ...currentTask,
          memo: savedMemo.content,
          memoAuthor: savedMemo.author,
          memoUpdatedAt: savedMemo.updatedAt,
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

  const handleToggleTaskCompleted = async () => {
    const updatedTask = await toggleTaskCompleted(selectedTaskId)

    setTaskDetails((prev) => {
      const currentTask = prev[selectedTaskId]

      if (!currentTask) {
        return prev
      }

      return {
        ...prev,
        [selectedTaskId]: {
          ...currentTask,
          completed: updatedTask.completed,
        },
      }
    })

    setNavigationTree((prev) =>
      prev.map((node) =>
        node.id === selectedTaskId
          ? { ...node, completed: updatedTask.completed }
          : node,
      ),
    )
  }

  const handleUpdateTaskField = async (
    field: 'dueDate' | 'alarm',
    value: string,
  ) => {
    const currentTask = taskDetails[selectedTaskId]

    if (!currentTask) {
      return
    }

    const updatedTask = await updateTaskDetail(selectedTaskId, {
      title: currentTask.title,
      description: currentTask.description,
      dueDate: field === 'dueDate' ? value : currentTask.dueDate,
      alarm: field === 'alarm' ? value : currentTask.alarm,
      assignee: currentTask.assignee,
      assigneeIds: currentTask.assignees.map((assignee) => assignee.id),
      manualAssigneeNames: [],
    })

    setTaskDetails((prev) => {
      const currentTask = prev[selectedTaskId]

      if (!currentTask) {
        return prev
      }

      return {
        ...prev,
        [selectedTaskId]: {
          ...currentTask,
          dueDate: updatedTask.dueDate,
          alarm: updatedTask.alarm,
          assignee: updatedTask.assignee,
          assignees: updatedTask.assignees,
        },
      }
    })

  }

  const handleUpdateTaskTitle = async (title: string) => {
    const currentTask = taskDetails[selectedTaskId]
    if (!currentTask) return

    const updatedTask = await updateTaskDetail(selectedTaskId, {
      title,
      description: currentTask.description,
      dueDate: currentTask.dueDate,
      alarm: currentTask.alarm,
      assignee: currentTask.assignee,
      assigneeIds: currentTask.assignees.map((assignee) => assignee.id),
      manualAssigneeNames: [],
    })

    const selectedNode = navigationTree.find((node) => node.id === selectedTaskId)
    const parentNode = selectedNode?.parentId
      ? navigationTree.find((node) => node.id === selectedNode.parentId)
      : null
    const path = parentNode ? `${parentNode.title} > ${updatedTask.title}` : updatedTask.title

    setTaskDetails((prev) => ({
      ...prev,
      [selectedTaskId]: {
        ...prev[selectedTaskId],
        title: updatedTask.title,
        path,
      },
    }))
    setNavigationTree((prev) =>
      prev.map((node) =>
        node.id === selectedTaskId ? { ...node, title: updatedTask.title } : node,
      ),
    )
  }

  const handleUpdateTaskAssignees = async (
    assigneeIds: string[],
    manualAssigneeNames: string[],
  ) => {
    const currentTask = taskDetails[selectedTaskId]
    if (!currentTask) {
      return
    }

    const updatedTask = await updateTaskDetail(selectedTaskId, {
      title: currentTask.title,
      description: currentTask.description,
      dueDate: currentTask.dueDate,
      alarm: currentTask.alarm,
      assignee: currentTask.assignee,
      assigneeIds,
      manualAssigneeNames,
    })

    setTaskDetails((prev) => ({
      ...prev,
      [selectedTaskId]: {
        ...prev[selectedTaskId],
        assignee: updatedTask.assignee,
        assignees: updatedTask.assignees,
      },
    }))
    setAssigneeUsers(await getAssigneeUsers())
  }

  const selectedTaskDetail = taskDetails[selectedTaskId]
  const handleSelectTask = (taskId: string) => {
    setSelectedTaskId(taskId)
    setActiveView('task')
  }

  return (
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
        onOpenBriefing={() => setActiveView('briefing')}
        tree={navigationTree}
        selectedTaskId={selectedTaskId}
        onSelectTask={handleSelectTask}
        onToggleFolder={handleToggleFolder}
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
            <ToDoBriefing onOpenTask={handleSelectTask} />
          ) : selectedTaskDetail ? (
            <>
              <TaskHeader
                key={selectedTaskId}
                taskDetail={selectedTaskDetail}
                assigneeUsers={assigneeUsers}
                onAddAttachment={handleAddAttachment}
                onOpenAttachment={handleOpenAttachment}
                onToggleCompleted={handleToggleTaskCompleted}
                onUpdateTitle={handleUpdateTaskTitle}
                onUpdateField={handleUpdateTaskField}
                onUpdateAssignees={handleUpdateTaskAssignees}
              />
              <SubTaskSection
                subTasks={selectedTaskDetail.subTasks}
                taskAssignees={selectedTaskDetail.assignees}
                onToggleSubTask={handleToggleSubTask}
                onAddSubTask={handleAddSubTask}
                onDeleteSubTask={handleDeleteSubTask}
                onUpdateSubTask={handleUpdateSubTask}
              />
              <MemoSection
                key={selectedTaskId}
                memo={selectedTaskDetail.memo}
                memoAuthor={selectedTaskDetail.memoAuthor}
                memoUpdatedAt={selectedTaskDetail.memoUpdatedAt}
                comments={selectedTaskDetail.comments}
                onSaveMemo={handleSaveMemo}
                onAddComment={handleAddComment}
                onEditComment={handleEditComment}
                onDeleteComment={handleDeleteComment}
              />
            </>
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
  )
}

export default MainLayout
