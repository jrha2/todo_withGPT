import { useEffect, useMemo, useState } from 'react'

type CommentItem = {
  id: string
  parentId: string | null
  author: string
  createdAt: string
  content: string
}

type MemoSectionProps = {
  memo: string
  comments: CommentItem[]
  onSaveMemo: (nextMemo: string) => void
  onAddComment: (parentId: string | null, content: string) => void
}

type CommentNode = CommentItem & {
  children: CommentNode[]
}

function MemoSection({
  memo,
  comments,
  onSaveMemo,
  onAddComment,
}: MemoSectionProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draftMemo, setDraftMemo] = useState(memo)
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null)
  const [replyDraft, setReplyDraft] = useState('')
  const [isRootReplyOpen, setIsRootReplyOpen] = useState(false)
  const [newCommentDraft, setNewCommentDraft] = useState('')

  useEffect(() => {
    setDraftMemo(memo)
    setIsEditing(false)
    setReplyTargetId(null)
    setReplyDraft('')
    setIsRootReplyOpen(false)
    setNewCommentDraft('')
  }, [memo])

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

  const renderCommentNode = (node: CommentNode, depth = 0) => {
    return (
      <div className="comment-thread" key={node.id}>
        <div
          className="comment-row"
          style={{ marginLeft: `${12 + depth * 28}px` }}
        >
          <div className="comment-arrow">↳</div>

          <div className="comment-item compact">
            <div className="comment-author">
              {node.author} · {node.createdAt}
            </div>
            <div className="comment-body">{node.content}</div>

            <div className="comment-actions">
              <button
                type="button"
                onClick={() => {
                  setReplyTargetId(node.id)
                  setReplyDraft('')
                }}
              >
                답글
              </button>
            </div>
          </div>
        </div>

        {replyTargetId === node.id && (
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

      <div className="comment-actions memo-root-actions">
        {!isRootReplyOpen ? (
          <button type="button" onClick={() => setIsRootReplyOpen(true)}>
            답글
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
    </section>
  )
}

export default MemoSection
