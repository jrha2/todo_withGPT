export async function getNavigationTree() {
  if (!window.api?.navigation?.getTree) {
    throw new Error('navigation API is not available')
  }

  return window.api.navigation.getTree()
}

export async function createFolder(title: string, parentId: string | null) {
  if (!window.api?.navigation?.createFolder) {
    throw new Error('navigation createFolder API is not available')
  }

  return window.api.navigation.createFolder(title, parentId)
}

export async function createTask(title: string, parentId: string | null) {
  if (!window.api?.navigation?.createTask) {
    throw new Error('navigation createTask API is not available')
  }

  return window.api.navigation.createTask(title, parentId)
}

export async function renameNavigationNode(nodeId: string, title: string) {
  if (!window.api?.navigation?.renameNode) {
    throw new Error('navigation renameNode API is not available')
  }

  return window.api.navigation.renameNode(nodeId, title)
}

export async function deleteNavigationNode(nodeId: string) {
  if (!window.api?.navigation?.deleteNode) {
    throw new Error('navigation deleteNode API is not available')
  }

  return window.api.navigation.deleteNode(nodeId)
}

export async function moveNavigationNode(
  nodeId: string,
  targetFolderId: string | null,
) {
  if (!window.api?.navigation?.moveNode) {
    throw new Error('navigation moveNode API is not available')
  }

  return window.api.navigation.moveNode(nodeId, targetFolderId)
}

export async function copyNavigationNode(
  nodeId: string,
  targetFolderId: string | null,
) {
  if (!window.api?.navigation?.copyNode) {
    throw new Error('navigation copyNode API is not available')
  }

  return window.api.navigation.copyNode(nodeId, targetFolderId)
}

export async function reorderNavigationNode(
  nodeId: string,
  direction: 'up' | 'down',
) {
  if (!window.api?.navigation?.reorderNode) {
    throw new Error('navigation reorderNode API is not available')
  }

  return window.api.navigation.reorderNode(nodeId, direction)
}

export async function dropNavigationNode(
  nodeId: string,
  targetNodeId: string,
  position: 'before' | 'after' | 'inside',
) {
  if (!window.api?.navigation?.dropNode) {
    throw new Error('navigation dropNode API is not available')
  }

  return window.api.navigation.dropNode(nodeId, targetNodeId, position)
}

export async function setNavigationNodeExpanded(
  nodeId: string,
  expanded: boolean,
) {
  if (!window.api?.navigation?.setExpanded) {
    throw new Error('navigation setExpanded API is not available')
  }

  return window.api.navigation.setExpanded(nodeId, expanded)
}
