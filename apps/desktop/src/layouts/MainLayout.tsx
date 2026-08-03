import { useEffect, useRef, useState } from 'react'
import MemoSection from '../features/memo/components/MemoSection'
import NavigationBar from '../features/navigation-bar/components/NavigationBar'
import SubTaskSection from '../features/sub-task/components/SubTaskSection'
import TaskHeader from '../features/task/components/TaskHeader'
import { mockTaskDetailsById } from '../data/mockTaskDetail'

type TaskId = 'task-1' | 'task-2'

type TaskDetailsById = typeof mockTaskDetailsById

function MainLayout() {
  const [navigationWidth, setNavigationWidth] = useState(300)
  const [selectedTaskId, setSelectedTaskId] = useState<TaskId>('task-1')
  const [taskDetails, setTaskDetails] = useState<TaskDetailsById>(mockTaskDetailsById)
  const isDraggingRef = useRef(false)

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isDraggingRef.current) {
        return
      }

      const nextWidth = Math.min(Math.max(event.clientX, 240), 520)
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

  const handleResizeMouseDown = () => {
    isDraggingRef.current = true
  }

  const handleToggleSubTask = (subTaskId: string) => {
    setTaskDetails((prev) => {
      const currentTask = prev[selectedTaskId]

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

      return {
        ...prev,
        [selectedTaskId]: {
          ...currentTask,
          subTasks: currentTask.subTasks.filter((subTask) => subTask.id !== subTaskId),
        },
      }
    })
  }

  const handleSaveMemo = (nextMemo: string) => {
    setTaskDetails((prev) => {
      const currentTask = prev[selectedTaskId]

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
            },
          ],
        },
      }
    })
  }

  const selectedTaskDetail = taskDetails[selectedTaskId]

  return (
    <div
      className="app-shell"
      style={{ gridTemplateColumns: `${navigationWidth}px 14px 1fr` }}
    >
      <NavigationBar
        selectedTaskId={selectedTaskId}
        onSelectTask={(taskId) => setSelectedTaskId(taskId as TaskId)}
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
        />
        <MemoSection
          memo={selectedTaskDetail.memo}
          comments={selectedTaskDetail.comments}
          onSaveMemo={handleSaveMemo}
          onAddComment={handleAddComment}
        />
      </main>
    </div>
  )
}

export default MainLayout
