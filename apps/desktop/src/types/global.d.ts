export {}

declare global {
  interface Window {
    api: {
      navigation: {
        getTree: () => Promise<unknown>
        createFolder: (title: string, parentId: string | null) => Promise<unknown>
        createTask: (title: string, parentId: string | null) => Promise<unknown>
      }
      task: {
        getDetail: (taskId: string) => Promise<unknown>
      }
    }
  }
}
