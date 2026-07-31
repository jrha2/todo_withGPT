function MemoSection() {
  return (
    <section className="content-card communication-card">
      <div className="section-header">
        <h2>메모</h2>
      </div>

      <div className="memo-box compact">
        조선소 일정 확인 후 내부 행사 일정과 맞추기. 대모 참석 여부와 이동 일정도 함께
        정리 필요.
      </div>

      <div className="inline-comments">
        <div className="comment-item compact">
          <div className="comment-author">JH · 2026-08-01 09:20</div>
          <div className="comment-body">
            조선소 쪽 회신 받으면 바로 일정 반영하겠습니다.
          </div>
        </div>

        <div className="comment-item compact">
          <div className="comment-author">PS · 2026-08-01 11:05</div>
          <div className="comment-body">
            참석자 명단은 오늘 오후에 업데이트하겠습니다.
          </div>
        </div>
      </div>

      <div className="comment-input-row compact">
        <textarea placeholder="메모에 대한 답글 입력..." />
        <button type="button">등록</button>
      </div>
    </section>
  )
}

export default MemoSection
