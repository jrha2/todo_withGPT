import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent, MouseEvent } from 'react'
import type { AuthUser } from '../../../services/api/authApi'
import type {
  NavigationScope,
  NavigationSearchHit,
} from '../../../services/api/navigationApi'
import type { WorkspaceView } from '../../../services/api/workspaceApi'
import { setDraftDirty } from '../../../services/draftRegistry'

type NavigationNode = {
  id: string
  parentId: string | null
  type: 'folder' | 'task'
  title: string
  expanded?: boolean
  order: number
  completed: boolean
  matchKinds?: string[]
  searchHits: NavigationSearchHit[]
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
  activeSmartView: WorkspaceView | null
  onOpenSmartView: (view: WorkspaceView) => void
  isTrashActive: boolean
  onOpenTrash: () => void
  onOpenSearchHit: (hit: NavigationSearchHit) => void
  tree: NavigationNode[]
  searchQuery: string
  onSearchQueryChange: (query: string) => void
  navigationScope: NavigationScope
  onNavigationScopeChange: (scope: NavigationScope) => void
  showCompletedTasks: boolean
  onShowCompletedTasksChange: (showCompleted: boolean) => void
  isNavigationLoading: boolean
  navigationError: string
  selectedTaskId: string
  onSelectTask: (taskId: string) => void
  onToggleFolder: (folderId: string) => Promise<void>
  onRenameNode: (nodeId: string, nextTitle: string) => Promise<void>
  onCreateFolder: (title: string, parentId: string | null) => Promise<void>
  onCreateTask: (title: string, parentId: string | null) => Promise<void>
  onCreateChildFolder: (parentId: string, title: string) => Promise<void>
  onCreateChildTask: (parentId: string, title: string) => Promise<void>
  onDeleteNode: (nodeId: string) => Promise<void>
  onMoveNode: (nodeId: string, targetFolderId: string | null) => Promise<void>
  onCopyNode: (nodeId: string, targetFolderId: string | null) => Promise<void>
  onMoveNodeUp: (nodeId: string) => Promise<void>
  onMoveNodeDown: (nodeId: string) => Promise<void>
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

const smartViews: Array<{ value: WorkspaceView; label: string }> = [
  { value: 'today', label: '오늘' },
  { value: 'overdue', label: '기한 초과' },
  { value: 'week', label: '이번 주' },
  { value: 'incomplete', label: '미완료' },
  { value: 'unassigned', label: '미지정' },
  { value: 'favorites', label: '즐겨찾기' },
  { value: 'recent', label: '최근' },
]

function renderHighlightedSnippet(hit: NavigationSearchHit) {
  const ranges = [...hit.highlights]
    .filter((range) => range.start >= 0 && range.end > range.start && range.start < hit.snippet.length)
    .sort((left, right) => left.start - right.start)
  const parts: Array<{ text: string; marked: boolean }> = []
  let cursor = 0
  ranges.forEach((range) => {
    const start = Math.max(cursor, range.start)
    const end = Math.min(hit.snippet.length, range.end)
    if (start > cursor) parts.push({ text: hit.snippet.slice(cursor, start), marked: false })
    if (end > start) parts.push({ text: hit.snippet.slice(start, end), marked: true })
    cursor = Math.max(cursor, end)
  })
  if (cursor < hit.snippet.length) parts.push({ text: hit.snippet.slice(cursor), marked: false })
  return parts.map((part, index) => part.marked
    ? <mark key={`${index}-${part.text}`}>{part.text}</mark>
    : <span key={`${index}-${part.text}`}>{part.text}</span>)
}

function NavigationBar({
  currentUser,
  onOpenAdmin,
  onLogout,
  onCollapse,
  isBriefingActive,
  onOpenBriefing,
  activeSmartView,
  onOpenSmartView,
  isTrashActive,
  onOpenTrash,
  onOpenSearchHit,
  tree,
  searchQuery,
  onSearchQueryChange,
  navigationScope,
  onNavigationScopeChange,
  showCompletedTasks,
  onShowCompletedTasksChange,
  isNavigationLoading,
  navigationError,
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
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [mutationError, setMutationError] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const isSearching = searchQuery.trim().length > 0

  useEffect(() => {
    const dirty = Boolean(
      editingNodeId || childCreateTitle.trim() || newFolderTitle.trim()
      || newTaskTitle.trim() || moveState || copyState,
    )
    setDraftDirty('navigation-editors', dirty, () => {
      setEditingNodeId(null)
      setEditingTitle('')
      setChildCreateState(null)
      setChildCreateTitle('')
      setNewFolderTitle('')
      setNewTaskTitle('')
      setIsCreateOpen(false)
      setMoveState(null)
      setCopyState(null)
    })
    return () => setDraftDirty('navigation-editors', false)
  }, [editingNodeId, childCreateTitle, newFolderTitle, newTaskTitle, moveState, copyState])

  useEffect(() => {
    const handleSearchShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchInputRef.current?.focus()
      }
    }

    window.addEventListener('keydown', handleSearchShortcut)
    return () => window.removeEventListener('keydown', handleSearchShortcut)
  }, [onSearchQueryChange])

  const displayTree = useMemo(
    () => showCompletedTasks
      ? tree
      : tree.filter((node) => node.type === 'folder' || !node.completed),
    [tree, showCompletedTasks],
  )

  const visibleNodes = useMemo(() => {
    const childrenMap = new Map<string | null, NavigationNode[]>()

    displayTree.forEach((node) => {
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
            searchHits: [],
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
            searchHits: [],
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
            searchHits: [],
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
  }, [displayTree, childCreateState, moveState, copyState, isSearching])

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

  const handleRenameSubmit = async () => {
    if (!editingNodeId) return
    const trimmed = editingTitle.trim()
    if (!trimmed) return
    setMutationError('')
    try {
      await onRenameNode(editingNodeId, trimmed)
      setEditingNodeId(null)
      setEditingTitle('')
    } catch (error) {
      console.error('Failed to rename Navigation item:', error)
      setMutationError('이름을 변경하지 못했습니다. 입력한 내용은 보존됩니다.')
    }
  }

  const handleCreateFolderSubmit = async () => {
    const trimmed = newFolderTitle.trim()
    if (!trimmed) return
    setMutationError('')
    try {
      await onCreateFolder(trimmed, newFolderParentId === 'root' ? null : newFolderParentId)
      setNewFolderTitle('')
      setNewFolderParentId('root')
      setIsCreateOpen(false)
    } catch (error) {
      console.error('Failed to create folder:', error)
      setMutationError('폴더를 추가하지 못했습니다. 입력한 내용은 보존됩니다.')
    }
  }

  const handleCreateTaskSubmit = async () => {
    const trimmed = newTaskTitle.trim()
    if (!trimmed) return
    setMutationError('')
    try {
      await onCreateTask(trimmed, newTaskParentId === 'root' ? null : newTaskParentId)
      setNewTaskTitle('')
      setNewTaskParentId('root')
      setIsCreateOpen(false)
    } catch (error) {
      console.error('Failed to create Task:', error)
      setMutationError('Task를 추가하지 못했습니다. 입력한 내용은 보존됩니다.')
    }
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

  const handleChildCreateSubmit = async () => {
    if (!childCreateState) return
    const trimmed = childCreateTitle.trim()
    if (!trimmed) return
    setMutationError('')
    try {
      if (childCreateState.kind === 'folder') {
        await onCreateChildFolder(childCreateState.parentId, trimmed)
      } else {
        await onCreateChildTask(childCreateState.parentId, trimmed)
      }
      setChildCreateState(null)
      setChildCreateTitle('')
    } catch (error) {
      console.error('Failed to create child Navigation item:', error)
      setMutationError('하위 항목을 추가하지 못했습니다. 입력한 내용은 보존됩니다.')
    }
  }

  const handleOpenDelete = () => {
    if (!menuState) {
      return
    }

    setDeleteError('')
    setDeleteTargetId(menuState.nodeId)
    setMenuState(null)
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget || isDeleting) return

    setIsDeleting(true)
    setDeleteError('')
    try {
      await onDeleteNode(deleteTarget.id)
      setDeleteTargetId(null)
    } catch (error) {
      console.error('Failed to delete Navigation item:', error)
      setDeleteError('삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleOpenMove = () => {
    if (!menuState) {
      return
    }

    setMoveState({ nodeId: menuState.nodeId })
    setMoveTargetFolderId('')
    setMenuState(null)
  }

  const handleMoveSubmit = async () => {
    if (!moveState || !moveTargetFolderId) return
    setMutationError('')
    try {
      await onMoveNode(moveState.nodeId, moveTargetFolderId === 'root' ? null : moveTargetFolderId)
      setMoveState(null)
      setMoveTargetFolderId('')
    } catch (error) {
      console.error('Failed to move Navigation item:', error)
      setMutationError('항목을 이동하지 못했습니다. 선택한 위치는 보존됩니다.')
    }
  }

  const handleOpenCopy = () => {
    if (!menuState) {
      return
    }

    setCopyState({ nodeId: menuState.nodeId })
    setCopyTargetFolderId('')
    setMenuState(null)
  }

  const handleCopySubmit = async () => {
    if (!copyState || !copyTargetFolderId) return
    setMutationError('')
    try {
      await onCopyNode(copyState.nodeId, copyTargetFolderId === 'root' ? null : copyTargetFolderId)
      setCopyState(null)
      setCopyTargetFolderId('')
    } catch (error) {
      console.error('Failed to copy Navigation item:', error)
      setMutationError('항목을 복사하지 못했습니다. 선택한 위치는 보존됩니다.')
    }
  }

  const handleMoveUp = async () => {
    if (!menuState) return
    setMutationError('')
    try {
      await onMoveNodeUp(menuState.nodeId)
      setMenuState(null)
    } catch (error) {
      console.error('Failed to reorder Navigation item:', error)
      setMutationError('항목 순서를 변경하지 못했습니다.')
    }
  }

  const handleMoveDown = async () => {
    if (!menuState) return
    setMutationError('')
    try {
      await onMoveNodeDown(menuState.nodeId)
      setMenuState(null)
    } catch (error) {
      console.error('Failed to reorder Navigation item:', error)
      setMutationError('항목 순서를 변경하지 못했습니다.')
    }
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
            <div className="navigation-subtitle">업무관리 공간 · Version 1.0.0</div>
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

      <div className="navigation-smart-views" aria-label="통합 업무 보기">
        {smartViews.map((view) => (
          <button className={activeSmartView === view.value ? 'is-active' : ''} type="button" key={view.value} onClick={() => onOpenSmartView(view.value)}>{view.label}</button>
        ))}
        <button className={isTrashActive ? 'is-active is-trash' : 'is-trash'} type="button" onClick={onOpenTrash}>휴지통</button>
      </div>

      <div className="navigation-search-block">
        <div className="navigation-search">
          <span className="navigation-search-icon">⌕</span>
          <input
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            placeholder="전체 업무 내용 검색"
            aria-label="전체 업무 내용 검색"
            onChange={(event) => onSearchQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                onSearchQueryChange('')
                event.currentTarget.blur()
              }
            }}
          />
          <kbd>Ctrl K</kbd>
        </div>
        <div className="navigation-scope-filter" aria-label="업무 표시 범위">
          <button
            className={navigationScope === 'all' ? 'is-active' : ''}
            type="button"
            aria-pressed={navigationScope === 'all'}
            onClick={() => onNavigationScopeChange('all')}
          >
            전체 업무
          </button>
          <button
            className={navigationScope === 'mine' ? 'is-active' : ''}
            type="button"
            aria-pressed={navigationScope === 'mine'}
            onClick={() => onNavigationScopeChange('mine')}
          >
            내 Task
          </button>
        </div>
        <button
          className={`completed-visibility-toggle is-navigation ${showCompletedTasks ? 'is-active' : ''}`}
          type="button"
          aria-pressed={showCompletedTasks}
          onClick={() => onShowCompletedTasksChange(!showCompletedTasks)}
        >
          <span aria-hidden="true">{showCompletedTasks ? '✓' : '○'}</span>
          완료 Task 표시
        </button>
        {(isNavigationLoading || navigationError) && (
          <div
            className={`navigation-search-status ${navigationError ? 'is-error' : ''}`}
            role="status"
          >
            {navigationError || '업무 내용을 검색하고 있습니다...'}
          </div>
        )}
      </div>

      {mutationError && <div className="navigation-search-status is-error" role="alert">{mutationError}</div>}

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
        <span>
          {isSearching
            ? '검색 결과'
            : navigationScope === 'mine'
              ? '내 Task'
              : '프로젝트'}
        </span>
        <span>{displayTree.filter((node) => node.type === 'task').length}</span>
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
                `navigation-depth-${Math.min(node.depth, 4)}`,
                draggedNodeId === node.id ? 'is-dragging' : '',
                dropTargetState?.nodeId === node.id
                  ? `drop-${dropTargetState.position}`
                  : '',
              ]
                .filter(Boolean)
                .join(' ')}
              data-depth={Math.min(node.depth, 4)}
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
                      `tree-depth-${Math.min(node.depth, 4)}`,
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
                        {isSearching && Boolean(node.matchKinds?.length) && (
                          <span className="tree-node-match-kind">
                            {node.matchKinds?.join(' · ')}
                          </span>
                        )}
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
                        {isSearching && Boolean(node.matchKinds?.length) && (
                          <span className="tree-node-match-kind">
                            {node.matchKinds?.join(' · ')}
                          </span>
                        )}
                        {node.completed && (
                          <span className="tree-node-completed-badge">완료</span>
                        )}
                      </>
                    )}
                  </button>

                  {isSearching && node.searchHits.length > 0 && (
                    <div className="navigation-search-hits">
                      {node.searchHits.slice(0, 3).map((hit) => (
                        <button type="button" key={hit.resultId} onClick={(event) => { event.stopPropagation(); onOpenSearchHit(hit) }}>
                          <small>{hit.matchKind}</small>
                          <span>{renderHighlightedSnippet(hit)}</span>
                        </button>
                      ))}
                    </div>
                  )}

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
        {!isNavigationLoading && visibleNodes.length === 0 && (
          <div className="navigation-search-empty" role="status">
            {isSearching
              ? '검색 결과가 없습니다.'
              : navigationScope === 'mine'
                ? '나에게 할당된 Task가 없습니다.'
                : '표시할 업무가 없습니다.'}
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
              <strong>정말 삭제하시겠습니까?</strong>
              <br />
              “{deleteTarget.title}” 항목을 삭제합니다.
              {deleteTarget.type === 'folder' && (
                <>
                  <br />
                  폴더 안의 모든 하위 폴더와 Task도 함께 삭제됩니다.
                </>
              )}
              {deleteError && (
                <div className="navigation-delete-error" role="alert">
                  {deleteError}
                </div>
              )}
            </div>
            <div className="confirm-modal-actions">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => void handleConfirmDelete()}
              >
                {isDeleting ? '삭제 중...' : '삭제'}
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => {
                  setDeleteError('')
                  setDeleteTargetId(null)
                }}
              >
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
