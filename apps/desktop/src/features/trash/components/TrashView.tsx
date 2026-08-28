import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getTrashNodes,
  permanentlyDeleteNavigationNode,
  restoreNavigationNode,
  type TrashNodeRecord,
} from '../../../services/api/navigationApi'

type TrashViewProps = {
  revision: number
  remoteRefreshRevision: number | null
  onRemoteRefreshComplete: (revision: number, succeeded: boolean) => void
  onTreeChanged: () => Promise<void>
}

function TrashView({ revision, remoteRefreshRevision, onRemoteRefreshComplete, onTreeChanged }: TrashViewProps) {
  const [nodes, setNodes] = useState<TrashNodeRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<TrashNodeRecord | null>(null)
  const requestIdRef = useRef(0)

  const loadTrash = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setIsLoading(true)
    setError('')
    try {
      const items = await getTrashNodes()
      if (requestId !== requestIdRef.current) return
      setNodes(items)
      if (remoteRefreshRevision) onRemoteRefreshComplete(remoteRefreshRevision, true)
    }
    catch (loadError) {
      if (requestId !== requestIdRef.current) return
      console.error('Failed to load trash:', loadError)
      setError('휴지통을 불러오지 못했습니다.')
      if (remoteRefreshRevision) onRemoteRefreshComplete(remoteRefreshRevision, false)
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false)
    }
  }, [remoteRefreshRevision, onRemoteRefreshComplete])

  useEffect(() => {
    // Loading intentionally begins from this synchronization effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTrash()
  }, [loadTrash, revision])

  const restore = async (node: TrashNodeRecord) => {
    setError('')
    try {
      await restoreNavigationNode(node.id)
      await Promise.all([loadTrash(), onTreeChanged()])
    } catch (restoreError) {
      console.error('Failed to restore trash node:', restoreError)
      setError('항목을 복원하지 못했습니다.')
    }
  }

  const permanentlyDelete = async () => {
    if (!deleteTarget) return
    setError('')
    try {
      await permanentlyDeleteNavigationNode(deleteTarget.id)
      setDeleteTarget(null)
      await Promise.all([loadTrash(), onTreeChanged()])
    } catch (deleteError) {
      console.error('Failed to permanently delete trash node:', deleteError)
      setError('항목을 영구 삭제하지 못했습니다.')
    }
  }

  return (
    <section className="trash-view content-card">
      <div className="workspace-view-header"><div><span className="section-eyebrow">TRASH</span><h1>휴지통</h1></div><button type="button" onClick={() => void loadTrash()}>새로고침</button></div>
      <p className="trash-help">삭제한 폴더와 Task는 묶음 단위로 복원하거나 영구 삭제할 수 있습니다.</p>
      {error && <div className="workspace-error" role="alert">{error}</div>}
      <div className="trash-list">
        {nodes.map((node) => <article className="trash-item" key={node.id}><div><strong>{node.type === 'folder' ? '폴더' : 'Task'} · {node.title}</strong><span>{node.deletedAt} · 포함 항목 {node.count}개</span></div><div><button type="button" onClick={() => void restore(node)}>복원</button><button className="danger-button" type="button" onClick={() => setDeleteTarget(node)}>영구 삭제</button></div></article>)}
        {!isLoading && nodes.length === 0 && <div className="workspace-empty">휴지통이 비어 있습니다.</div>}
        {isLoading && <div className="workspace-empty">휴지통을 불러오고 있습니다...</div>}
      </div>
      {deleteTarget && <div className="modal-backdrop"><div className="confirm-modal"><div className="confirm-modal-title">영구 삭제 확인</div><div className="confirm-modal-body">“{deleteTarget.title}” 및 함께 삭제된 {deleteTarget.count}개 항목을 영구 삭제하시겠습니까?<br />이 작업은 되돌릴 수 없습니다.</div><div className="confirm-modal-actions"><button className="danger-button" type="button" onClick={() => void permanentlyDelete()}>영구 삭제</button><button type="button" onClick={() => setDeleteTarget(null)}>취소</button></div></div></div>}
    </section>
  )
}

export default TrashView
