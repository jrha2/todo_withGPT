type DirtyDiscard = () => void

type DirtyEntry = {
  discard?: DirtyDiscard
}

const dirtyEntries = new Map<string, DirtyEntry>()
const listeners = new Set<(dirty: boolean) => void>()

function notify() {
  const dirty = dirtyEntries.size > 0
  listeners.forEach((listener) => listener(dirty))
}

export function setDraftDirty(
  key: string,
  dirty: boolean,
  discard?: DirtyDiscard,
) {
  if (dirty) dirtyEntries.set(key, { discard })
  else dirtyEntries.delete(key)
  notify()
}

export function hasDirtyDrafts() {
  return dirtyEntries.size > 0
}

export function subscribeToDirtyDrafts(listener: (dirty: boolean) => void) {
  listeners.add(listener)
  listener(hasDirtyDrafts())
  return () => listeners.delete(listener)
}

export function confirmDiscardDirtyDrafts(
  message = '저장하지 않은 변경사항이 있습니다. 변경사항을 버리고 이동하시겠습니까?',
) {
  if (!hasDirtyDrafts()) return true
  if (!window.confirm(message)) return false

  const entries = [...dirtyEntries.values()]
  dirtyEntries.clear()
  entries.forEach((entry) => entry.discard?.())
  notify()
  return true
}
