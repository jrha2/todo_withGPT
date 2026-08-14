import { useMemo, useState } from 'react'

type CommentItem = {
  id: string
  parentId: string | null
  author: string
  createdAt: string
  content: string
  deleted?: boolean
}

type MemoSectionProps = {
  memo: string
  memoAuthor: string
  memoUpdatedAt: string
  comments: CommentItem[]
  onSaveMemo: (nextMemo: string) => void
  onAddComment: (parentId: string | null, content: string) => void
  onEditComment: (commentId: string, nextContent: string) => void
  onDeleteComment: (commentId: string) => void
}

type CommentNode = CommentItem & {
  children: CommentNode[]
}

function MemoSection({
  memo,
  memoAuthor,
  memoUpdatedAt,
  comments,
  onSaveMemo,
  onAddComment,
  onEditComment,
  onDeleteComment,
}: MemoSectionProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draftMemo, setDraftMemo] = useState(memo)
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null)
  const [replyDraft, setReplyDraft] = useState('')
  const [isRootReplyOpen, setIsRootReplyOpen] = useState(false)
  const [newCommentDraft, setNewCommentDraft] = useState('')
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editingCommentDraft, setEditingCommentDraft] = useState('')
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const resizeMemoEditor = (element: HTMLTextAreaElement) => {
    element.style.height = 'auto'
    element.style.height = `${Math.max(120, element.scrollHeight)}px`
  }

  const commentTree = useMemo(() => {
    const nodeMap = new Map<string, CommentNode>()
    const roots: CommentNode[] = []

    comments.forEach((comment) => {
      nodeMap.set(comment.id, {
        ...comment,
        children: [],
      })
    })

    nodeMap.forEach((node) => {
      if (!node.parentId) {
        roots.push(node)
        return
      }

      const parent = nodeMap.get(node.parentId)
      if (parent) {
        parent.children.push(node)
      } else {
        roots.push(node)
      }
    })

    return roots
  }, [comments])

  const deleteTarget = comments.find((comment) => comment.id === deleteTargetId) ?? null

  const handleReplySubmit = (parentId: string) => {
    const trimmed = replyDraft.trim()

    if (!trimmed) {
      return
    }

    onAddComment(parentId, trimmed)
    setReplyTargetId(null)
    setReplyDraft('')
  }

  const handleNewCommentSubmit = () => {
    const trimmed = newCommentDraft.trim()

    if (!trimmed) {
      return
    }

    onAddComment(null, trimmed)
    setNewCommentDraft('')
    setIsRootReplyOpen(false)
  }

  const handleEditSubmit = (commentId: string) => {
    const trimmed = editingCommentDraft.trim()

    if (!trimmed) {
      return
    }

    onEditComment(commentId, trimmed)
    setEditingCommentId(null)
    setEditingCommentDraft('')
  }

  const renderCommentNode = (node: CommentNode, depth = 0) => {
    const isEditingThisComment = editingCommentId === node.id
    const isDeleted = !!node.deleted

    return (
      <div className="comment-thread" key={node.id}>
        <div
          className="comment-row"
          style={{ marginLeft: `${12 + depth * 28}px` }}
        >
          <div className="comment-avatar">{node.author.charAt(0).toUpperCase()}</div>

          <div className="comment-item compact">
            <div className="comment-author">
              <strong>{node.author}</strong><span>{node.createdAt}</span>
            </div>

            {!isEditingThisComment ? (
              <div className={`comment-body ${isDeleted ? 'comment-body-deleted' : ''}`}>
                {isDeleted ? '삭제된 댓글입니다' : node.content}
              </div>
            ) : (
              <textarea
                className="comment-reply-editor"
                value={editingCommentDraft}
                onChange={(event) => setEditingCommentDraft(event.target.value)}
              />
            )}

            <div className="comment-actions">
              {!isDeleted && !isEditingThisComment ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setReplyTargetId(node.id)
                      setReplyDraft('')
                    }}
                  >
                    답글
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCommentId(node.id)
                      setEditingCommentDraft(node.content)
                    }}
                  >
                    수정
                  </button>
                  <button type="button" onClick={() => setDeleteTargetId(node.id)}>
                    삭제
                  </button>
                </>
              ) : null}

              {!isDeleted && isEditingThisComment ? (
                <>
                  <button type="button" onClick={() => handleEditSubmit(node.id)}>
                    저장
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCommentId(null)
                      setEditingCommentDraft('')
                    }}
                  >
                    취소
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {!isDeleted && replyTargetId === node.id && (
          <div
            className="comment-reply-editor-wrap"
            style={{ marginLeft: `${42 + depth * 28}px` }}
          >
            <div className="comment-reply-editor-arrow">↳</div>
            <div className="comment-reply-editor-box">
              <textarea
                className="comment-reply-editor"
                value={replyDraft}
                onChange={(event) => setReplyDraft(event.target.value)}
                placeholder="답글 입력..."
              />
              <div className="comment-reply-editor-actions">
                <button type="button" onClick={() => handleReplySubmit(node.id)}>
                  등록
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setReplyTargetId(null)
                    setReplyDraft('')
                  }}
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        )}

        {node.children.length > 0 && (
          <div className="comment-children">
            {node.children.map((child) => renderCommentNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <section className="content-card communication-card">
      <div className="section-header section-header-row">
        <div>
          <div className="section-eyebrow">NOTES & ACTIVITY</div>
          <h2>메모와 댓글 <span>{comments.length}</span></h2>
        </div>
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
        <div>
          {memo && memoAuthor && (
            <div className="memo-author-line">
              <span className="memo-author-avatar">
                {memoAuthor.charAt(0).toUpperCase()}
              </span>
              <strong>{memoAuthor}</strong>
              {memoUpdatedAt && <span>{memoUpdatedAt}</span>}
            </div>
          )}
          <div className={`memo-box compact ${memo ? '' : 'is-empty'}`}>
            {memo || '이 Task에 필요한 내용이나 아이디어를 기록해 보세요.'}
          </div>
        </div>
      ) : (
        <textarea
          className="memo-editor"
          ref={(element) => {
            if (element) resizeMemoEditor(element)
          }}
          value={draftMemo}
          onChange={(event) => {
            setDraftMemo(event.target.value)
            resizeMemoEditor(event.currentTarget)
          }}
        />
      )}

      <div className="comment-actions memo-root-actions">
        {!isRootReplyOpen ? (
          <button type="button" onClick={() => setIsRootReplyOpen(true)}>
            + 댓글 남기기
          </button>
        ) : null}
      </div>

      {isRootReplyOpen && (
        <div className="comment-reply-editor-wrap comment-root-editor-wrap">
          <div className="comment-reply-editor-arrow">↳</div>
          <div className="comment-reply-editor-box">
            <textarea
              className="comment-reply-editor"
              value={newCommentDraft}
              onChange={(event) => setNewCommentDraft(event.target.value)}
              placeholder="메모에 대한 댓글 입력..."
            />
            <div className="comment-reply-editor-actions">
              <button type="button" onClick={handleNewCommentSubmit}>
                댓글 등록
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsRootReplyOpen(false)
                  setNewCommentDraft('')
                }}
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="inline-comments">
        {commentTree.map((node) => renderCommentNode(node))}
      </div>

      {deleteTarget && (
        <div className="modal-backdrop">
          <div className="confirm-modal">
            <div className="confirm-modal-title">댓글 삭제 확인</div>
            <div className="confirm-modal-body">
              이 댓글을 삭제하시겠습니까?
              <br />
              하위 답글은 유지되고, 본문만 "삭제된 댓글입니다"로 표시됩니다.
            </div>
            <div className="confirm-modal-actions">
              <button
                type="button"
                onClick={() => {
                  onDeleteComment(deleteTarget.id)
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

export default MemoSection
