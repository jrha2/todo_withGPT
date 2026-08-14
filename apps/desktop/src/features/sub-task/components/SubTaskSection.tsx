import { useState } from 'react'

type SubTask = {
  id: string
  title: string
  dueDate: string
  assigneeId: string
  assignee: string
  completed: boolean
  createdAt: string
  creationOrder: number
}

type SubTaskSectionProps = {
  subTasks: SubTask[]
  taskAssignees: Array<{ id: string; name: string; email: string }>
  onToggleSubTask: (subTaskId: string) => void
  onAddSubTask: (title: string) => void
  onDeleteSubTask: (subTaskId: string) => void
  onUpdateSubTask: (
    subTaskId: string,
    field: 'title' | 'dueDate' | 'assignee',
    value: string,
  ) => void
}

function SubTaskSection({
  subTasks,
  taskAssignees,
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
    field: 'title' | 'dueDate' | 'assignee'
  } | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const completedCount = subTasks.filter((subTask) => subTask.completed).length
  const progress = subTasks.length === 0
    ? 0
    : Math.round((completedCount / subTasks.length) * 100)

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
    field: 'title' | 'dueDate' | 'assignee',
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

    if (!trimmed && editingField.field !== 'assignee') {
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
      <div className="section-header section-header-row">
        <div>
          <div className="section-eyebrow">CHECKLIST</div>
          <h2>Sub Tasks <span>{completedCount}/{subTasks.length}</span></h2>
        </div>
        <div className="subtask-progress-wrap">
          <span>{progress}%</span>
          <div className="subtask-progress-track">
            <div className="subtask-progress-bar" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      <div className="subtask-list">
        {subTasks.map((subTask) => {
          const isEditingDueDate =
            editingField?.subTaskId === subTask.id && editingField.field === 'dueDate'
          const isEditingAssignee =
            editingField?.subTaskId === subTask.id && editingField.field === 'assignee'
          const isEditingTitle =
            editingField?.subTaskId === subTask.id && editingField.field === 'title'

          return (
            <div
              className={`subtask-item ${subTask.completed ? 'is-completed' : ''}`}
              key={subTask.id}
            >
              <div className="subtask-left">
                <input
                  type="checkbox"
                  checked={subTask.completed}
                  onChange={() => onToggleSubTask(subTask.id)}
                />
                {isEditingTitle ? (
                  <input
                    className="subtask-title-input"
                    type="text"
                    value={editingValue}
                    onChange={(event) => setEditingValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') saveEditing()
                      if (event.key === 'Escape') cancelEditing()
                    }}
                    autoFocus
                  />
                ) : (
                  <button
                    className="subtask-title-button"
                    type="button"
                    title="이름 수정"
                    onClick={() =>
                      startEditing(subTask.id, 'title', subTask.title)
                    }
                  >
                    {subTask.title}
                  </button>
                )}
              </div>

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
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') saveEditing()
                          if (event.key === 'Escape') cancelEditing()
                        }}
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
                        startEditing(
                          subTask.id,
                          'assignee',
                          subTask.assigneeId,
                        )
                      }
                    >
                      <span className="chip-label">담당자</span>
                      <span className="chip-value">{subTask.assignee || '미지정'}</span>
                    </button>
                  ) : (
                    <div className="subtask-pop-editor">
                      <div className="subtask-pop-editor-title">담당자 수정</div>
                      <select
                        className="subtask-pop-input"
                        value={editingValue}
                        onChange={(event) => setEditingValue(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') saveEditing()
                          if (event.key === 'Escape') cancelEditing()
                        }}
                        autoFocus
                      >
                        <option value="">담당자 없음</option>
                        {taskAssignees.map((assignee) => (
                          <option key={assignee.id} value={assignee.id}>
                            {assignee.name}{assignee.email ? ` · ${assignee.email}` : ''}
                          </option>
                        ))}
                      </select>
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
        {subTasks.length === 0 && (
          <div className="subtask-empty-state">
            <div className="subtask-empty-icon">✓</div>
            <div>
              <strong>아직 Sub Task가 없습니다</strong>
              <span>작업을 작은 단계로 나누면 진행하기 쉬워집니다.</span>
            </div>
          </div>
        )}
      </div>

      <div className="add-subtask-row">
        {!isAdding ? (
          <button type="button" onClick={() => setIsAdding(true)}>
            <span>+</span> Sub Task 추가
          </button>
        ) : (
          <div className="add-subtask-form">
            <input
              type="text"
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleSubmit()
                if (event.key === 'Escape') {
                  setIsAdding(false)
                  setNewTitle('')
                }
              }}
              placeholder="새 Sub Task 제목 입력"
              autoFocus
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
