import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent, MouseEvent } from 'react'
import type { AuthUser } from '../../../services/api/authApi'

type NavigationNode = {
  id: string
  parentId: string | null
  type: 'folder' | 'task'
  title: string
  expanded?: boolean
  order: number
  completed: boolean
}

type RenderNode = NavigationNode & {
  depth: number
  isLastSibling?: boolean
}

type NavigationBarProps = {
  currentUser: AuthUser
  onOpenAdmin: () => void
  onLogout: () => void
  onCollapse: () => void
  isBriefingActive: boolean
  onOpenBriefing: () => void
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
  onMoveNode: (nodeId: string, targetFolderId: string | null) => void
  onCopyNode: (nodeId: string, targetFolderId: string | null) => void
  onMoveNodeUp: (nodeId: string) => void
  onMoveNodeDown: (nodeId: string) => void
  onDropNode: (
    nodeId: string,
    targetNodeId: string,
    position: DropPosition,
  ) => void
  onDropNodeToRoot: (nodeId: string) => void
}

type DropPosition = 'before' | 'after' | 'inside'

type DropTargetState = {
  nodeId: string
  position: DropPosition | 'root'
} | null

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
  currentUser,
  onOpenAdmin,
  onLogout,
  onCollapse,
  isBriefingActive,
  onOpenBriefing,
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
  onDropNode,
  onDropNodeToRoot,
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
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null)
  const [dropTargetState, setDropTargetState] = useState<DropTargetState>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase()
  const isSearching = normalizedSearchQuery.length > 0

  useEffect(() => {
    const handleSearchShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchInputRef.current?.focus()
      }
    }

    window.addEventListener('keydown', handleSearchShortcut)
    return () => window.removeEventListener('keydown', handleSearchShortcut)
  }, [])

  const visibleNodes = useMemo(() => {
    const childrenMap = new Map<string | null, NavigationNode[]>()
    const nodeMap = new Map(tree.map((node) => [node.id, node]))
    const includedNodeIds = new Set<string>()

    tree.forEach((node) => {
      const siblings = childrenMap.get(node.parentId) ?? []
      siblings.push(node)
      childrenMap.set(node.parentId, siblings)

      if (isSearching && node.title.toLocaleLowerCase().includes(normalizedSearchQuery)) {
        let currentNode: NavigationNode | undefined = node
        const visitedNodeIds = new Set<string>()

        while (currentNode && !visitedNodeIds.has(currentNode.id)) {
          includedNodeIds.add(currentNode.id)
          visitedNodeIds.add(currentNode.id)
          currentNode = currentNode.parentId
            ? nodeMap.get(currentNode.parentId)
            : undefined
        }
      }
    })

    childrenMap.forEach((siblings) => {
      siblings.sort((a, b) => a.order - b.order)
    })

    const result: RenderNode[] = []

    const walk = (parentId: string | null, depth: number) => {
      const allChildren = childrenMap.get(parentId) ?? []
      const children = isSearching
        ? allChildren.filter((node) => includedNodeIds.has(node.id))
        : allChildren

      children.forEach((node, index) => {
        result.push({
          ...node,
          depth,
          isLastSibling: index === children.length - 1,
        })

        if (!isSearching && childCreateState?.parentId === node.id) {
          result.push({
            id: `__create__${node.id}`,
            parentId: node.id,
            type: childCreateState.kind,
            title: '',
            expanded: false,
            order: 999999,
            completed: false,
            depth: depth + 1,
          })
        }

        if (!isSearching && moveState?.nodeId === node.id) {
          result.push({
            id: `__move__${node.id}`,
            parentId: node.parentId,
            type: 'task',
            title: '',
            expanded: false,
            order: 999998,
            completed: false,
            depth: depth + 1,
          })
        }

        if (!isSearching && copyState?.nodeId === node.id) {
          result.push({
            id: `__copy__${node.id}`,
            parentId: node.parentId,
            type: 'task',
            title: '',
            expanded: false,
            order: 999997,
            completed: false,
            depth: depth + 1,
          })
        }

        if (node.type === 'folder' && (node.expanded || isSearching)) {
          walk(node.id, depth + 1)
        }
      })
    }

    walk(null, 0)

    return result
  }, [
    tree,
    childCreateState,
    moveState,
    copyState,
    isSearching,
    normalizedSearchQuery,
  ])

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

  const moveBlockedFolderIds = useMemo(() => {
    const blockedIds = new Set<string>()

    if (!moveTarget || moveTarget.type !== 'folder') {
      return blockedIds
    }

    const pendingIds = [moveTarget.id]

    while (pendingIds.length > 0) {
      const currentId = pendingIds.shift()

      if (!currentId || blockedIds.has(currentId)) {
        continue
      }

      blockedIds.add(currentId)
      tree
        .filter((node) => node.parentId === currentId && node.type === 'folder')
        .forEach((node) => pendingIds.push(node.id))
    }

    return blockedIds
  }, [tree, moveTarget])

  const openMenu = (
    event: MouseEvent,
    nodeId: string,
    nodeType: 'folder' | 'task',
  ) => {
    event.preventDefault()
    event.stopPropagation()

    const menuWidth = 176
    const menuHeight = nodeType === 'folder' ? 260 : 205
    setMenuState({
      nodeId,
      nodeType,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8)),
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

    onMoveNode(
      moveState.nodeId,
      moveTargetFolderId === 'root' ? null : moveTargetFolderId,
    )
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

    onCopyNode(
      copyState.nodeId,
      copyTargetFolderId === 'root' ? null : copyTargetFolderId,
    )
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

  const isInvalidDrop = (
    sourceNode: NavigationNode,
    targetNode: NavigationNode,
    position: DropPosition,
  ) => {
    if (sourceNode.id === targetNode.id) {
      return true
    }

    if (sourceNode.type !== 'folder') {
      return false
    }

    let destinationParentId = position === 'inside'
      ? targetNode.id
      : targetNode.parentId

    while (destinationParentId) {
      if (destinationParentId === sourceNode.id) {
        return true
      }

      destinationParentId =
        tree.find((node) => node.id === destinationParentId)?.parentId ?? null
    }

    return false
  }

  const getDropPosition = (
    event: DragEvent<HTMLDivElement>,
    targetNode: NavigationNode,
  ): DropPosition => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const verticalRatio = (event.clientY - bounds.top) / bounds.height

    if (targetNode.type === 'folder' && verticalRatio >= 0.25 && verticalRatio <= 0.75) {
      return 'inside'
    }

    return verticalRatio < 0.5 ? 'before' : 'after'
  }

  const handleNodeDragStart = (
    event: DragEvent<HTMLDivElement>,
    nodeId: string,
  ) => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', nodeId)
    setDraggedNodeId(nodeId)
    setDropTargetState(null)
    setMenuState(null)
  }

  const handleNodeDragOver = (
    event: DragEvent<HTMLDivElement>,
    targetNode: NavigationNode,
  ) => {
    if (!draggedNodeId) {
      return
    }

    const sourceNode = tree.find((node) => node.id === draggedNodeId)
    if (!sourceNode) {
      return
    }

    const position = getDropPosition(event, targetNode)
    if (isInvalidDrop(sourceNode, targetNode, position)) {
      event.dataTransfer.dropEffect = 'none'
      setDropTargetState(null)
      return
    }

    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'
    setDropTargetState({ nodeId: targetNode.id, position })
  }

  const handleNodeDrop = (
    event: DragEvent<HTMLDivElement>,
    targetNode: NavigationNode,
  ) => {
    event.preventDefault()
    event.stopPropagation()

    if (!draggedNodeId || !dropTargetState || dropTargetState.position === 'root') {
      return
    }

    onDropNode(draggedNodeId, targetNode.id, dropTargetState.position)
    setDraggedNodeId(null)
    setDropTargetState(null)
  }

  const handleRootDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!draggedNodeId || event.target !== event.currentTarget) {
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropTargetState({ nodeId: '__root__', position: 'root' })
  }

  const handleRootDrop = (event: DragEvent<HTMLDivElement>) => {
    if (
      !draggedNodeId
      || event.target !== event.currentTarget
      || dropTargetState?.position !== 'root'
    ) {
      return
    }

    event.preventDefault()
    onDropNodeToRoot(draggedNodeId)
    setDraggedNodeId(null)
    setDropTargetState(null)
  }

  const handleNodeDragEnd = () => {
    setDraggedNodeId(null)
    setDropTargetState(null)
  }

  return (
    <aside
      className="navigation-bar"
      onClick={() => setMenuState(null)}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="navigation-header">
        <div className="navigation-brand">
          <div className="navigation-brand-mark">✓</div>
          <div>
            <div className="navigation-title">투자기획팀</div>
            <div className="navigation-subtitle">업무관리 공간 · Beta 0.9.8</div>
          </div>
        </div>
        <div className="navigation-header-actions">
          <button
            className="navigation-collapse-button"
            type="button"
            aria-label="Navigation Bar 접기"
            title="Navigation Bar 접기"
            onClick={onCollapse}
          >
            ‹
          </button>
          <button
            className="navigation-add-button"
            type="button"
            aria-label="새 항목 추가"
            title="새 항목 추가"
            onClick={() => setIsCreateOpen((prev) => !prev)}
          >
            +
          </button>
        </div>
      </div>

      <button
        className={`navigation-briefing-button ${isBriefingActive ? 'is-active' : ''}`}
        type="button"
        onClick={onOpenBriefing}
      >
        <span className="navigation-briefing-icon" aria-hidden="true">▤</span>
        <span>
          <strong>To Do Briefing</strong>
          <small>주간 변경사항과 기한 업무</small>
        </span>
        <span className="navigation-briefing-arrow" aria-hidden="true">→</span>
      </button>

      <div className="navigation-search">
        <span className="navigation-search-icon">⌕</span>
        <input
          ref={searchInputRef}
          type="search"
          value={searchQuery}
          placeholder="폴더 또는 Task 검색"
          aria-label="폴더 또는 Task 검색"
          onChange={(event) => setSearchQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setSearchQuery('')
              event.currentTarget.blur()
            }
          }}
        />
        <kbd>Ctrl K</kbd>
      </div>

      <div className="navigation-account-card">
        <div className="navigation-account-avatar">
          {currentUser.name.charAt(0).toUpperCase()}
        </div>
        <div className="navigation-account-copy">
          <strong>{currentUser.name}</strong>
          <span>{currentUser.loginId} · {currentUser.role === 'admin' ? '관리자' : '사용자'}</span>
        </div>
        <div className="navigation-account-actions">
          {currentUser.role === 'admin' && (
            <button type="button" onClick={onOpenAdmin}>관리</button>
          )}
          <button type="button" onClick={onLogout}>로그아웃</button>
        </div>
      </div>

      {isCreateOpen && (
        <div className="navigation-create-panel">
          <div className="navigation-create-group">
            <div className="navigation-create-label">새 폴더</div>
            <input
              value={newFolderTitle}
              onChange={(event) => setNewFolderTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleCreateFolderSubmit()
              }}
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
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleCreateTaskSubmit()
              }}
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

      <div className="navigation-section-header">
        <span>프로젝트</span>
        <span>
          {isSearching
            ? visibleNodes.filter((node) => node.type === 'task').length
            : tree.filter((node) => node.type === 'task').length}
        </span>
      </div>

      <div
        className={`navigation-tree ${dropTargetState?.position === 'root' ? 'is-root-drop-target' : ''}`}
        onDragOver={handleRootDragOver}
        onDrop={handleRootDrop}
      >
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
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') handleChildCreateSubmit()
                      if (event.key === 'Escape') {
                        setChildCreateState(null)
                        setChildCreateTitle('')
                      }
                    }}
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
                    <option value="root">최상위</option>
                    {folderOptions
                      .filter((folder) => !moveBlockedFolderIds.has(folder.id))
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
                    <option value="root">최상위</option>
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
              className={[
                'navigation-node-row',
                draggedNodeId === node.id ? 'is-dragging' : '',
                dropTargetState?.nodeId === node.id
                  ? `drop-${dropTargetState.position}`
                  : '',
              ]
                .filter(Boolean)
                .join(' ')}
              key={node.id}
              draggable={!isEditing && !isSearching}
              onContextMenu={(event) => openMenu(event, node.id, node.type)}
              onDragStart={(event) => handleNodeDragStart(event, node.id)}
              onDragOver={(event) => handleNodeDragOver(event, node)}
              onDrop={(event) => handleNodeDrop(event, node)}
              onDragEnd={handleNodeDragEnd}
            >
              {!isEditing ? (
                <>
                  <button
                    className={[
                      'tree-node',
                      node.type,
                      selectedTaskId === node.id ? 'is-selected' : '',
                      node.type === 'task' && node.completed ? 'is-completed' : '',
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
                    {node.type === 'folder' ? (
                      <>
                        <span
                          className={`tree-node-chevron ${node.expanded || isSearching ? 'is-expanded' : ''}`}
                          aria-hidden="true"
                        >
                          <svg viewBox="0 0 16 16">
                            <path d="M6 3.5 10.5 8 6 12.5" />
                          </svg>
                        </span>
                        <span className="tree-node-icon folder-icon" />
                        <span className="tree-node-label">{node.title}</span>
                      </>
                    ) : (
                      <>
                        {node.parentId ? (
                          <span
                            className="tree-node-branch is-child"
                            aria-hidden="true"
                          >
                            {node.isLastSibling ? '└─' : '├─'}
                          </span>
                        ) : (
                          <span
                            className="tree-node-root-marker"
                            title="최상위 Task"
                            aria-hidden="true"
                          >
                            ◎
                          </span>
                        )}
                        <span className="tree-node-icon task-icon" />
                        <span className="tree-node-label">{node.title}</span>
                        {node.completed && (
                          <span className="tree-node-completed-badge">완료</span>
                        )}
                      </>
                    )}
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
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') handleRenameSubmit()
                      if (event.key === 'Escape') {
                        setEditingNodeId(null)
                        setEditingTitle('')
                      }
                    }}
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
        {isSearching && visibleNodes.length === 0 && (
          <div className="navigation-search-empty" role="status">
            검색 결과가 없습니다.
          </div>
        )}
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
              {deleteTarget.type === 'folder' && (
                <>
                  <br />
                  폴더 안의 모든 하위 폴더와 Task도 함께 삭제됩니다.
                </>
              )}
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
