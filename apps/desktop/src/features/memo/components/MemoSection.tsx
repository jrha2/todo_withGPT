import { useEffect, useState } from 'react'

type Reply = {
  id: string
  author: string
  createdAt: string
  content: string
}

type Comment = {
  id: string
  author: string
  createdAt: string
  content: string
  replies?: Reply[]
}

type MemoSectionProps = {
  memo: string
  comments: Comment[]
  onSaveMemo: (nextMemo: string) => void
}

function MemoSection({ memo, comments, onSaveMemo }: MemoSectionProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draftMemo, setDraftMemo] = useState(memo)

  useEffect(() => {
    setDraftMemo(memo)
    setIsEditing(false)
  }, [memo])

  return (
    <section className="content-card communication-card">
      <div className="section-header section-header-row">
        <h2>메모</h2>
        {!isEditing ? (
          <button type="button" onClick={() => setIsEditing(true)}>
            작성/수정
          </button>
        ) : (
          <div className="memo-edit-actions">
            <button
              type="button"
              onClick={() => {
                onSaveMemo(draftMemo)
                setIsEditing(false)
              }}
            >
              저장
            </button>
            <button
              type="button"
              onClick={() => {
                setDraftMemo(memo)
                setIsEditing(false)
              }}
            >
              취소
            </button>
          </div>
        )}
      </div>

      {!isEditing ? (
        <div className="memo-box compact">{memo}</div>
      ) : (
        <textarea
          className="memo-editor"
          value={draftMemo}
          onChange={(event) => setDraftMemo(event.target.value)}
        />
      )}

      <div className="inline-comments">
        {comments.map((comment) => (
          <div className="comment-thread" key={comment.id}>
            <div className="comment-row">
              <div className="comment-arrow">↳</div>

              <div className="comment-item compact">
                <div className="comment-author">
                  {comment.author} · {comment.createdAt}
                </div>
                <div className="comment-body">{comment.content}</div>

                <div className="comment-actions">
                  <button type="button">답글</button>
                </div>
              </div>
            </div>

            {comment.replies && comment.replies.length > 0 && (
              <div className="comment-replies">
                {comment.replies.map((reply) => (
                  <div className="comment-reply-row" key={reply.id}>
                    <div className="comment-reply-arrow">↳</div>

                    <div className="comment-reply-item">
                      <div className="comment-reply-author">
                        {reply.author} · {reply.createdAt}
                      </div>
                      <div className="comment-reply-body">{reply.content}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

export default MemoSection
