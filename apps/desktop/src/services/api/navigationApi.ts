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
