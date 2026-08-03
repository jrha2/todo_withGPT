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
  attachments: Attachment[]
}

type TaskHeaderProps = {
  taskDetail: TaskDetail
}

function TaskHeader({ taskDetail }: TaskHeaderProps) {
  return (
    <header className="detail-header">
      <div className="detail-header-top">
        <div>
          <p className="detail-path">{taskDetail.path}</p>
          <h1 className="detail-title">{taskDetail.title}</h1>
          <p className="detail-description">{taskDetail.description}</p>
        </div>

        <div className="detail-header-actions">
          <button type="button">정렬</button>
          <button type="button">더보기</button>
        </div>
      </div>

      <div className="detail-meta-row">
        <div className="detail-meta">
          <div className="meta-item">
            <span className="meta-label">기한</span>
            <span className="meta-value">{taskDetail.dueDate}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">알람</span>
            <span className="meta-value">{taskDetail.alarm}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">담당자</span>
            <span className="meta-value assignee-chip">{taskDetail.assignee}</span>
          </div>
        </div>

        <div className="attachment-summary">
          <div className="attachment-summary-label">첨부파일</div>
          <div className="attachment-summary-actions">
            <button type="button">첨부 추가</button>
          </div>
          <div className="attachment-summary-files">
            {taskDetail.attachments.map((attachment) => (
              <div className="attachment-summary-item" key={attachment.id}>
                <span>{attachment.name}</span>
                <button type="button">열기</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </header>
  )
}

export default TaskHeader
