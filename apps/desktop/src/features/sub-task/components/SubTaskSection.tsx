import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { setDraftDirty } from '../../../services/draftRegistry'
import { DateCalendar } from '../../task/components/TaskHeader'

type Assignee = { id: string; name: string; email: string }
type SubTask = { id: string; title: string; dueDate: string; assigneeId: string; assignee: string; assignees: Assignee[]; completed: boolean; createdAt: string; creationOrder: number }
type SubTaskSectionProps = {
  taskId: string
  subTasks: SubTask[]
  taskAssignees: Assignee[]
  onToggleSubTask: (subTaskId: string) => void
  onAddSubTask: (title: string) => Promise<void> | void
  onDeleteSubTask: (subTaskId: string) => Promise<void> | void
  onSortByDueDate: () => void
  onReorderSubTasks: (orderedIds: string[]) => void
  onUpdateSubTask: (subTaskId: string, field: 'title' | 'dueDate' | 'assignee' | 'assignees', value: string | string[]) => Promise<void> | void
  showCompletedSubTasks: boolean
  onShowCompletedSubTasksChange: (showCompleted: boolean) => void
}

function parseDate(value: string) {
  if (!value) return new Date()
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function SubTaskSection({ taskId, subTasks, taskAssignees, onToggleSubTask, onAddSubTask, onDeleteSubTask, onSortByDueDate, onReorderSubTasks, onUpdateSubTask, showCompletedSubTasks, onShowCompletedSubTasksChange }: SubTaskSectionProps) {
  const storageKey = `todo:drafts:subtasks:${taskId}`
  const recoveredDraft = useMemo(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Record<string, unknown> }
    catch { return {} }
  }, [storageKey])
  const [isAdding, setIsAdding] = useState(() => Boolean(recoveredDraft.isAdding))
  const [newTitle, setNewTitle] = useState(() => typeof recoveredDraft.newTitle === 'string' ? recoveredDraft.newTitle : '')
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [editingTitleId, setEditingTitleId] = useState<string | null>(() => typeof recoveredDraft.editingTitleId === 'string' ? recoveredDraft.editingTitleId : null)
  const [editingTitle, setEditingTitle] = useState(() => typeof recoveredDraft.editingTitle === 'string' ? recoveredDraft.editingTitle : '')
  const [dueTargetId, setDueTargetId] = useState<string | null>(null)
  const [dueDateDraft, setDueDateDraft] = useState('')
  const [calendarCursor, setCalendarCursor] = useState(new Date())
  const [assigneeTargetId, setAssigneeTargetId] = useState<string | null>(null)
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [editorError, setEditorError] = useState('')
  const [draggedSubTaskId, setDraggedSubTaskId] = useState<string | null>(null)
  const [dropTargetSubTaskId, setDropTargetSubTaskId] = useState<string | null>(null)
  const hasDraft = Boolean((isAdding && newTitle.trim()) || (editingTitleId && editingTitle.trim()))
  useEffect(() => {
    if (hasDraft) localStorage.setItem(storageKey, JSON.stringify({ isAdding, newTitle, editingTitleId, editingTitle }))
    else localStorage.removeItem(storageKey)
    setDraftDirty(storageKey, hasDraft, () => {
      localStorage.removeItem(storageKey)
      setIsAdding(false)
      setNewTitle('')
      setEditingTitleId(null)
      setEditingTitle('')
    })
    return () => setDraftDirty(storageKey, false)
  }, [storageKey, hasDraft, isAdding, newTitle, editingTitleId, editingTitle])
  useEffect(() => {
    const dirtyKey = `${storageKey}:field-editors`
    const dirty = Boolean(dueTargetId || assigneeTargetId)
    setDraftDirty(dirtyKey, dirty, () => {
      setDueTargetId(null)
      setAssigneeTargetId(null)
      setEditorError('')
    })
    return () => setDraftDirty(dirtyKey, false)
  }, [storageKey, dueTargetId, assigneeTargetId])
  const completedCount = subTasks.filter((item) => item.completed).length
  const incompleteCount = subTasks.length - completedCount
  const visibleSubTasks = showCompletedSubTasks
    ? subTasks
    : subTasks.filter((item) => !item.completed)
  const progress = subTasks.length ? Math.round((completedCount / subTasks.length) * 100) : 0
  const deleteTarget = subTasks.find((item) => item.id === deleteTargetId) ?? null
  const dueTarget = subTasks.find((item) => item.id === dueTargetId) ?? null
  const assigneeTarget = subTasks.find((item) => item.id === assigneeTargetId) ?? null

  const deleteSubTask = async () => {
    if (!deleteTarget) return
    setEditorError('')
    try {
      await onDeleteSubTask(deleteTarget.id)
      setDeleteTargetId(null)
    } catch (error) {
      console.error('Failed to delete Sub Task:', error)
      setEditorError('Sub Task를 삭제하지 못했습니다. 다시 시도해 주세요.')
    }
  }

  const handleSubmit = async () => {
    const title = newTitle.trim()
    if (!title) return
    setEditorError('')
    try {
      await onAddSubTask(title)
      setNewTitle('')
      setIsAdding(false)
    } catch (error) {
      console.error('Failed to create Sub Task:', error)
      setEditorError('Sub Task를 추가하지 못했습니다. 작성 내용은 보존됩니다.')
    }
  }
  const saveTitle = async () => {
    const title = editingTitle.trim()
    if (!editingTitleId || !title) return
    setEditorError('')
    try {
      await onUpdateSubTask(editingTitleId, 'title', title)
      setEditingTitleId(null)
      setEditingTitle('')
    } catch (error) {
      console.error('Failed to update Sub Task title:', error)
      setEditorError('제목을 저장하지 못했습니다. 작성 내용은 보존됩니다.')
    }
  }
  const openDueEditor = (item: SubTask) => {
    setDueTargetId(item.id)
    setDueDateDraft(item.dueDate)
    setCalendarCursor(parseDate(item.dueDate))
    setEditorError('')
  }
  const saveDueDate = async (value = dueDateDraft) => {
    if (!dueTargetId) return
    setIsSaving(true)
    setEditorError('')
    try {
      await onUpdateSubTask(dueTargetId, 'dueDate', value)
      setDueTargetId(null)
    } catch (error) {
      console.error('Failed to update Sub Task due date:', error)
      setEditorError('기한을 저장하지 못했습니다.')
    } finally { setIsSaving(false) }
  }
  const openAssigneeEditor = (item: SubTask) => {
    setAssigneeTargetId(item.id)
    setSelectedAssigneeIds(item.assignees.map((assignee) => assignee.id))
    setEditorError('')
  }
  const saveAssignees = async () => {
    if (!assigneeTargetId) return
    setIsSaving(true)
    setEditorError('')
    try {
      await onUpdateSubTask(assigneeTargetId, 'assignees', selectedAssigneeIds)
      setAssigneeTargetId(null)
    } catch (error) {
      console.error('Failed to update Sub Task assignees:', error)
      setEditorError('담당자를 저장하지 못했습니다.')
    } finally { setIsSaving(false) }
  }
  const handleDragStart = (event: DragEvent<HTMLSpanElement>, id: string) => {
    setDraggedSubTaskId(id)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', id)
  }
  const handleDrop = (event: DragEvent<HTMLDivElement>, targetId: string) => {
    event.preventDefault()
    const sourceId = draggedSubTaskId || event.dataTransfer.getData('text/plain')
    setDraggedSubTaskId(null)
    setDropTargetSubTaskId(null)
    if (!sourceId || sourceId === targetId) return
    const visibleIds = visibleSubTasks.map((item) => item.id)
    const sourceIndex = visibleIds.indexOf(sourceId)
    const targetIndex = visibleIds.indexOf(targetId)
    if (sourceIndex < 0 || targetIndex < 0) return
    visibleIds.splice(sourceIndex, 1)
    visibleIds.splice(targetIndex, 0, sourceId)

    let visibleIndex = 0
    const orderedIds = subTasks.map((item) => {
      if (!showCompletedSubTasks && item.completed) return item.id
      return visibleIds[visibleIndex++]
    })
    onReorderSubTasks(orderedIds)
  }

  return (
    <section className="content-card subtask-card">
      <div className="section-header section-header-row">
        <div><div className="section-eyebrow">CHECKLIST</div><h2>Sub Tasks <span>{completedCount}/{subTasks.length}</span></h2></div>
        <div className="subtask-progress-wrap"><span>{progress}%</span><div className="subtask-progress-track"><div className="subtask-progress-bar" style={{ width: `${progress}%` }} /></div></div>
      </div>
      <div className="subtask-list-toolbar">
        <button className="subtask-due-sort-button" type="button" onClick={onSortByDueDate} disabled={incompleteCount < 2}><span>⇅</span>기한 별 정렬하기</button>
        <button
          className={`completed-visibility-toggle ${showCompletedSubTasks ? 'is-active' : ''}`}
          type="button"
          aria-pressed={showCompletedSubTasks}
          onClick={() => onShowCompletedSubTasksChange(!showCompletedSubTasks)}
        >
          <span aria-hidden="true">{showCompletedSubTasks ? '✓' : '○'}</span>
          완료 Sub Task 표시
        </button>
      </div>
      <div className="subtask-list">
        {visibleSubTasks.map((item) => (
          <div data-search-entity="subtask" data-search-id={item.id} tabIndex={-1} className={`subtask-item ${item.completed ? 'is-completed' : ''}${draggedSubTaskId === item.id ? ' is-dragging' : ''}${dropTargetSubTaskId === item.id ? ' is-drop-target' : ''}`} key={item.id} onDragOver={(event) => { if (!draggedSubTaskId || draggedSubTaskId === item.id) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropTargetSubTaskId(item.id) }} onDragLeave={() => setDropTargetSubTaskId((current) => current === item.id ? null : current)} onDrop={(event) => handleDrop(event, item.id)}>
            <div className="subtask-left">
              <span className="subtask-drag-handle" draggable role="button" tabIndex={0} title="드래그해서 순서 변경" onDragStart={(event) => handleDragStart(event, item.id)} onDragEnd={() => { setDraggedSubTaskId(null); setDropTargetSubTaskId(null) }}>⠿</span>
              <input type="checkbox" checked={item.completed} onChange={() => onToggleSubTask(item.id)} />
              {editingTitleId === item.id ? <input className="subtask-title-input" value={editingTitle} onChange={(event) => setEditingTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void saveTitle(); if (event.key === 'Escape') setEditingTitleId(null) }} autoFocus /> : <button className="subtask-title-button" type="button" onClick={() => { setEditingTitleId(item.id); setEditingTitle(item.title) }}>{item.title}</button>}
            </div>
            <div className="subtask-right">
              <button className="subtask-chip-button due-date-chip" type="button" onClick={() => openDueEditor(item)}><span className="chip-label">기한</span><span className="chip-value">{item.dueDate || '없음'}</span></button>
              <button className="subtask-chip-button assignee-chip-button" type="button" onClick={() => openAssigneeEditor(item)}><span className="chip-label">담당자</span><span className="chip-value">{item.assignee || '미지정'}</span></button>
              <button className="subtask-delete-button" type="button" onClick={() => setDeleteTargetId(item.id)}>삭제</button>
            </div>
          </div>
        ))}
        {subTasks.length === 0 && <div className="subtask-empty-state"><div className="subtask-empty-icon">✓</div><div><strong>아직 Sub Task가 없습니다</strong><span>작업을 작은 단계로 나누면 진행하기 쉬워집니다.</span></div></div>}
        {subTasks.length > 0 && visibleSubTasks.length === 0 && <div className="subtask-empty-state"><div className="subtask-empty-icon">✓</div><div><strong>완료된 Sub Task가 숨겨져 있습니다</strong><span>완료 Sub Task 표시를 켜면 다시 확인할 수 있습니다.</span></div></div>}
      </div>
      <div className="add-subtask-row">{!isAdding ? <button type="button" onClick={() => setIsAdding(true)}><span>+</span> Sub Task 추가</button> : <div className="add-subtask-form"><input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void handleSubmit(); if (event.key === 'Escape') { setIsAdding(false); setNewTitle('') } }} placeholder="새 Sub Task 제목 입력" autoFocus /><div className="add-subtask-actions"><button type="button" onClick={() => void handleSubmit()}>추가</button><button type="button" onClick={() => { setIsAdding(false); setNewTitle('') }}>취소</button></div></div>}</div>
      {editorError && !dueTarget && !assigneeTarget && <div className="task-field-error">{editorError}</div>}

      {dueTarget && <div className="task-field-modal-backdrop"><div className="task-field-modal subtask-field-modal"><div className="task-field-modal-header"><div><span>SUB TASK DUE DATE</span><h3>기한 설정</h3></div><button type="button" onClick={() => setDueTargetId(null)}>×</button></div><DateCalendar cursor={calendarCursor} selectedDate={dueDateDraft} savedDate={dueTarget.dueDate} selectedLabel="새 기한" savedLabel="기존 기한" onMoveMonth={(direction) => setCalendarCursor((current) => new Date(current.getFullYear(), current.getMonth() + direction, 1))} onSelectDate={setDueDateDraft} /><div className="selected-date-preview">선택한 새 기한 <strong>{dueDateDraft || '날짜를 선택하세요'}</strong></div>{editorError && <div className="task-field-error">{editorError}</div>}<div className="task-field-modal-actions"><button className="field-clear-button" type="button" disabled={isSaving} onClick={() => void saveDueDate('')}>기한 없음</button><button type="button" disabled={isSaving || !dueDateDraft} onClick={() => void saveDueDate()}>저장</button><button type="button" disabled={isSaving} onClick={() => setDueTargetId(null)}>취소</button></div></div></div>}

      {assigneeTarget && <div className="task-field-modal-backdrop"><div className="task-field-modal compact-field-modal subtask-field-modal"><div className="task-field-modal-header"><div><span>SUB TASK ASSIGNEE</span><h3>담당자 복수 지정</h3></div><button type="button" onClick={() => setAssigneeTargetId(null)}>×</button></div><div className="assignee-option-list"><button className={`assignee-none-option ${selectedAssigneeIds.length === 0 ? 'is-selected' : ''}`} type="button" onClick={() => setSelectedAssigneeIds([])}><span className="assignee-none-icon">−</span><span><strong>담당자 없음</strong><small>담당자를 지정하지 않고 진행합니다.</small></span></button>{taskAssignees.map((assignee) => <label className={`assignee-option ${selectedAssigneeIds.includes(assignee.id) ? ' is-selected' : ''}`} key={assignee.id}><input type="checkbox" checked={selectedAssigneeIds.includes(assignee.id)} onChange={() => setSelectedAssigneeIds((current) => current.includes(assignee.id) ? current.filter((id) => id !== assignee.id) : [...current, assignee.id])} /><span className="assignee-option-avatar">{assignee.name.charAt(0).toUpperCase()}</span><span><strong>{assignee.name}</strong><small>{assignee.email}</small></span></label>)}</div>{taskAssignees.length === 0 && <div className="subtask-assignee-empty">상위 Task에 지정된 담당자가 없습니다. 담당자 없음으로 저장할 수 있습니다.</div>}{editorError && <div className="task-field-error">{editorError}</div>}<div className="task-field-modal-actions"><button type="button" disabled={isSaving} onClick={() => void saveAssignees()}>저장</button><button type="button" disabled={isSaving} onClick={() => setAssigneeTargetId(null)}>취소</button></div></div></div>}

      {deleteTarget && <div className="modal-backdrop"><div className="confirm-modal"><div className="confirm-modal-title">Sub Task 삭제 확인</div><div className="confirm-modal-body">“{deleteTarget.title}” 항목을 정말 삭제하시겠습니까?</div><div className="confirm-modal-actions"><button type="button" onClick={() => void deleteSubTask()}>삭제</button><button type="button" onClick={() => setDeleteTargetId(null)}>취소</button></div></div></div>}
    </section>
  )
}

export default SubTaskSection
