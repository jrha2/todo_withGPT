import { useEffect, useRef, useState } from 'react'
import { mockTaskDetailsById } from '../data/mockTaskDetail'
import MemoSection from '../features/memo/components/MemoSection'
import NavigationBar from '../features/navigation-bar/components/NavigationBar'
import SubTaskSection from '../features/sub-task/components/SubTaskSection'
import TaskHeader from '../features/task/components/TaskHeader'
import {
  createFolder,
  createTask,
  getNavigationTree,
} from '../services/api/navigationApi'

type NavigationNode = {
  id: string
  parentId: string | null
  type: 'folder' | 'task'
  title: string
  expanded?: boolean
  order: number
}

type TaskId = string
type TaskDetail = (typeof mockTaskDetailsById)[keyof typeof mockTaskDetailsById]

declare global {
  interface Window {
    __preload_ok?: boolean
  }
}

function MainLayout() {
  const [navigationWidth, setNavigationWidth] = useState(300)
  const [selectedTaskId, setSelectedTaskId] = useState<TaskId>('task-1')
  const [navigationTree, setNavigationTree] = useState<NavigationNode[]>([])
  const [taskDetails, setTaskDetails] = useState<Record<string, TaskDetail>>(
    mockTaskDetailsById as Record<string, TaskDetail>,
  )
  const isDraggingRef = useRef(false)

  const preloadOk =
    typeof window !== 'undefined' ? String(window.__preload_ok) : 'no-window'
  const apiExists = typeof window !== 'undefined' && !!window.api
  const navigationApiExists =
    typeof window !== 'undefined' && !!window.api?.navigation

  const loadTree = async () => {
    try {
      const tree = await getNavigationTree()
      setNavigationTree(tree as NavigationNode[])
    } catch (error) {
      console.error('Failed to load navigation tree from DB:', error)
    }
  }

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isDraggingRef.current) {
        return
      }

      const nextWidth = Math.min(Math.max(event.clientX, 300), 520)
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
    loadTree()
  }, [])

  useEffect(() => {
    const selectedNode = navigationTree.find((node) => node.id === selectedTaskId)

    if (!selectedNode || selectedNode.type !== 'task') {
      return
    }

    setTaskDetails((prev) => {
      if (prev[selectedTaskId]) {
        return prev
      }

      const parentNode = selectedNode.parentId
        ? navigationTree.find((node) => node.id === selectedNode.parentId)
        : null

      return {
        ...prev,
        [selectedTaskId]: {
          id: `task-detail-${selectedTaskId}`,
          navNodeId: selectedTaskId,
          path: parentNode
            ? `${parentNode.title} > ${selectedNode.title}`
            : selectedNode.title,
          title: selectedNode.title,
          description: '새로 생성된 Task입니다.',
          dueDate: '2026-08-31',
          alarm: '2026-08-31 09:00:00',
          assignee: 'JH Jae-Ryong Ha',
          attachments: [],
          subTasks: [],
          memo: '',
          comments: [],
        } as TaskDetail,
      }
    })
  }, [selectedTaskId, navigationTree])

  const handleResizeMouseDown = () => {
    isDraggingRef.current = true
  }

  const handleToggleFolder = (folderId: string) => {
    setNavigationTree((prev) =>
      prev.map((node) =>
        node.id === folderId && node.type === 'folder'
          ? { ...node, expanded: !node.expanded }
          : node,
      ),
    )
  }

  const handleRenameNode = (_nodeId: string, _nextTitle: string) => {}
  const handleCreateChildFolder = (_parentId: string, _title: string) => {}
  const handleCreateChildTask = (_parentId: string, _title: string) => {}
  const handleDeleteNode = (_nodeId: string) => {}
  const handleMoveNode = (_nodeId: string, _targetFolderId: string) => {}
  const handleCopyNode = (_nodeId: string, _targetFolderId: string) => {}
  const handleMoveNodeUp = (_nodeId: string) => {}
  const handleMoveNodeDown = (_nodeId: string) => {}

  const buildDefaultTaskDetail = (taskId: string, title: string, parentId: string | null) => {
    const parentNode = parentId
      ? navigationTree.find((node) => node.id === parentId)
      : null

    return {
      id: `task-detail-${taskId}`,
      navNodeId: taskId,
      path: parentNode ? `${parentNode.title} > ${title}` : title,
      title,
      description: '새로 생성된 Task입니다.',
      dueDate: '2026-08-31',
      alarm: '2026-08-31 09:00:00',
      assignee: 'JH Jae-Ryong Ha',
      attachments: [],
      subTasks: [],
      memo: '',
      comments: [],
    } as TaskDetail
  }

  const handleCreateFolder = async (title: string, parentId: string | null) => {
    await createFolder(title, parentId)
    await loadTree()
  }

  const handleCreateTask = async (title: string, parentId: string | null) => {
    const result = (await createTask(title, parentId)) as { id: string }

    setTaskDetails((prev) => ({
      ...prev,
      [result.id]: buildDefaultTaskDetail(result.id, title, parentId),
    }))

    await loadTree()
    setSelectedTaskId(result.id)
  }

  const handleToggleSubTask = (subTaskId: string) => {
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
              ? { ...subTask, completed: !subTask.completed }
              : subTask,
          ),
        },
      }
    })
  }

  const handleAddSubTask = (title: string) => {
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
            {
              id: `subtask-${Date.now()}`,
              title,
              dueDate: currentTask.dueDate,
              assignee: currentTask.assignee.split(' ')[0],
              completed: false,
            },
          ],
        },
      }
    })
  }

  const handleDeleteSubTask = (subTaskId: string) => {
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

  const handleUpdateSubTask = (
    subTaskId: string,
    field: 'dueDate' | 'assignee',
    value: string,
  ) => {
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
              ? {
                  ...subTask,
                  [field]: value,
                }
              : subTask,
          ),
        },
      }
    })
  }

  const handleSaveMemo = (nextMemo: string) => {
    setTaskDetails((prev) => {
      const currentTask = prev[selectedTaskId]
      if (!currentTask) {
        return prev
      }

      return {
        ...prev,
        [selectedTaskId]: {
          ...currentTask,
          memo: nextMemo,
        },
      }
    })
  }

  const handleAddComment = (parentId: string | null, content: string) => {
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
            {
              id: `comment-${Date.now()}`,
              parentId,
              author: 'JH',
              createdAt: new Date().toLocaleString('sv-SE').replace('T', ' '),
              content,
              deleted: false,
            },
          ],
        },
      }
    })
  }

  const handleEditComment = (commentId: string, nextContent: string) => {
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
              ? {
                  ...comment,
                  content: nextContent,
                }
              : comment,
          ),
        },
      }
    })
  }

  const handleDeleteComment = (commentId: string) => {
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
              ? {
                  ...comment,
                  content: '',
                  deleted: true,
                }
              : comment,
          ),
        },
      }
    })
  }

  const selectedTaskDetail = taskDetails[selectedTaskId]

  if (!selectedTaskDetail) {
    return (
      <div
        style={{
          padding: 24,
          fontSize: 14,
          color: '#444',
          fontFamily: 'sans-serif',
        }}
      >
        선택된 Task에 대한 상세 데이터가 없습니다.
      </div>
    )
  }

  return (
    <div
      className="app-shell"
      style={{ gridTemplateColumns: `${navigationWidth}px 14px 1fr`, position: 'relative' }}
    >
      <div
        style={{
          position: 'absolute',
          top: 8,
          right: 16,
          fontSize: 12,
          color: '#111',
          zIndex: 10,
          background: '#fff',
          padding: '4px 8px',
          borderRadius: 6,
          border: '1px solid #ddd',
          lineHeight: 1.5,
        }}
      >
        <div>tree count: {navigationTree.length}</div>
        <div>preload ok: {preloadOk}</div>
        <div>api exists: {String(apiExists)}</div>
        <div>navigation exists: {String(navigationApiExists)}</div>
      </div>

      <NavigationBar
        tree={navigationTree}
        selectedTaskId={selectedTaskId}
        onSelectTask={setSelectedTaskId}
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
      />

      <div
        className="navigation-resize-handle"
        onMouseDown={handleResizeMouseDown}
        role="separator"
        aria-label="Navigation Bar 너비 조절"
      >
        <div className="navigation-resize-grip" />
      </div>

      <main className="detail-screen">
        <TaskHeader taskDetail={selectedTaskDetail} />
        <SubTaskSection
          subTasks={selectedTaskDetail.subTasks}
          onToggleSubTask={handleToggleSubTask}
          onAddSubTask={handleAddSubTask}
          onDeleteSubTask={handleDeleteSubTask}
          onUpdateSubTask={handleUpdateSubTask}
        />
        <MemoSection
          memo={selectedTaskDetail.memo}
          comments={selectedTaskDetail.comments}
          onSaveMemo={handleSaveMemo}
          onAddComment={handleAddComment}
          onEditComment={handleEditComment}
          onDeleteComment={handleDeleteComment}
        />
      </main>
    </div>
  )
}

export default MainLayout
