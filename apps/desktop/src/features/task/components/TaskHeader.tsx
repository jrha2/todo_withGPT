function TaskHeader() {
  return (
    <header className="detail-header">
      <div className="detail-header-top">
        <div>
          <p className="detail-path">
            명명식 준비 &gt; 2026 &gt; 일본 &gt; Oshima &gt; 명명식 준비 체크리스트
          </p>
          <h1 className="detail-title">명명식 준비 체크리스트</h1>
          <p className="detail-description">
            명명식 준비를 위한 전체 작업 및 진행상황 관리
          </p>
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
            <span className="meta-value">2026-08-10</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">알람</span>
            <span className="meta-value">2026-08-09 09:00</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">담당자</span>
            <span className="meta-value assignee-chip">JH Jae-Ryong Ha</span>
          </div>
        </div>

        <div className="attachment-summary">
          <div className="attachment-summary-label">첨부파일</div>
          <div className="attachment-summary-actions">
            <button type="button">첨부 추가</button>
          </div>
          <div className="attachment-summary-files">
            <div className="attachment-summary-item">
              <span>naming-ceremony-plan.xlsx</span>
              <button type="button">열기</button>
            </div>
            <div className="attachment-summary-item">
              <span>participants_draft.docx</span>
              <button type="button">열기</button>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}

export default TaskHeader
