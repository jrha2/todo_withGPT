import { useMemo, useState } from 'react'
import type { MouseEvent } from 'react'

type NavigationNode = {
  id: string
  parentId: string | null
  type: 'folder' | 'task'
  title: string
  expanded?: boolean
  order: number
}

type RenderNode = NavigationNode & {
  depth: number
}

type NavigationBarProps = {
  tree: NavigationNode[]
  selectedTaskId: string
  onSelectTask: (taskId: string) => void
  onToggleFolder: (folderId: string) => void
  onRenameNode: (nodeId: string, nextTitle: string) => void
  onCreateFolder: (title: string, parentId: string | null) => void
  onCreateTask: (title: string, parentId: string | null) => void
  onCreateChildFolder: (parentId: string, title: string) => void
  onCreateChildTask: (parentId: string, title: string) => void
  onDeleteNode: (nodeId: string) => void
  onMoveNode: (nodeId: string, targetFolderId: string) => void
  onCopyNode: (nodeId: string, targetFolderId: string) => void
  onMoveNodeUp: (nodeId: string) => void
  onMoveNodeDown: (nodeId: string) => void
}

type MenuState = {
  nodeId: string
  nodeType: 'folder' | 'task'
  x: number
  y: number
} | null

type ChildCreateState = {
  parentId: string
  kind: 'folder' | 'task'
} | null

type MoveState = {
  nodeId: string
} | null

type CopyState = {
  nodeId: string
} | null

function NavigationBar({
  tree,
  selectedTaskId,
  onSelectTask,
  onToggleFolder,
  onRenameNode,
  onCreateFolder,
  onCreateTask,
  onCreateChildFolder,
  onCreateChildTask,
  onDeleteNode,
  onMoveNode,
  onCopyNode,
  onMoveNodeUp,
  onMoveNodeDown,
}: NavigationBarProps) {
  const [menuState, setMenuState] = useState<MenuState>(null)
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newFolderTitle, setNewFolderTitle] = useState('')
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newFolderParentId, setNewFolderParentId] = useState<string>('root')
  const [newTaskParentId, setNewTaskParentId] = useState<string>('root')
  const [childCreateState, setChildCreateState] = useState<ChildCreateState>(null)
  const [childCreateTitle, setChildCreateTitle] = useState('')
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [moveState, setMoveState] = useState<MoveState>(null)
  const [moveTargetFolderId, setMoveTargetFolderId] = useState('')
  const [copyState, setCopyState] = useState<CopyState>(null)
  const [copyTargetFolderId, setCopyTargetFolderId] = useState('')

  const visibleNodes = useMemo(() => {
    const childrenMap = new Map<string | null, NavigationNode[]>()

    tree.forEach((node) => {
      const siblings = childrenMap.get(node.parentId) ?? []
      siblings.push(node)
      childrenMap.set(node.parentId, siblings)
    })

    childrenMap.forEach((siblings) => {
      siblings.sort((a, b) => a.order - b.order)
    })

    const result: RenderNode[] = []

    const walk = (parentId: string | null, depth: number) => {
      const children = childrenMap.get(parentId) ?? []

      children.forEach((node) => {
        result.push({
          ...node,
          depth,
        })

        if (childCreateState?.parentId === node.id) {
          result.push({
            id: `__create__${node.id}`,
            parentId: node.id,
            type: childCreateState.kind,
            title: '',
            expanded: false,
            order: 999999,
            depth: depth + 1,
          })
        }

        if (moveState?.nodeId === node.id) {
          result.push({
            id: `__move__${node.id}`,
            parentId: node.parentId,
            type: 'task',
            title: '',
            expanded: false,
            order: 999998,
            depth: depth + 1,
          })
        }

        if (copyState?.nodeId === node.id) {
          result.push({
            id: `__copy__${node.id}`,
            parentId: node.parentId,
            type: 'task',
            title: '',
            expanded: false,
            order: 999997,
            depth: depth + 1,
          })
        }

        if (node.type === 'folder' && node.expanded) {
          walk(node.id, depth + 1)
        }
      })
    }

    walk(null, 0)

    return result
  }, [tree, childCreateState, moveState, copyState])

  const childCreateTarget =
    childCreateState
      ? tree.find((node) => node.id === childCreateState.parentId) ?? null
      : null

  const deleteTarget = deleteTargetId
    ? tree.find((node) => node.id === deleteTargetId) ?? null
    : null

  const folderOptions = tree.filter((node) => node.type === 'folder')
  const moveTarget = moveState
    ? tree.find((node) => node.id === moveState.nodeId) ?? null
    : null
  const copyTarget = copyState
    ? tree.find((node) => node.id === copyState.nodeId) ?? null
    : null

  const openMenu = (
    event: MouseEvent,
    nodeId: string,
    nodeType: 'folder' | 'task',
  ) => {
    event.preventDefault()
    event.stopPropagation()

    setMenuState({
      nodeId,
      nodeType,
      x: event.clientX,
      y: event.clientY,
    })
  }

  const handleOpenRename = () => {
    if (!menuState) {
      return
    }

    const targetNode = tree.find((node) => node.id === menuState.nodeId)
    if (!targetNode) {
      return
    }

    setEditingNodeId(targetNode.id)
    setEditingTitle(targetNode.title)
    setMenuState(null)
  }

  const handleRenameSubmit = () => {
    if (!editingNodeId) {
      return
    }

    const trimmed = editingTitle.trim()

    if (!trimmed) {
      return
    }

    onRenameNode(editingNodeId, trimmed)
    setEditingNodeId(null)
    setEditingTitle('')
  }

  const handleCreateFolderSubmit = () => {
    const trimmed = newFolderTitle.trim()

    if (!trimmed) {
      return
    }

    onCreateFolder(trimmed, newFolderParentId === 'root' ? null : newFolderParentId)
    setNewFolderTitle('')
    setNewFolderParentId('root')
    setIsCreateOpen(false)
  }

  const handleCreateTaskSubmit = () => {
    const trimmed = newTaskTitle.trim()

    if (!trimmed) {
      return
    }

    onCreateTask(trimmed, newTaskParentId === 'root' ? null : newTaskParentId)
    setNewTaskTitle('')
    setNewTaskParentId('root')
    setIsCreateOpen(false)
  }

  const handleOpenChildCreate = (kind: 'folder' | 'task') => {
    if (!menuState || menuState.nodeType !== 'folder') {
      return
    }

    setChildCreateState({
      parentId: menuState.nodeId,
      kind,
    })
    setChildCreateTitle('')
    setMenuState(null)
  }

  const handleChildCreateSubmit = () => {
    if (!childCreateState) {
      return
    }

    const trimmed = childCreateTitle.trim()

    if (!trimmed) {
      return
    }

    if (childCreateState.kind === 'folder') {
      onCreateChildFolder(childCreateState.parentId, trimmed)
    } else {
      onCreateChildTask(childCreateState.parentId, trimmed)
    }

    setChildCreateState(null)
    setChildCreateTitle('')
  }

  const handleOpenDelete = () => {
    if (!menuState) {
      return
    }

    setDeleteTargetId(menuState.nodeId)
    setMenuState(null)
  }

  const handleOpenMove = () => {
    if (!menuState) {
      return
    }

    setMoveState({ nodeId: menuState.nodeId })
    setMoveTargetFolderId('')
    setMenuState(null)
  }

  const handleMoveSubmit = () => {
    if (!moveState || !moveTargetFolderId) {
      return
    }

    onMoveNode(moveState.nodeId, moveTargetFolderId)
    setMoveState(null)
    setMoveTargetFolderId('')
  }

  const handleOpenCopy = () => {
    if (!menuState) {
      return
    }

    setCopyState({ nodeId: menuState.nodeId })
    setCopyTargetFolderId('')
    setMenuState(null)
  }

  const handleCopySubmit = () => {
    if (!copyState || !copyTargetFolderId) {
      return
    }

    onCopyNode(copyState.nodeId, copyTargetFolderId)
    setCopyState(null)
    setCopyTargetFolderId('')
  }

  const handleMoveUp = () => {
    if (!menuState) {
      return
    }

    onMoveNodeUp(menuState.nodeId)
    setMenuState(null)
  }

  const handleMoveDown = () => {
    if (!menuState) {
      return
    }

    onMoveNodeDown(menuState.nodeId)
    setMenuState(null)
  }

  return (
    <aside
      className="navigation-bar"
      onClick={() => setMenuState(null)}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="navigation-header">
        <div className="navigation-title">Navigation Bar</div>
        <button
          className="navigation-add-button"
          type="button"
          onClick={() => setIsCreateOpen((prev) => !prev)}
        >
          +
        </button>
      </div>

      <div className="navigation-search">
        <input type="text" placeholder="폴더 또는 Task 검색" />
      </div>

      {isCreateOpen && (
        <div className="navigation-create-panel">
          <div className="navigation-create-group">
            <div className="navigation-create-label">새 폴더</div>
            <input
              value={newFolderTitle}
              onChange={(event) => setNewFolderTitle(event.target.value)}
              placeholder="폴더 이름"
            />
            <select
              value={newFolderParentId}
              onChange={(event) => setNewFolderParentId(event.target.value)}
            >
              <option value="root">최상위</option>
              {folderOptions.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.title}
                </option>
              ))}
            </select>
            <button type="button" onClick={handleCreateFolderSubmit}>
              폴더 추가
            </button>
          </div>

          <div className="navigation-create-group">
            <div className="navigation-create-label">새 Task</div>
            <input
              value={newTaskTitle}
              onChange={(event) => setNewTaskTitle(event.target.value)}
              placeholder="Task 이름"
            />
            <select
              value={newTaskParentId}
              onChange={(event) => setNewTaskParentId(event.target.value)}
            >
              <option value="root">최상위</option>
              {folderOptions.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.title}
                </option>
              ))}
            </select>
            <button type="button" onClick={handleCreateTaskSubmit}>
              Task 추가
            </button>
          </div>
        </div>
      )}

      <div className="navigation-tree">
        {visibleNodes.map((node) => {
          if (node.id.startsWith('__create__')) {
            return (
              <div className="navigation-node-row" key={node.id}>
                <div
                  className="navigation-inline-editor"
                  style={{ marginLeft: `${node.depth * 18}px` }}
                >
                  <input
                    value={childCreateTitle}
                    onChange={(event) => setChildCreateTitle(event.target.value)}
                    placeholder={
                      childCreateState?.kind === 'folder'
                        ? '하위 폴더 이름'
                        : '하위 Task 이름'
                    }
                    autoFocus
                  />
                  <div className="navigation-inline-actions">
                    <button type="button" onClick={handleChildCreateSubmit}>
                      저장
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setChildCreateState(null)
                        setChildCreateTitle('')
                      }}
                    >
                      취소
                    </button>
                  </div>
                </div>
              </div>
            )
          }

          if (node.id.startsWith('__move__')) {
            return (
              <div className="navigation-node-row" key={node.id}>
                <div
                  className="navigation-inline-editor"
                  style={{ marginLeft: `${node.depth * 18}px` }}
                >
                  <select
                    value={moveTargetFolderId}
                    onChange={(event) => setMoveTargetFolderId(event.target.value)}
                    autoFocus
                  >
                    <option value="">이동할 폴더 선택</option>
                    {folderOptions
                      .filter((folder) => folder.id !== moveTarget?.id)
                      .map((folder) => (
                        <option key={folder.id} value={folder.id}>
                          {folder.title}
                        </option>
                      ))}
                  </select>
                  <div className="navigation-inline-actions">
                    <button type="button" onClick={handleMoveSubmit}>
                      이동
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMoveState(null)
                        setMoveTargetFolderId('')
                      }}
                    >
                      취소
                    </button>
                  </div>
                </div>
              </div>
            )
          }

          if (node.id.startsWith('__copy__')) {
            return (
              <div className="navigation-node-row" key={node.id}>
                <div
                  className="navigation-inline-editor"
                  style={{ marginLeft: `${node.depth * 18}px` }}
                >
                  <select
                    value={copyTargetFolderId}
                    onChange={(event) => setCopyTargetFolderId(event.target.value)}
                    autoFocus
                  >
                    <option value="">복사할 폴더 선택</option>
                    {folderOptions
                      .filter((folder) => folder.id !== copyTarget?.id)
                      .map((folder) => (
                        <option key={folder.id} value={folder.id}>
                          {folder.title}
                        </option>
                      ))}
                  </select>
                  <div className="navigation-inline-actions">
                    <button type="button" onClick={handleCopySubmit}>
                      복사
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCopyState(null)
                        setCopyTargetFolderId('')
                      }}
                    >
                      취소
                    </button>
                  </div>
                </div>
              </div>
            )
          }

          const isEditing = editingNodeId === node.id

          return (
            <div
              className="navigation-node-row"
              key={node.id}
              onContextMenu={(event) => openMenu(event, node.id, node.type)}
            >
              {!isEditing ? (
                <>
                  <button
                    className={[
                      'tree-node',
                      node.type,
                      selectedTaskId === node.id ? 'is-selected' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={{ marginLeft: `${node.depth * 18}px` }}
                    type="button"
                    onClick={() =>
                      node.type === 'folder'
                        ? onToggleFolder(node.id)
                        : onSelectTask(node.id)
                    }
                  >
                    {node.type === 'folder'
                      ? `${node.expanded ? '▼' : '▶'} ${node.title}`
                      : `Task: ${node.title}`}
                  </button>

                  <button
                    className="navigation-more-button"
                    type="button"
                    onClick={(event) => openMenu(event, node.id, node.type)}
                  >
                    ⋯
                  </button>
                </>
              ) : (
                <div
                  className="navigation-inline-editor"
                  style={{ marginLeft: `${node.depth * 18}px` }}
                >
                  <input
                    value={editingTitle}
                    onChange={(event) => setEditingTitle(event.target.value)}
                    autoFocus
                  />
                  <div className="navigation-inline-actions">
                    <button type="button" onClick={handleRenameSubmit}>
                      저장
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingNodeId(null)
                        setEditingTitle('')
                      }}
                    >
                      취소
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {menuState && (
        <div
          className="navigation-context-menu"
          style={{
            left: `${menuState.x}px`,
            top: `${menuState.y}px`,
          }}
        >
          <button type="button" onClick={handleMoveUp}>
            위로 이동
          </button>
          <button type="button" onClick={handleMoveDown}>
            아래로 이동
          </button>

          <button type="button" onClick={handleOpenRename}>
            이름 변경
          </button>

          {menuState.nodeType === 'folder' && (
            <>
              <button type="button" onClick={() => handleOpenChildCreate('folder')}>
                하위 폴더 추가
              </button>
              <button type="button" onClick={() => handleOpenChildCreate('task')}>
                하위 Task 추가
              </button>
            </>
          )}

          <button type="button" onClick={handleOpenMove}>
            이동
          </button>

          <button type="button" onClick={handleOpenCopy}>
            복사
          </button>

          <button type="button" onClick={handleOpenDelete}>
            삭제
          </button>
        </div>
      )}

      {deleteTarget && (
        <div className="modal-backdrop">
          <div className="confirm-modal">
            <div className="confirm-modal-title">Navigation 항목 삭제 확인</div>
            <div className="confirm-modal-body">
              "{deleteTarget.title}" 항목을 삭제하시겠습니까?
            </div>
            <div className="confirm-modal-actions">
              <button
                type="button"
                onClick={() => {
                  onDeleteNode(deleteTarget.id)
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
    </aside>
  )
}

export default NavigationBar
