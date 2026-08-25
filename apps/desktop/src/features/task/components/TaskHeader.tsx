import { useState } from 'react'
import type { AssigneeUser } from '../../../services/api/userApi'

type Attachment = {
  id: string
  name: string
}

type TaskDetail = {
  path: string
  title: string
  description: string
  dueDate: string
  alarm: string
  assignee: string
  assignees: AssigneeUser[]
  completed: boolean
  attachments: Attachment[]
}

type EditableField = 'dueDate' | 'alarm'
type ActiveEditor = EditableField | 'assignee' | null

type DateCalendarProps = {
  cursor: Date
  selectedDate: string
  savedDate: string
  dueDate?: string
  selectedLabel: string
  savedLabel: string
  onMoveMonth: (direction: number) => void
  onSelectDate: (value: string) => void
}

type TaskHeaderProps = {
  taskDetail: TaskDetail
  assigneeUsers: AssigneeUser[]
  onAddAttachment: () => void
  onOpenAttachment: (attachmentId: string) => void
  onToggleCompleted: () => void
  onUpdateTitle: (title: string) => Promise<void>
  onUpdateField: (field: EditableField, value: string) => Promise<void>
  onUpdateAssignees: (
    assigneeIds: string[],
    manualAssigneeNames: string[],
  ) => Promise<void>
}

const weekdays = ['일', '월', '화', '수', '목', '금', '토']
const clockNumbers = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const minuteClockNumbers = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function formatDateOnly(date: Date) {
  return (
    date.getFullYear() +
    '-' +
    pad(date.getMonth() + 1) +
    '-' +
    pad(date.getDate())
  )
}

function parseDateOnly(value: string) {
  const parts = value.split('-').map(Number)

  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    return null
  }

  return new Date(parts[0], parts[1] - 1, parts[2])
}

function parseAlarm(value: string) {
  if (!value) {
    return new Date()
  }

  const normalized = value.replace(' ', 'T')
  const parsed = new Date(normalized)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

function getCalendarDays(cursor: Date) {
  const firstDate = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const startDate = new Date(firstDate)
  startDate.setDate(1 - firstDate.getDay())

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startDate)
    date.setDate(startDate.getDate() + index)
    return {
      date,
      value: formatDateOnly(date),
      isCurrentMonth: date.getMonth() === cursor.getMonth(),
    }
  })
}

export function DateCalendar({
  cursor,
  selectedDate,
  savedDate,
  dueDate,
  selectedLabel,
  savedLabel,
  onMoveMonth,
  onSelectDate,
}: DateCalendarProps) {
  const today = formatDateOnly(new Date())
  const days = getCalendarDays(cursor)

  return (
    <section className="alarm-calendar-section date-calendar-section">
      <div className="calendar-header">
        <button
          type="button"
          aria-label="이전 달"
          onClick={() => onMoveMonth(-1)}
        >
          ‹
        </button>
        <strong>
          {cursor.getFullYear()}년 {cursor.getMonth() + 1}월
        </strong>
        <button
          type="button"
          aria-label="다음 달"
          onClick={() => onMoveMonth(1)}
        >
          ›
        </button>
      </div>
      <div className="calendar-weekdays">
        {weekdays.map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>
      <div className="calendar-days">
        {days.map((day) => {
          const isSavedDate = day.value === savedDate
          const isNewSelection = day.value === selectedDate && !isSavedDate
          const className =
            'calendar-day' +
            (day.isCurrentMonth ? '' : ' is-outside') +
            (day.value === today ? ' is-today' : '') +
            (dueDate && day.value === dueDate ? ' is-due-date' : '') +
            (isSavedDate ? ' is-saved-date' : '') +
            (isNewSelection ? ' is-selected' : '')

          return (
            <button
              className={className}
              type="button"
              key={day.value}
              aria-label={day.value}
              aria-pressed={day.value === selectedDate}
              onClick={() => onSelectDate(day.value)}
            >
              {day.date.getDate()}
            </button>
          )
        })}
      </div>
      <div className="calendar-legend">
        <span><i className="today-dot" /> 오늘</span>
        {savedDate && <span><i className="saved-dot" /> {savedLabel}</span>}
        {dueDate && dueDate !== savedDate && (
          <span><i className="due-dot" /> Task 기한</span>
        )}
        <span><i className="selected-dot" /> {selectedLabel}</span>
      </div>
    </section>
  )
}

function TaskHeader({
  taskDetail,
  assigneeUsers,
  onAddAttachment,
  onOpenAttachment,
  onToggleCompleted,
  onUpdateTitle,
  onUpdateField,
  onUpdateAssignees,
}: TaskHeaderProps) {
  const [activeEditor, setActiveEditor] = useState<ActiveEditor>(null)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(taskDetail.title)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [dueDateDraft, setDueDateDraft] = useState(taskDetail.dueDate)
  const initialDueDate = parseDateOnly(taskDetail.dueDate) ?? new Date()
  const [dueCalendarCursor, setDueCalendarCursor] = useState(
    new Date(initialDueDate.getFullYear(), initialDueDate.getMonth(), 1),
  )
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>([])
  const [manualAssigneeNames, setManualAssigneeNames] = useState<string[]>([])
  const [manualAssigneeDraft, setManualAssigneeDraft] = useState('')
  const initialAlarm = parseAlarm(taskDetail.alarm)
  const [alarmDate, setAlarmDate] = useState(formatDateOnly(initialAlarm))
  const [alarmHour, setAlarmHour] = useState(initialAlarm.getHours())
  const [alarmMinute, setAlarmMinute] = useState(initialAlarm.getMinutes())
  const [calendarCursor, setCalendarCursor] = useState(
    new Date(initialAlarm.getFullYear(), initialAlarm.getMonth(), 1),
  )
  const [relativeDays, setRelativeDays] = useState(2)
  const [relativeHour, setRelativeHour] = useState(9)
  const assigneeInitial =
    taskDetail.assignees[0]?.name.trim().charAt(0).toUpperCase() || 'U'
  const selectedClockHour = alarmHour % 12 || 12

  const saveTitle = async () => {
    const nextTitle = titleDraft.trim()
    if (!nextTitle || nextTitle === taskDetail.title) {
      setTitleDraft(taskDetail.title)
      setIsEditingTitle(false)
      return
    }

    setIsSaving(true)
    setErrorMessage('')
    try {
      await onUpdateTitle(nextTitle)
      setIsEditingTitle(false)
    } catch (error) {
      console.error('Failed to update Task title:', error)
      setErrorMessage('Task 이름을 저장하지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setIsSaving(false)
    }
  }
  const closeEditor = () => {
    if (isSaving) {
      return
    }

    setActiveEditor(null)
    setErrorMessage('')
  }

  const openDueDateEditor = () => {
    const parsed = parseDateOnly(taskDetail.dueDate) ?? new Date()
    setDueDateDraft(taskDetail.dueDate)
    setDueCalendarCursor(new Date(parsed.getFullYear(), parsed.getMonth(), 1))
    setErrorMessage('')
    setActiveEditor('dueDate')
  }

  const openAssigneeEditor = () => {
    const selectableIds = new Set(assigneeUsers.map((user) => user.id))
    setSelectedAssigneeIds(
      taskDetail.assignees
        .filter((assignee) => selectableIds.has(assignee.id))
        .map((assignee) => assignee.id),
    )
    setManualAssigneeNames(
      taskDetail.assignees
        .filter((assignee) => !selectableIds.has(assignee.id))
        .map((assignee) => assignee.name),
    )
    setManualAssigneeDraft('')
    setErrorMessage('')
    setActiveEditor('assignee')
  }

  const openAlarmEditor = () => {
    const parsed = parseAlarm(taskDetail.alarm)
    const dueDate = parseDateOnly(taskDetail.dueDate)
    const parsedDate = new Date(
      parsed.getFullYear(),
      parsed.getMonth(),
      parsed.getDate(),
    )

    setAlarmDate(formatDateOnly(parsed))
    setAlarmHour(parsed.getHours())
    setAlarmMinute(parsed.getMinutes())
    setCalendarCursor(new Date(parsed.getFullYear(), parsed.getMonth(), 1))
    setRelativeHour(parsed.getHours())

    if (dueDate) {
      const difference = Math.round(
        (dueDate.getTime() - parsedDate.getTime()) / 86400000,
      )
      setRelativeDays(Math.max(0, difference))
    } else {
      setRelativeDays(2)
    }

    setErrorMessage('')
    setActiveEditor('alarm')
  }

  const saveField = async (field: EditableField, value: string) => {
    setIsSaving(true)
    setErrorMessage('')

    try {
      await onUpdateField(field, value)
      setActiveEditor(null)
    } catch (error) {
      console.error('Failed to update Task field:', error)
      setErrorMessage('저장하지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setIsSaving(false)
    }
  }

  const saveDueDate = () => {
    if (!dueDateDraft) {
      setErrorMessage('기한 날짜를 선택해 주세요.')
      return
    }

    saveField('dueDate', dueDateDraft)
  }

  const clearDueDate = () => saveField('dueDate', '')

  const saveAssignees = async () => {
    setIsSaving(true)
    setErrorMessage('')
    try {
      await onUpdateAssignees(selectedAssigneeIds, manualAssigneeNames)
      setActiveEditor(null)
    } catch (error) {
      console.error('Failed to update Task assignees:', error)
      setErrorMessage('저장하지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setIsSaving(false)
    }
  }

  const toggleAssignee = (userId: string) => {
    setSelectedAssigneeIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    )
  }

  const addManualAssignee = () => {
    const name = manualAssigneeDraft.trim()
    if (!name) {
      return
    }

    const listedUser = assigneeUsers.find(
      (user) => user.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    )
    if (listedUser) {
      setSelectedAssigneeIds((current) =>
        current.includes(listedUser.id) ? current : [...current, listedUser.id],
      )
    } else {
      setManualAssigneeNames((current) =>
        current.some((item) => item.toLocaleLowerCase() === name.toLocaleLowerCase())
          ? current
          : [...current, name],
      )
    }
    setManualAssigneeDraft('')
  }

  const saveAlarm = () => {
    if (!alarmDate) {
      setErrorMessage('알림 날짜를 선택해 주세요.')
      return
    }

    saveField(
      'alarm',
      alarmDate + 'T' + pad(alarmHour) + ':' + pad(alarmMinute),
    )
  }

  const clearAlarm = () => saveField('alarm', '')

  const selectClockHour = (hour: number) => {
    const isPm = alarmHour >= 12
    const nextHour = hour === 12 ? (isPm ? 12 : 0) : hour + (isPm ? 12 : 0)
    setAlarmHour(nextHour)
  }

  const setMeridiem = (isPm: boolean) => {
    const hour12 = alarmHour % 12
    setAlarmHour(hour12 + (isPm ? 12 : 0))
  }

  const applyRelativeAlarm = () => {
    const dueDate = parseDateOnly(taskDetail.dueDate)

    if (!dueDate) {
      setErrorMessage('먼저 Task 기한을 지정해 주세요.')
      return
    }

    const calculated = new Date(dueDate)
    calculated.setDate(calculated.getDate() - Math.max(0, relativeDays))
    calculated.setHours(relativeHour, 0, 0, 0)
    setAlarmDate(formatDateOnly(calculated))
    setAlarmHour(relativeHour)
    setAlarmMinute(0)
    setCalendarCursor(
      new Date(calculated.getFullYear(), calculated.getMonth(), 1),
    )
    setErrorMessage('')
  }

  const moveCalendarMonth = (direction: number) => {
    setCalendarCursor(
      (current) =>
        new Date(current.getFullYear(), current.getMonth() + direction, 1),
    )
  }

  const moveDueCalendarMonth = (direction: number) => {
    setDueCalendarCursor(
      (current) =>
        new Date(current.getFullYear(), current.getMonth() + direction, 1),
    )
  }

  const selectDueCalendarDate = (value: string) => {
    const selected = parseDateOnly(value)
    setDueDateDraft(value)

    if (selected) {
      setDueCalendarCursor(
        new Date(selected.getFullYear(), selected.getMonth(), 1),
      )
    }
  }

  const selectCalendarDate = (value: string) => {
    const selected = parseDateOnly(value)
    setAlarmDate(value)

    if (selected) {
      setCalendarCursor(
        new Date(selected.getFullYear(), selected.getMonth(), 1),
      )
    }
  }

  return (
    <header className={`detail-header ${taskDetail.completed ? 'is-completed' : ''}`}>
      <div className="detail-toolbar">
        <p className="detail-path">{taskDetail.path.replace(' > ', '  /  ')}</p>
      </div>

      <div className="detail-header-top">
        <button
          className={
            'task-complete-button' + (taskDetail.completed ? ' is-completed' : '')
          }
          type="button"
          aria-label={taskDetail.completed ? 'Task 완료 취소' : 'Task 완료 처리'}
          aria-pressed={taskDetail.completed}
          onClick={onToggleCompleted}
        >
          <span>✓</span>
        </button>

        <div className="detail-heading-copy">
          <div className="task-status-row">
            <span
              className={
                'task-status-badge' + (taskDetail.completed ? ' is-completed' : '')
              }
            >
              {taskDetail.completed ? '완료' : '진행 중'}
            </span>
            <span className="task-id-badge">TASK</span>
          </div>
          {isEditingTitle ? (
            <input
              className="task-title-editor detail-title-editor"
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
                if (event.key === 'Escape') {
                  setTitleDraft(taskDetail.title)
                  setIsEditingTitle(false)
                }
              }}
              onBlur={saveTitle}
              disabled={isSaving}
              autoFocus
            />
          ) : (
            <button
              className="detail-title detail-title-button"
              type="button"
              title="Task 이름 수정"
              onClick={() => setIsEditingTitle(true)}
            >
              {taskDetail.title}
            </button>
          )}
          <p className="detail-description">
            {taskDetail.description || '설명이 없습니다.'}
          </p>
        </div>
      </div>

      <div className="detail-meta-row">
        <div className="detail-meta">
          <div className="meta-item">
            <button
              className="meta-icon meta-edit-trigger calendar-icon"
              type="button"
              aria-label="기한 수정"
              onClick={openDueDateEditor}
            >
              ◷
            </button>
            <span className="meta-label">기한</span>
            <span className="meta-value">{taskDetail.dueDate || '미설정'}</span>
          </div>

          <div className="meta-item">
            <button
              className="meta-icon meta-edit-trigger"
              type="button"
              aria-label="알림 수정"
              onClick={openAlarmEditor}
            >
              ◇
            </button>
            <span className="meta-label">알림</span>
            <span className="meta-value">{taskDetail.alarm || '미설정'}</span>
          </div>

          <div className="meta-item">
            <button
              className="assignee-avatar meta-edit-trigger"
              type="button"
              aria-label="담당자 수정"
              onClick={openAssigneeEditor}
            >
              {assigneeInitial}
              {taskDetail.assignees.length > 1 && (
                <span className="assignee-count-badge">
                  +{taskDetail.assignees.length - 1}
                </span>
              )}
            </button>
            <span className="meta-label">담당자</span>
            <span className="meta-value assignee-chip">
              {taskDetail.assignee || '미지정'}
            </span>
          </div>
        </div>

        <div className="attachment-summary">
          <div className="attachment-summary-header">
            <div className="attachment-summary-label">
              첨부파일 <span>{taskDetail.attachments.length}</span>
            </div>
            <div className="attachment-summary-actions">
              <button type="button" onClick={onAddAttachment}>+ 파일 추가</button>
            </div>
          </div>
          <div className="attachment-summary-files">
            {taskDetail.attachments.map((attachment) => (
              <div className="attachment-summary-item" key={attachment.id}>
                <span>{attachment.name}</span>
                <button
                  type="button"
                  onClick={() => onOpenAttachment(attachment.id)}
                >
                  열기
                </button>
              </div>
            ))}
            {taskDetail.attachments.length === 0 && (
              <div className="attachment-empty">첨부된 파일이 없습니다</div>
            )}
          </div>
        </div>
      </div>

      {activeEditor === 'dueDate' && (
        <div className="task-field-modal-backdrop">
          <div className="task-field-modal date-field-modal">
            <div className="task-field-modal-header">
              <div>
                <span>DATE</span>
                <h3>기한 수정</h3>
              </div>
              <button type="button" onClick={closeEditor}>×</button>
            </div>
            <DateCalendar
              cursor={dueCalendarCursor}
              selectedDate={dueDateDraft}
              savedDate={taskDetail.dueDate}
              selectedLabel="새 기한"
              savedLabel="기존 기한"
              onMoveMonth={moveDueCalendarMonth}
              onSelectDate={selectDueCalendarDate}
            />
            <div className="selected-date-preview">
              선택한 새 기한 <strong>{dueDateDraft || '날짜를 선택하세요'}</strong>
            </div>
            {errorMessage && <div className="task-field-error">{errorMessage}</div>}
            <div className="task-field-modal-actions">
              <button
                className="field-clear-button"
                type="button"
                onClick={clearDueDate}
                disabled={isSaving}
              >
                기한 없음
              </button>
              <button type="button" onClick={saveDueDate} disabled={isSaving}>
                {isSaving ? '저장 중...' : '저장'}
              </button>
              <button type="button" onClick={closeEditor} disabled={isSaving}>
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {activeEditor === 'assignee' && (
        <div className="task-field-modal-backdrop">
          <div className="task-field-modal compact-field-modal">
            <div className="task-field-modal-header">
              <div>
                <span>ASSIGNEE</span>
                <h3>담당자 복수 지정</h3>
              </div>
              <button type="button" onClick={closeEditor}>×</button>
            </div>

            <div className="assignee-option-list">
              <button
                className={
                  'assignee-none-option' +
                  (selectedAssigneeIds.length === 0 &&
                  manualAssigneeNames.length === 0
                    ? ' is-selected'
                    : '')
                }
                type="button"
                onClick={() => {
                  setSelectedAssigneeIds([])
                  setManualAssigneeNames([])
                }}
              >
                <span className="assignee-none-icon">−</span>
                <span>
                  <strong>담당자 없음</strong>
                  <small>담당자를 지정하지 않고 Task를 진행합니다.</small>
                </span>
              </button>
              {assigneeUsers.map((user) => (
                <label
                  className={
                    'assignee-option' +
                    (selectedAssigneeIds.includes(user.id)
                      ? ' is-selected'
                      : '')
                  }
                  key={user.id}
                >
                  <input
                    type="checkbox"
                    name="assignee"
                    checked={selectedAssigneeIds.includes(user.id)}
                    onChange={() => toggleAssignee(user.id)}
                  />
                  <span className="assignee-option-avatar">
                    {user.name.charAt(0).toUpperCase()}
                  </span>
                  <span>
                    <strong>{user.name}</strong>
                    <small>{user.email}</small>
                  </span>
                </label>
              ))}

            </div>

            <p className="assignee-notification-hint">
              선택된 로그인 계정마다 이 Task의 PC 알림이 개별적으로 표시됩니다.
            </p>

            <div className="manual-assignee-section">
              <strong>목록에 없는 담당자</strong>
              <div className="manual-assignee-input-row">
                <input
                  type="text"
                  value={manualAssigneeDraft}
                  onChange={(event) => setManualAssigneeDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      addManualAssignee()
                    }
                  }}
                  placeholder="담당자 이름 입력"
                />
                <button type="button" onClick={addManualAssignee}>추가</button>
              </div>
              {manualAssigneeNames.length > 0 && (
                <div className="manual-assignee-chips">
                  {manualAssigneeNames.map((name) => (
                    <span key={name}>
                      {name}
                      <button
                        type="button"
                        aria-label={`${name} 담당자 제거`}
                        onClick={() =>
                          setManualAssigneeNames((current) =>
                            current.filter((item) => item !== name),
                          )
                        }
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {errorMessage && <div className="task-field-error">{errorMessage}</div>}
            <div className="task-field-modal-actions">
              <button type="button" onClick={saveAssignees} disabled={isSaving}>
                {isSaving ? '저장 중...' : '저장'}
              </button>
              <button type="button" onClick={closeEditor} disabled={isSaving}>
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {activeEditor === 'alarm' && (
        <div className="task-field-modal-backdrop">
          <div className="task-field-modal alarm-field-modal">
            <div className="task-field-modal-header">
              <div>
                <span>REMINDER</span>
                <h3>알림 날짜와 시간</h3>
              </div>
              <button type="button" onClick={closeEditor}>×</button>
            </div>

            <div className="alarm-editor-grid">
              <DateCalendar
                cursor={calendarCursor}
                selectedDate={alarmDate}
                savedDate=""
                dueDate={taskDetail.dueDate}
                selectedLabel="알림 날짜"
                savedLabel=""
                onMoveMonth={moveCalendarMonth}
                onSelectDate={selectCalendarDate}
              />

              <section className="alarm-clock-section">
                <div className="clock-summary">
                  {pad(alarmHour)}:{pad(alarmMinute)}
                </div>
                <div className="clock-picker-label">시간 선택</div>
                <div className="clock-face">
                  <div className="clock-center" />
                  {clockNumbers.map((hour, index) => {
                    const angle = (index / 12) * Math.PI * 2 - Math.PI / 2
                    const style = {
                      left: 50 + Math.cos(angle) * 39 + '%',
                      top: 50 + Math.sin(angle) * 39 + '%',
                    }

                    return (
                      <button
                        className={
                          'clock-number' +
                          (selectedClockHour === hour ? ' is-selected' : '')
                        }
                        type="button"
                        style={style}
                        key={hour}
                        onClick={() => selectClockHour(hour)}
                      >
                        {hour}
                      </button>
                    )
                  })}
                </div>
                <div className="clock-controls">
                  <div className="meridiem-control">
                    <button
                      className={alarmHour < 12 ? 'is-selected' : ''}
                      type="button"
                      onClick={() => setMeridiem(false)}
                    >
                      오전
                    </button>
                    <button
                      className={alarmHour >= 12 ? 'is-selected' : ''}
                      type="button"
                      onClick={() => setMeridiem(true)}
                    >
                      오후
                    </button>
                  </div>
                </div>

                <div className="clock-picker-divider" />
                <div className="clock-picker-label">분 선택</div>
                <div className="clock-face minute-clock-face">
                  <div className="clock-center" />
                  {minuteClockNumbers.map((minute, index) => {
                    const angle = (index / 12) * Math.PI * 2 - Math.PI / 2
                    const style = {
                      left: 50 + Math.cos(angle) * 39 + '%',
                      top: 50 + Math.sin(angle) * 39 + '%',
                    }

                    return (
                      <button
                        className={
                          'clock-number minute-clock-number' +
                          (alarmMinute === minute ? ' is-selected' : '')
                        }
                        type="button"
                        style={style}
                        key={minute}
                        onClick={() => setAlarmMinute(minute)}
                      >
                        {pad(minute)}
                      </button>
                    )
                  })}
                </div>
              </section>
            </div>

            <section className="relative-alarm-section">
              <div>
                <strong>기한 기준으로 설정</strong>
                <span>기한 날짜는 달력에서 금색 테두리로 표시됩니다.</span>
              </div>
              <div className="relative-alarm-controls">
                <span>기한으로부터</span>
                <input
                  type="number"
                  min="0"
                  max="365"
                  value={relativeDays}
                  onChange={(event) =>
                    setRelativeDays(Math.max(0, Number(event.target.value)))
                  }
                />
                <span>일 전</span>
                <select
                  value={relativeHour}
                  onChange={(event) => setRelativeHour(Number(event.target.value))}
                >
                  {Array.from({ length: 24 }, (_, hour) => (
                    <option value={hour} key={hour}>{pad(hour)}시</option>
                  ))}
                </select>
                <button type="button" onClick={applyRelativeAlarm}>적용</button>
              </div>
            </section>

            {errorMessage && <div className="task-field-error">{errorMessage}</div>}
            <div className="task-field-modal-actions">
              <div className="selected-alarm-preview">
                선택: {alarmDate} {pad(alarmHour)}:{pad(alarmMinute)}
              </div>
              <button
                className="field-clear-button"
                type="button"
                onClick={clearAlarm}
                disabled={isSaving}
              >
                알림 없음
              </button>
              <button type="button" onClick={saveAlarm} disabled={isSaving}>
                {isSaving ? '저장 중...' : '저장'}
              </button>
              <button type="button" onClick={closeEditor} disabled={isSaving}>
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}

export default TaskHeader
