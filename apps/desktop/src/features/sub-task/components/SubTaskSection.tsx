function SubTaskSection() {
  return (
    <section className="content-card subtask-card">
      <div className="section-header">
        <h2>Sub Task</h2>
      </div>

      <div className="subtask-list">
        <div className="subtask-item">
          <label className="subtask-left">
            <input type="checkbox" />
            <span>일정 협의 with 조선소</span>
          </label>
          <div className="subtask-right">
            <span>2026-08-05</span>
            <span>JH</span>
          </div>
        </div>

        <div className="subtask-item">
          <label className="subtask-left">
            <input type="checkbox" />
            <span>대모 수배</span>
          </label>
          <div className="subtask-right">
            <span>2026-08-07</span>
            <span>JH</span>
          </div>
        </div>

        <div className="subtask-item is-completed">
          <label className="subtask-left">
            <input type="checkbox" checked readOnly />
            <span>윤곽본서 확인</span>
          </label>
          <div className="subtask-right">
            <span>2026-08-09</span>
            <span>JH</span>
          </div>
        </div>
      </div>

      <div className="add-subtask-row">
        <button type="button">+ Sub Task 추가</button>
      </div>
    </section>
  )
}

export default SubTaskSection
