export type BriefingChange = {
  id: string
  actionType: string
  entityType: string
  entityId: string | null
  taskId: string | null
  actorName: string
  title: string
  summary: string
  createdAt: string
}

export type BriefingDueItem = {
  id: string
  taskId: string
  itemType: 'task' | 'subtask'
  title: string
  projectTitle: string
  dueDate: string
  completed: boolean
  assignee: string
}

export type BriefingData = {
  generatedAt: string
  days: number
  changes: BriefingChange[]
  dueItems: BriefingDueItem[]
}

export async function getBriefingData(days = 7) {
  if (!window.api?.briefing?.getData) {
    throw new Error('briefing API is not available')
  }

  return window.api.briefing.getData(days) as Promise<BriefingData>
}
