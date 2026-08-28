import { useEffect, useMemo, useState } from 'react'
import {
  bulkUpdateTasks,
  type BulkTaskChanges,
  type TaskPriority,
  type TaskSummaryRecord,
  type WorkflowStatus,
} from '../../../services/api/taskApi'
import {
  getWorkspaceTasks,
  type WorkspaceScope,
  type WorkspaceView as WorkspaceViewType,
} from '../../../services/api/workspaceApi'

type WorkspaceViewProps = {
  initialView: WorkspaceViewType
  revision: number
  remoteRefreshRevision: number | null
  onRemoteRefreshComplete: (revision: number, succeeded: boolean) => void
  onOpenTask: (taskId: string) => void
  onViewChange: (view: WorkspaceViewType) => void
  showCompletedTasks: boolean
  onShowCompletedTasksChange: (showCompleted: boolean) => void
}

const views: Array<{ value: WorkspaceViewType; label: string }> = [
  { value: 'today', label: '오늘' },
  { value: 'overdue', label: '기한 초과' },
  { value: 'week', label: '이번 주' },
  { value: 'incomplete', label: '미완료' },
  { value: 'unassigned', label: '미지정' },
  { value: 'favorites', label: '즐겨찾기' },
  { value: 'recent', label: '최근 열어봄' },
]

const priorityLabels: Record<TaskPriority, string> = {
  low: '낮음', normal: '보통', high: '높음', urgent: '긴급',
}
const statusLabels: Record<WorkflowStatus, string> = {
  todo: '할 일', in_progress: '진행 중', blocked: '막힘', done: '완료',
}

function WorkspaceView({
  initialView,
  revision,
  remoteRefreshRevision,
  onRemoteRefreshComplete,
  onOpenTask,
  onViewChange,
  showCompletedTasks,
  onShowCompletedTasksChange,
}: WorkspaceViewProps) {
  const [scope, setScope] = useState<WorkspaceScope>('all')
  const [tasks, setTasks] = useState<TaskSummaryRecord[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [bulkPriority, setBulkPriority] = useState<TaskPriority | ''>('')
  const [bulkStatus, setBulkStatus] = useState<WorkflowStatus | ''>('')
  const [bulkDueDate, setBulkDueDate] = useState('')
  const [bulkTags, setBulkTags] = useState('')

  useEffect(() => {
    let cancelled = false
    // Loading intentionally begins from this synchronization effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true)
    setError('')
    getWorkspaceTasks(initialView, scope)
      .then((items) => {
        if (cancelled) return
        setTasks(items)
        setSelectedIds((current) => current.filter((id) => items.some((item) => item.taskId === id)))
        if (remoteRefreshRevision) onRemoteRefreshComplete(remoteRefreshRevision, true)
      })
      .catch((loadError) => {
        console.error('Failed to load workspace tasks:', loadError)
        if (!cancelled) {
          setError('통합 업무 목록을 불러오지 못했습니다.')
          if (remoteRefreshRevision) onRemoteRefreshComplete(remoteRefreshRevision, false)
        }
      })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [initialView, scope, revision, remoteRefreshRevision, onRemoteRefreshComplete])

  const visibleTasks = useMemo(
    () => showCompletedTasks ? tasks : tasks.filter((task) => !task.completed),
    [tasks, showCompletedTasks],
  )
  const visibleTaskIds = useMemo(
    () => new Set(visibleTasks.map((task) => task.taskId)),
    [visibleTasks],
  )
  const visibleSelectedIds = useMemo(
    () => selectedIds.filter((taskId) => visibleTaskIds.has(taskId)),
    [selectedIds, visibleTaskIds],
  )

  useEffect(() => {
    if (showCompletedTasks) return
    // Remove selections that became hidden through the shared Navigation toggle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedIds((current) => {
      const next = current.filter((taskId) => visibleTaskIds.has(taskId))
      return next.length === current.length ? current : next
    })
  }, [showCompletedTasks, visibleTaskIds])

  const allSelected = visibleTasks.length > 0 && visibleSelectedIds.length === visibleTasks.length
  const selectedCountLabel = useMemo(() => `${visibleSelectedIds.length}개 선택`, [visibleSelectedIds.length])

  const changeView = (nextView: WorkspaceViewType) => {
    setSelectedIds([])
    onViewChange(nextView)
  }

  const applyBulkUpdate = async () => {
    if (visibleSelectedIds.length === 0) return
    const changes: BulkTaskChanges = {}
    if (bulkPriority) changes.priority = bulkPriority
    if (bulkStatus) changes.workflowStatus = bulkStatus
    if (bulkDueDate) changes.dueDate = bulkDueDate
    if (bulkTags.trim()) changes.tags = bulkTags.split(',').map((tag) => tag.trim()).filter(Boolean)
    if (Object.keys(changes).length === 0) {
      setError('일괄 변경할 값을 하나 이상 선택해 주세요.')
      return
    }

    setIsSaving(true)
    setError('')
    try {
      const updated = await bulkUpdateTasks(visibleSelectedIds, changes)
      const updatedMap = new Map(updated.map((task) => [task.taskId, task]))
      setTasks((current) => current.map((task) => updatedMap.get(task.taskId) ?? task))
      setSelectedIds([])
      setBulkPriority('')
      setBulkStatus('')
      setBulkDueDate('')
      setBulkTags('')
    } catch (saveError) {
      console.error('Failed to bulk update tasks:', saveError)
      setError('선택한 업무를 일괄 변경하지 못했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="workspace-view content-card" aria-label="통합 업무 보기">
      <div className="workspace-view-header">
        <div><span className="section-eyebrow">SMART VIEW</span><h1>통합 업무 보기</h1></div>
        <div className="workspace-view-controls">
          <div className="navigation-scope-filter" aria-label="통합 업무 범위">
            <button type="button" className={scope === 'all' ? 'is-active' : ''} onClick={() => setScope('all')}>전체 업무</button>
            <button type="button" className={scope === 'mine' ? 'is-active' : ''} onClick={() => setScope('mine')}>내 Task</button>
          </div>
          <button
            className={`completed-visibility-toggle ${showCompletedTasks ? 'is-active' : ''}`}
            type="button"
            aria-pressed={showCompletedTasks}
            onClick={() => onShowCompletedTasksChange(!showCompletedTasks)}
          >
            <span aria-hidden="true">{showCompletedTasks ? '✓' : '○'}</span>
            완료 Task 표시
          </button>
        </div>
      </div>
      <div className="workspace-view-tabs">
        {views.map((item) => <button key={item.value} type="button" className={initialView === item.value ? 'is-active' : ''} onClick={() => changeView(item.value)}>{item.label}</button>)}
      </div>

      {visibleSelectedIds.length > 0 && (
        <div className="bulk-task-toolbar">
          <strong>{selectedCountLabel}</strong>
          <select aria-label="우선순위 일괄 변경" value={bulkPriority} onChange={(event) => setBulkPriority(event.target.value as TaskPriority | '')}><option value="">우선순위 유지</option>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <select aria-label="상태 일괄 변경" value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value as WorkflowStatus | '')}><option value="">상태 유지</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <input type="date" aria-label="기한 일괄 변경" value={bulkDueDate} onChange={(event) => setBulkDueDate(event.target.value)} />
          <input aria-label="태그 일괄 변경" placeholder="태그, 쉼표 구분" value={bulkTags} onChange={(event) => setBulkTags(event.target.value)} />
          <button type="button" disabled={isSaving} onClick={() => void applyBulkUpdate()}>{isSaving ? '변경 중...' : '일괄 변경'}</button>
          <button type="button" onClick={() => setSelectedIds([])}>선택 해제</button>
        </div>
      )}

      {error && <div className="workspace-error" role="alert">{error}</div>}
      <div className="workspace-task-table">
        <div className="workspace-task-row workspace-task-head">
          <input type="checkbox" aria-label="전체 업무 선택" checked={allSelected} onChange={() => setSelectedIds(allSelected ? [] : visibleTasks.map((task) => task.taskId))} />
          <span>업무</span><span>폴더</span><span>기한</span><span>우선순위</span><span>상태</span>
        </div>
        {visibleTasks.map((task) => (
          <div className={`workspace-task-row ${task.completed ? 'is-completed' : ''}`} key={task.taskId}>
            <input type="checkbox" aria-label={`${task.title} 선택`} checked={selectedIds.includes(task.taskId)} onChange={() => setSelectedIds((current) => current.includes(task.taskId) ? current.filter((id) => id !== task.taskId) : [...current, task.taskId])} />
            <button type="button" className="workspace-task-title" onClick={() => onOpenTask(task.taskId)}>{task.isFavorite && <span title="즐겨찾기">★</span>}{task.title}<small>{task.tags.join(' · ')}</small></button>
            <span>{task.folderTitle || '최상위'}</span><span>{task.dueDate || '미설정'}</span><span className={`priority-${task.priority}`}>{priorityLabels[task.priority]}</span><span>{statusLabels[task.workflowStatus]}</span>
          </div>
        ))}
        {!isLoading && visibleTasks.length === 0 && <div className="workspace-empty">조건에 맞는 업무가 없습니다.</div>}
        {isLoading && <div className="workspace-empty">업무를 불러오고 있습니다...</div>}
      </div>
    </section>
  )
}

export default WorkspaceView
