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
  onUpdateSubTask: (
    subTaskId: string,
    field: 'dueDate' | 'assignee',
    value: string,
  ) => void
}

function SubTaskSection({
  subTasks,
  onToggleSubTask,
  onAddSubTask,
  onDeleteSubTask,
  onUpdateSubTask,
}: SubTaskSectionProps) {
  const [isAdding, setIsAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [editingField, setEditingField] = useState<{
    subTaskId: string
    field: 'dueDate' | 'assignee'
  } | null>(null)
  const [editingValue, setEditingValue] = useState('')

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

  const startEditing = (
    subTaskId: string,
    field: 'dueDate' | 'assignee',
    currentValue: string,
  ) => {
    setEditingField({ subTaskId, field })
    setEditingValue(currentValue)
  }

  const saveEditing = () => {
    if (!editingField) {
      return
    }

    const trimmed = editingValue.trim()

    if (!trimmed) {
      return
    }

    onUpdateSubTask(editingField.subTaskId, editingField.field, trimmed)
    setEditingField(null)
    setEditingValue('')
  }

  const cancelEditing = () => {
    setEditingField(null)
    setEditingValue('')
  }

  return (
    <section className="content-card subtask-card">
      <div className="section-header">
        <h2>Sub Task</h2>
      </div>

      <div className="subtask-list">
        {subTasks.map((subTask) => {
          const isEditingDueDate =
            editingField?.subTaskId === subTask.id && editingField.field === 'dueDate'
          const isEditingAssignee =
            editingField?.subTaskId === subTask.id && editingField.field === 'assignee'

          return (
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
                <div className="subtask-edit-block">
                  {!isEditingDueDate ? (
                    <button
                      className="subtask-chip-button due-date-chip"
                      type="button"
                      onClick={() =>
                        startEditing(subTask.id, 'dueDate', subTask.dueDate)
                      }
                    >
                      <span className="chip-label">기한</span>
                      <span className="chip-value">{subTask.dueDate}</span>
                    </button>
                  ) : (
                    <div className="subtask-pop-editor">
                      <div className="subtask-pop-editor-title">기한 수정</div>
                      <input
                        className="subtask-pop-input"
                        type="date"
                        value={editingValue}
                        onChange={(event) => setEditingValue(event.target.value)}
                      />
                      <div className="subtask-pop-actions">
                        <button type="button" onClick={saveEditing}>
                          저장
                        </button>
                        <button type="button" onClick={cancelEditing}>
                          취소
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="subtask-edit-block">
                  {!isEditingAssignee ? (
                    <button
                      className="subtask-chip-button assignee-chip-button"
                      type="button"
                      onClick={() =>
                        startEditing(subTask.id, 'assignee', subTask.assignee)
                      }
                    >
                      <span className="chip-label">담당자</span>
                      <span className="chip-value">{subTask.assignee}</span>
                    </button>
                  ) : (
                    <div className="subtask-pop-editor">
                      <div className="subtask-pop-editor-title">담당자 수정</div>
                      <input
                        className="subtask-pop-input"
                        type="text"
                        value={editingValue}
                        onChange={(event) => setEditingValue(event.target.value)}
                        placeholder="담당자 입력"
                      />
                      <div className="subtask-pop-actions">
                        <button type="button" onClick={saveEditing}>
                          저장
                        </button>
                        <button type="button" onClick={cancelEditing}>
                          취소
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  className="subtask-delete-button"
                  type="button"
                  onClick={() => setDeleteTargetId(subTask.id)}
                >
                  삭제
                </button>
              </div>
            </div>
          )
        })}
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
