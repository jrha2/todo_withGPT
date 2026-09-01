import { useEffect, useRef } from 'react'

type MemoEditorProps = {
  // Initial HTML to seed the editor with. It is injected into the
  // contentEditable exactly once (on mount / when the edit target changes) so
  // that typing does not re-write innerHTML and reset the caret to the front.
  initialHtml: string
  isSaving: boolean
  memoError: string
  memoColors: Array<{ value: string; label: string }>
  onChange: (html: string) => void
  onFormat: (command: 'bold' | 'foreColor', value?: string) => void
  onSave: () => void
  onCancel: () => void
  editorRef: React.RefObject<HTMLDivElement | null>
}

function MemoEditor({
  initialHtml,
  isSaving,
  memoError,
  memoColors,
  onChange,
  onFormat,
  onSave,
  onCancel,
  editorRef,
}: MemoEditorProps) {
  // Track the DOM node the editor owns so we can seed it a single time.
  const seededRef = useRef(false)

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || seededRef.current) return
    // Seed the editor content once. After this the contentEditable DOM is the
    // source of truth for the caret; React state is only mirrored via onChange.
    editor.innerHTML = initialHtml
    seededRef.current = true
    // Place the caret at the end of the existing content so editing an existing
    // memo continues from where the text ends, like a normal input.
    const selection = window.getSelection()
    if (selection) {
      const range = document.createRange()
      range.selectNodeContents(editor)
      range.collapse(false)
      selection.removeAllRanges()
      selection.addRange(range)
    }
    editor.focus()
  }, [editorRef, initialHtml])

  return (
    <div className="rich-memo-editor-wrap">
      <div className="rich-memo-toolbar" aria-label="메모 서식">
        <button
          type="button"
          title="굵게"
          onMouseDown={(event) => {
            event.preventDefault()
            onFormat('bold')
          }}
        >
          <strong>B</strong>
        </button>
        <span className="rich-memo-toolbar-divider" />
        {memoColors.map((color) => (
          <button
            className="memo-color-button"
            type="button"
            title={`${color.label} 글자색`}
            aria-label={`${color.label} 글자색`}
            key={color.value}
            onMouseDown={(event) => {
              event.preventDefault()
              onFormat('foreColor', color.value)
            }}
          >
            <span style={{ backgroundColor: color.value }} />
          </button>
        ))}
      </div>
      <div
        className="rich-memo-editor"
        contentEditable
        suppressContentEditableWarning
        ref={editorRef}
        onInput={(event) => onChange(event.currentTarget.innerHTML)}
        data-placeholder="메모 내용을 입력하세요."
      />
      {memoError && <div className="task-field-error">{memoError}</div>}
      <div className="memo-edit-actions">
        <button type="button" onClick={onSave} disabled={isSaving}>
          {isSaving ? '저장 중...' : '저장'}
        </button>
        <button type="button" onClick={onCancel} disabled={isSaving}>취소</button>
      </div>
    </div>
  )
}

export default MemoEditor
