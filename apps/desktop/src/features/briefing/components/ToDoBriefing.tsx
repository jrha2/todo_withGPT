import { useEffect, useMemo, useState } from 'react'
import {
  getBriefingData,
  type BriefingChange,
  type BriefingData,
  type BriefingDueItem,
} from '../../../services/api/briefingApi'

type ToDoBriefingProps = {
  onOpenTask: (taskId: string) => void
}

const actionLabels: Record<string, string> = {
  created: '새 업무',
  updated: '정보 변경',
  completed: '완료',
  reopened: '다시 진행',
  commented: '댓글',
  attached: '첨부파일',
  deleted: '삭제',
  moved: '위치 변경',
  copied: '복사',
}

function parseServerDate(value: string) {
  if (!value) return null
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatActivityTime(value: string) {
  const date = parseServerDate(value)
  if (!date) return value
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function getDueStatus(dueDate: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(`${dueDate}T00:00:00`)
  const difference = Math.round((due.getTime() - today.getTime()) / 86400000)
  if (difference < 0) return { label: `${Math.abs(difference)}일 지남`, tone: 'overdue' }
  if (difference === 0) return { label: '오늘', tone: 'today' }
  return { label: `${difference}일 후`, tone: 'upcoming' }
}

function ChangeCard({
  change,
  onOpenTask,
}: {
  change: BriefingChange
  onOpenTask: (taskId: string) => void
}) {
  return (
    <article className="briefing-change-card">
      <div className={`briefing-change-icon action-${change.actionType}`} aria-hidden="true">
        {change.actionType === 'completed' ? '✓' : change.actionType === 'commented' ? '＋' : '◇'}
      </div>
      <div className="briefing-card-copy">
        <div className="briefing-card-heading">
          <strong>{change.title}</strong>
          <span>{actionLabels[change.actionType] || '변경'}</span>
        </div>
        <p>{change.summary}</p>
        <small>{change.actorName} · {formatActivityTime(change.createdAt)}</small>
      </div>
      {change.taskId && (
        <button type="button" onClick={() => onOpenTask(change.taskId!)}>
          바로가기 <span>→</span>
        </button>
      )}
    </article>
  )
}

function DueCard({
  item,
  onOpenTask,
}: {
  item: BriefingDueItem
  onOpenTask: (taskId: string) => void
}) {
  const status = getDueStatus(item.dueDate)
  return (
    <article className={`briefing-due-card ${item.completed ? 'is-completed' : ''}`}>
      <div className="briefing-due-topline">
        <span className="briefing-due-type">{item.itemType === 'task' ? 'TASK' : 'SUB TASK'}</span>
        <span className={`briefing-due-status is-${status.tone}`}>{status.label}</span>
      </div>
      <h3>{item.title}</h3>
      <p>{item.projectTitle}</p>
      <dl>
        <div><dt>기한</dt><dd>{item.dueDate}</dd></div>
        <div><dt>담당자</dt><dd>{item.assignee || '미지정'}</dd></div>
      </dl>
      <button type="button" onClick={() => onOpenTask(item.taskId)}>
        업무 바로가기 <span>→</span>
      </button>
    </article>
  )
}

function ToDoBriefing({ onOpenTask }: ToDoBriefingProps) {
  const [data, setData] = useState<BriefingData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setIsLoading(true)
    setError('')
    try {
      setData(await getBriefingData(7))
    } catch (loadError) {
      console.error('Failed to load To Do Briefing:', loadError)
      setError('Briefing 데이터를 불러오지 못했습니다. 서버 연결을 확인해 주세요.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    getBriefingData(7)
      .then((briefing) => {
        if (!cancelled) setData(briefing)
      })
      .catch((loadError) => {
        console.error('Failed to load To Do Briefing:', loadError)
        if (!cancelled) {
          setError('Briefing 데이터를 불러오지 못했습니다. 서버 연결을 확인해 주세요.')
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const summary = useMemo(() => {
    const changes = data?.changes || []
    const dueItems = data?.dueItems || []
    return {
      changes: changes.length,
      completed: changes.filter((item) => item.actionType === 'completed').length,
      comments: changes.filter((item) => item.actionType === 'commented').length,
      attention: dueItems.filter((item) => !item.completed && getDueStatus(item.dueDate).tone !== 'upcoming').length,
    }
  }, [data])

  return (
    <section className="briefing-screen">
      <header className="briefing-hero">
        <div>
          <span>TO DO BRIEFING</span>
          <h1>팀 업무 브리핑</h1>
          <p>최근 7일의 변경사항과 전후 7일 사이에 기한이 있는 업무입니다.</p>
        </div>
        <button type="button" onClick={load} disabled={isLoading}>
          {isLoading ? '새로고침 중…' : '새로고침'}
        </button>
      </header>

      {error && <div className="briefing-error">{error}</div>}

      <div className="briefing-summary-grid">
        <div><strong>{summary.changes}</strong><span>최근 변경</span></div>
        <div><strong>{summary.completed}</strong><span>완료 처리</span></div>
        <div><strong>{summary.comments}</strong><span>댓글 활동</span></div>
        <div className={summary.attention > 0 ? 'has-attention' : ''}>
          <strong>{summary.attention}</strong><span>확인 필요</span>
        </div>
      </div>

      <div className="briefing-section-heading">
        <div><span>DEADLINES</span><h2>최근·향후 일주일 기한 업무</h2></div>
        <small>{data?.dueItems.length || 0}개</small>
      </div>
      <div className="briefing-due-grid">
        {data?.dueItems.map((item) => (
          <DueCard key={`${item.itemType}-${item.id}`} item={item} onOpenTask={onOpenTask} />
        ))}
        {!isLoading && data?.dueItems.length === 0 && (
          <div className="briefing-empty">해당 기간에 기한이 있는 업무가 없습니다.</div>
        )}
      </div>

      <div className="briefing-section-heading activity-heading">
        <div><span>ACTIVITY</span><h2>최근 일주일 변동내역</h2></div>
        <small>{data?.changes.length || 0}건</small>
      </div>
      <div className="briefing-change-list">
        {data?.changes.map((change) => (
          <ChangeCard key={change.id} change={change} onOpenTask={onOpenTask} />
        ))}
        {!isLoading && data?.changes.length === 0 && (
          <div className="briefing-empty">최근 일주일 동안 기록된 변경사항이 없습니다.</div>
        )}
      </div>
    </section>
  )
}

export default ToDoBriefing
