import { useEffect, useMemo, useRef, useState } from 'react'
import type { RichMemoRecord } from '../../../services/api/memoApi'
import { setDraftDirty } from '../../../services/draftRegistry'
import MemoEditor from './MemoEditor'

type CommentItem = {
  id: string
  parentId: string | null
  author: string
  createdAt: string
  content: string
  deleted?: boolean
}

type MemoSectionProps = {
  taskId: string
  memos: RichMemoRecord[]
  comments: CommentItem[]
  onCreateMemo: (contentHtml: string) => Promise<void>
  onUpdateMemo: (memoId: string, contentHtml: string) => Promise<void>
  onDeleteMemo: (memoId: string) => Promise<void>
  onAddComment: (parentId: string | null, content: string) => Promise<void>
  onEditComment: (commentId: string, nextContent: string) => Promise<void>
  onDeleteComment: (commentId: string) => Promise<void>
}

type CommentNode = CommentItem & { children: CommentNode[] }

const memoColors = [
  { value: '#17343a', label: '기본' },
  { value: '#25899b', label: '청록' },
  { value: '#2563eb', label: '파랑' },
  { value: '#b45309', label: '주황' },
  { value: '#c2415b', label: '빨강' },
]

function sanitizeMemoHtml(input: string) {
  const documentValue = new DOMParser().parseFromString(input, 'text/html')
  documentValue.querySelectorAll('script, style, iframe, object, embed').forEach(
    (element) => element.remove(),
  )
  const allowedTags = new Set(['BR', 'P', 'DIV', 'STRONG', 'B', 'SPAN'])

  Array.from(documentValue.body.querySelectorAll('*')).reverse().forEach((element) => {
    if (!allowedTags.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes))
      return
    }

    const color = element instanceof HTMLElement ? element.style.color : ''
    Array.from(element.attributes).forEach((attribute) => {
      element.removeAttribute(attribute.name)
    })
    if (
      element.tagName === 'SPAN' &&
      /^(#[0-9a-f]{3,8}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\))$/i.test(color)
    ) {
      element.setAttribute('style', `color: ${color}`)
    }
  })

  return documentValue.body.innerHTML.trim()
}

function hasMemoContent(contentHtml: string) {
  const documentValue = new DOMParser().parseFromString(contentHtml, 'text/html')
  return Boolean(documentValue.body.textContent?.trim())
}

function MemoSection({
  taskId,
  memos,
  comments,
  onCreateMemo,
  onUpdateMemo,
  onDeleteMemo,
  onAddComment,
  onEditComment,
  onDeleteComment,
}: MemoSectionProps) {
  const storageKey = `todo:drafts:memo-comments:${taskId}`
  const recoveredDraft = useMemo(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Record<string, unknown> }
    catch { return {} }
  }, [storageKey])
  const [editingMemoId, setEditingMemoId] = useState<string | null>(() => typeof recoveredDraft.editingMemoId === 'string' ? recoveredDraft.editingMemoId : null)
  const [editorInitialHtml, setEditorInitialHtml] = useState(() => typeof recoveredDraft.editorHtml === 'string' ? recoveredDraft.editorHtml : '')
  const [memoDeleteTargetId, setMemoDeleteTargetId] = useState<string | null>(null)
  const [isSavingMemo, setIsSavingMemo] = useState(false)
  const [memoError, setMemoError] = useState('')
  const memoEditorRef = useRef<HTMLDivElement | null>(null)
  const [replyTargetId, setReplyTargetId] = useState<string | null>(() => typeof recoveredDraft.replyTargetId === 'string' ? recoveredDraft.replyTargetId : null)
  const [replyDraft, setReplyDraft] = useState(() => typeof recoveredDraft.replyDraft === 'string' ? recoveredDraft.replyDraft : '')
  const [isRootReplyOpen, setIsRootReplyOpen] = useState(() => Boolean(recoveredDraft.isRootReplyOpen))
  const [newCommentDraft, setNewCommentDraft] = useState(() => typeof recoveredDraft.newCommentDraft === 'string' ? recoveredDraft.newCommentDraft : '')
  const [editingCommentId, setEditingCommentId] = useState<string | null>(() => typeof recoveredDraft.editingCommentId === 'string' ? recoveredDraft.editingCommentId : null)
  const [editingCommentDraft, setEditingCommentDraft] = useState(() => typeof recoveredDraft.editingCommentDraft === 'string' ? recoveredDraft.editingCommentDraft : '')
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  const savedEditingMemoHtml = editingMemoId && editingMemoId !== '__new__'
    ? memos.find((memo) => memo.id === editingMemoId)?.contentHtml ?? ''
    : ''
  const memoHasDraft = editingMemoId === '__new__'
    ? hasMemoContent(editorInitialHtml)
    : Boolean(
        editingMemoId
        && sanitizeMemoHtml(editorInitialHtml) !== sanitizeMemoHtml(savedEditingMemoHtml),
      )
  const hasDraft = Boolean(memoHasDraft || replyDraft.trim() || newCommentDraft.trim() || editingCommentDraft.trim())
  useEffect(() => {
    if (hasDraft) {
      localStorage.setItem(storageKey, JSON.stringify({ editingMemoId, editorHtml: editorInitialHtml, replyTargetId, replyDraft, isRootReplyOpen, newCommentDraft, editingCommentId, editingCommentDraft }))
    } else localStorage.removeItem(storageKey)

    setDraftDirty(storageKey, hasDraft, () => {
      localStorage.removeItem(storageKey)
      setEditingMemoId(null)
      setEditorInitialHtml('')
      setReplyTargetId(null)
      setReplyDraft('')
      setIsRootReplyOpen(false)
      setNewCommentDraft('')
      setEditingCommentId(null)
      setEditingCommentDraft('')
    })
    return () => setDraftDirty(storageKey, false)
  }, [storageKey, hasDraft, editingMemoId, editorInitialHtml, replyTargetId, replyDraft, isRootReplyOpen, newCommentDraft, editingCommentId, editingCommentDraft])

  const commentTree = useMemo(() => {
    const nodeMap = new Map<string, CommentNode>()
    const roots: CommentNode[] = []
    comments.forEach((comment) => nodeMap.set(comment.id, { ...comment, children: [] }))
    nodeMap.forEach((node) => {
      if (!node.parentId) roots.push(node)
      else nodeMap.get(node.parentId)?.children.push(node)
    })
    return roots
  }, [comments])

  const deleteTarget = comments.find((comment) => comment.id === deleteTargetId) ?? null
  const memoDeleteTarget = memos.find((memo) => memo.id === memoDeleteTargetId) ?? null

  const openMemoEditor = (memo?: RichMemoRecord) => {
    setEditingMemoId(memo?.id ?? '__new__')
    setEditorInitialHtml(memo?.contentHtml ?? '')
    setMemoError('')
  }

  const closeMemoEditor = () => {
    setEditingMemoId(null)
    setEditorInitialHtml('')
    setMemoError('')
  }

  const applyMemoFormat = (command: 'bold' | 'foreColor', value?: string) => {
    memoEditorRef.current?.focus()
    document.execCommand(command, false, value)
  }

  const saveMemoEditor = async () => {
    if (!editingMemoId || !memoEditorRef.current) return
    const sanitized = sanitizeMemoHtml(memoEditorRef.current.innerHTML)
    if (!hasMemoContent(sanitized)) {
      setMemoError('메모 내용을 입력해 주세요.')
      return
    }

    setIsSavingMemo(true)
    setMemoError('')
    try {
      if (editingMemoId === '__new__') await onCreateMemo(sanitized)
      else await onUpdateMemo(editingMemoId, sanitized)
      closeMemoEditor()
    } catch (error) {
      console.error('Failed to save Memo:', error)
      setMemoError('메모를 저장하지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setIsSavingMemo(false)
    }
  }

  const handleReplySubmit = async (parentId: string) => {
    const trimmed = replyDraft.trim()
    if (!trimmed) return
    try {
      await onAddComment(parentId, trimmed)
      setReplyTargetId(null)
      setReplyDraft('')
    } catch (error) {
      console.error('Failed to save reply:', error)
      setMemoError('답글을 저장하지 못했습니다. 작성 내용은 보존됩니다.')
    }
  }

  const handleNewCommentSubmit = async () => {
    const trimmed = newCommentDraft.trim()
    if (!trimmed) return
    try {
      await onAddComment(null, trimmed)
      setNewCommentDraft('')
      setIsRootReplyOpen(false)
    } catch (error) {
      console.error('Failed to save comment:', error)
      setMemoError('댓글을 저장하지 못했습니다. 작성 내용은 보존됩니다.')
    }
  }

  const handleEditSubmit = async (commentId: string) => {
    const trimmed = editingCommentDraft.trim()
    if (!trimmed) return
    try {
      await onEditComment(commentId, trimmed)
      setEditingCommentId(null)
      setEditingCommentDraft('')
    } catch (error) {
      console.error('Failed to update comment:', error)
      setMemoError('댓글을 수정하지 못했습니다. 작성 내용은 보존됩니다.')
    }
  }

  const handleDeleteComment = async () => {
    if (!deleteTarget) return
    try {
      await onDeleteComment(deleteTarget.id)
      setDeleteTargetId(null)
    } catch (error) {
      console.error('Failed to delete comment:', error)
      setMemoError('댓글을 삭제하지 못했습니다. 다시 시도해 주세요.')
    }
  }

  const renderMemoEditor = () => (
    <MemoEditor
      // Remount when the edit target changes so the initial HTML is seeded for
      // the correct memo and the caret is positioned at its end.
      key={editingMemoId ?? '__new__'}
      editorRef={memoEditorRef}
      initialHtml={sanitizeMemoHtml(editorInitialHtml)}
      isSaving={isSavingMemo}
      memoError={memoError}
      memoColors={memoColors}
      onChange={setEditorInitialHtml}
      onFormat={applyMemoFormat}
      onSave={saveMemoEditor}
      onCancel={closeMemoEditor}
    />
  )

  const renderCommentNode = (node: CommentNode, depth = 0) => {
    const isEditingThisComment = editingCommentId === node.id
    const isDeleted = !!node.deleted
    return (
      <div className="comment-thread" key={node.id}>
        <div className="comment-row" style={{ marginLeft: `${12 + depth * 28}px` }} data-search-entity="comment" data-search-id={node.id} tabIndex={-1}>
          <div className="comment-avatar">{node.author.charAt(0).toUpperCase()}</div>
          <div className="comment-item compact">
            <div className="comment-author"><strong>{node.author}</strong><span>{node.createdAt}</span></div>
            {!isEditingThisComment ? (
              <div className={`comment-body ${isDeleted ? 'comment-body-deleted' : ''}`}>
                {isDeleted ? '삭제된 댓글입니다' : node.content}
              </div>
            ) : (
              <textarea className="comment-reply-editor" value={editingCommentDraft} onChange={(event) => setEditingCommentDraft(event.target.value)} />
            )}
            <div className="comment-actions">
              {!isDeleted && !isEditingThisComment && (
                <>
                  <button type="button" onClick={() => { setReplyTargetId(node.id); setReplyDraft('') }}>답글</button>
                  <button type="button" onClick={() => { setEditingCommentId(node.id); setEditingCommentDraft(node.content) }}>수정</button>
                  <button type="button" onClick={() => setDeleteTargetId(node.id)}>삭제</button>
                </>
              )}
              {!isDeleted && isEditingThisComment && (
                <>
                  <button type="button" onClick={() => handleEditSubmit(node.id)}>저장</button>
                  <button type="button" onClick={() => { setEditingCommentId(null); setEditingCommentDraft('') }}>취소</button>
                </>
              )}
            </div>
          </div>
        </div>
        {!isDeleted && replyTargetId === node.id && (
          <div className="comment-reply-editor-wrap" style={{ marginLeft: `${42 + depth * 28}px` }}>
            <div className="comment-reply-editor-arrow">↳</div>
            <div className="comment-reply-editor-box">
              <textarea className="comment-reply-editor" value={replyDraft} onChange={(event) => setReplyDraft(event.target.value)} placeholder="답글 입력..." />
              <div className="comment-reply-editor-actions">
                <button type="button" onClick={() => handleReplySubmit(node.id)}>등록</button>
                <button type="button" onClick={() => { setReplyTargetId(null); setReplyDraft('') }}>취소</button>
              </div>
            </div>
          </div>
        )}
        {node.children.length > 0 && <div className="comment-children">{node.children.map((child) => renderCommentNode(child, depth + 1))}</div>}
      </div>
    )
  }

  return (
    <section className="content-card communication-card">
      <div className="section-header section-header-row">
        <div>
          <div className="section-eyebrow">NOTES & ACTIVITY</div>
          <h2>메모와 댓글 <span>{memos.length}개 · 댓글 {comments.length}</span></h2>
        </div>
        {editingMemoId ? <span className="memo-editing-label">메모 편집 중</span> : <button type="button" onClick={() => openMemoEditor()}>+ 새 메모</button>}
      </div>

      <div className="memo-card-list">
        {editingMemoId === '__new__' && renderMemoEditor()}
        {memos.map((memo) => (
          <article className="memo-card-item" key={memo.id} data-search-entity="memo" data-search-id={memo.id} tabIndex={-1}>
            {editingMemoId === memo.id ? renderMemoEditor() : (
              <>
                <div className="memo-card-meta">
                  <div className="memo-author-line">
                    <span className="memo-author-avatar">{memo.author.charAt(0).toUpperCase()}</span>
                    <strong>{memo.author}</strong>
                    <span>{memo.updatedAt}</span>
                  </div>
                  <div className="memo-card-actions">
                    <button type="button" onClick={() => openMemoEditor(memo)}>수정</button>
                    <button type="button" onClick={() => setMemoDeleteTargetId(memo.id)}>삭제</button>
                  </div>
                </div>
                <div className="memo-box compact rich-memo-content" dangerouslySetInnerHTML={{ __html: sanitizeMemoHtml(memo.contentHtml) }} />
              </>
            )}
          </article>
        ))}
        {memos.length === 0 && editingMemoId !== '__new__' && (
          <button className="memo-empty-state" type="button" onClick={() => openMemoEditor()}>
            <strong>아직 메모가 없습니다</strong><span>클릭해서 첫 메모를 작성하세요.</span>
          </button>
        )}
      </div>

      <div className="comment-actions memo-root-actions">
        {!isRootReplyOpen && <button type="button" onClick={() => setIsRootReplyOpen(true)}>+ 댓글 남기기</button>}
      </div>
      {isRootReplyOpen && (
        <div className="comment-reply-editor-wrap comment-root-editor-wrap">
          <div className="comment-reply-editor-arrow">↳</div>
          <div className="comment-reply-editor-box">
            <textarea className="comment-reply-editor" value={newCommentDraft} onChange={(event) => setNewCommentDraft(event.target.value)} placeholder="메모에 대한 댓글 입력..." />
            <div className="comment-reply-editor-actions">
              <button type="button" onClick={handleNewCommentSubmit}>댓글 등록</button>
              <button type="button" onClick={() => { setIsRootReplyOpen(false); setNewCommentDraft('') }}>취소</button>
            </div>
          </div>
        </div>
      )}

      <div className="inline-comments">{commentTree.map((node) => renderCommentNode(node))}</div>

      {memoDeleteTarget && (
        <div className="modal-backdrop"><div className="confirm-modal">
          <div className="confirm-modal-title">메모 삭제 확인</div>
          <div className="confirm-modal-body">이 메모를 정말 삭제하시겠습니까?</div>
          <div className="confirm-modal-actions">
            <button type="button" onClick={async () => { await onDeleteMemo(memoDeleteTarget.id); setMemoDeleteTargetId(null) }}>삭제</button>
            <button type="button" onClick={() => setMemoDeleteTargetId(null)}>취소</button>
          </div>
        </div></div>
      )}

      {deleteTarget && (
        <div className="modal-backdrop"><div className="confirm-modal">
          <div className="confirm-modal-title">댓글 삭제 확인</div>
          <div className="confirm-modal-body">이 댓글을 정말 삭제하시겠습니까?<br />하위 답글은 유지되고, 본문만 "삭제된 댓글입니다"로 표시됩니다.</div>
          <div className="confirm-modal-actions">
            <button type="button" onClick={() => void handleDeleteComment()}>삭제</button>
            <button type="button" onClick={() => setDeleteTargetId(null)}>취소</button>
          </div>
        </div></div>
      )}
    </section>
  )
}

export default MemoSection
