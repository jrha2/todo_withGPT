import { useMemo, useState } from 'react'
import { mockNavigationTree } from '../../../data/mockTaskDetail'

type NavigationNode = {
  id: string
  type: 'folder' | 'task'
  title: string
  level: number
  expanded?: boolean
  selected?: boolean
}

type NavigationBarProps = {
  selectedTaskId: string
  onSelectTask: (taskId: string) => void
}

const initialTree = mockNavigationTree as NavigationNode[]

function NavigationBar({ selectedTaskId, onSelectTask }: NavigationBarProps) {
  const [tree, setTree] = useState<NavigationNode[]>(initialTree)

  const visibleNodes = useMemo(() => {
    const expandedByLevel: Record<number, boolean> = {}

    return tree.filter((node) => {
      if (node.level === 0) {
        if (node.type === 'folder') {
          expandedByLevel[node.level] = !!node.expanded
        }
        return true
      }

      for (let parentLevel = node.level - 1; parentLevel >= 0; parentLevel -= 1) {
        if (expandedByLevel[parentLevel] === false) {
          return false
        }
      }

      if (node.type === 'folder') {
        expandedByLevel[node.level] = !!node.expanded
      }

      return true
    })
  }, [tree])

  const handleFolderClick = (clickedId: string) => {
    setTree((prev) =>
      prev.map((node) =>
        node.id === clickedId && node.type === 'folder'
          ? { ...node, expanded: !node.expanded }
          : node,
      ),
    )
  }

  return (
    <aside className="navigation-bar">
      <div className="navigation-header">
        <div className="navigation-title">Navigation Bar</div>
        <button className="navigation-add-button" type="button">
          +
        </button>
      </div>

      <div className="navigation-search">
        <input type="text" placeholder="폴더 또는 Task 검색" />
      </div>

      <div className="navigation-tree">
        {visibleNodes.map((node) => (
          <button
            className={[
              'tree-node',
              node.type,
              `child-${node.level}`,
              selectedTaskId === node.id ? 'is-selected' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            key={node.id}
            onClick={() =>
              node.type === 'folder'
                ? handleFolderClick(node.id)
                : onSelectTask(node.id)
            }
            type="button"
          >
            {node.type === 'folder'
              ? `${node.expanded ? '▼' : '▶'} ${node.title}`
              : `Task: ${node.title}`}
          </button>
        ))}
      </div>
    </aside>
  )
}

export default NavigationBar
