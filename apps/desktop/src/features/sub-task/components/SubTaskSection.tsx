import { useState } from 'react'

type SubTask = {
  id: string
  title: string
  dueDate: string
  assignee: string
  completed: boolean
}

type SubTaskSectionProps = {
  subTasks: SubTask[]
  onToggleSubTask: (subTaskId: string) => void
  onAddSubTask: (title: string) => void
  onDeleteSubTask: (subTaskId: string) => void
}

function SubTaskSection({
  subTasks,
  onToggleSubTask,
  onAddSubTask,
  onDeleteSubTask,
}: SubTaskSectionProps) {
  const [isAdding, setIsAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  const handleSubmit = () => {
    const trimmedTitle = newTitle.trim()

    if (!trimmedTitle) {
      return
    }

    onAddSubTask(trimmedTitle)
    setNewTitle('')
    setIsAdding(false)
  }

  const deleteTarget = subTasks.find((subTask) => subTask.id === deleteTargetId) ?? null

  return (
    <section className="content-card subtask-card">
      <div className="section-header">
        <h2>Sub Task</h2>
      </div>

      <div className="subtask-list">
        {subTasks.map((subTask) => (
          <div
            className={`subtask-item ${subTask.completed ? 'is-completed' : ''}`}
            key={subTask.id}
          >
            <label className="subtask-left">
              <input
                type="checkbox"
                checked={subTask.completed}
                onChange={() => onToggleSubTask(subTask.id)}
              />
              <span>{subTask.title}</span>
            </label>
            <div className="subtask-right">
              <span>{subTask.dueDate}</span>
              <span>{subTask.assignee}</span>
              <button
                className="subtask-delete-button"
                type="button"
                onClick={() => setDeleteTargetId(subTask.id)}
              >
                삭제
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="add-subtask-row">
        {!isAdding ? (
          <button type="button" onClick={() => setIsAdding(true)}>
            + Sub Task 추가
          </button>
        ) : (
          <div className="add-subtask-form">
            <input
              type="text"
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              placeholder="새 Sub Task 제목 입력"
            />
            <div className="add-subtask-actions">
              <button type="button" onClick={handleSubmit}>
                추가
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsAdding(false)
                  setNewTitle('')
                }}
              >
                취소
              </button>
            </div>
          </div>
        )}
      </div>

      {deleteTarget && (
        <div className="modal-backdrop">
          <div className="confirm-modal">
            <div className="confirm-modal-title">Sub Task 삭제 확인</div>
            <div className="confirm-modal-body">
              "{deleteTarget.title}" 항목을 삭제하시겠습니까?
            </div>
            <div className="confirm-modal-actions">
              <button
                type="button"
                onClick={() => {
                  onDeleteSubTask(deleteTarget.id)
                  setDeleteTargetId(null)
                }}
              >
                삭제
              </button>
              <button type="button" onClick={() => setDeleteTargetId(null)}>
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default SubTaskSection
