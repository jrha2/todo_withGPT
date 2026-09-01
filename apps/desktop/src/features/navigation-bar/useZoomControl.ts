import { useCallback, useEffect, useState } from 'react'

// Renderer-side zoom control. The actual scaling is applied through the
// Electron webFrame (exposed via preload as window.api.zoom); the chosen factor
// is persisted per-machine in localStorage so it survives restarts.

const ZOOM_STORAGE_KEY = 'todo:preferences:zoom-factor'
const ZOOM_STEP = 0.1
const DEFAULT_MIN = 0.7
const DEFAULT_MAX = 2.0

function roundZoom(factor: number) {
  return Math.round(factor * 100) / 100
}

function getBounds() {
  const min = window.api?.zoom?.min ?? DEFAULT_MIN
  const max = window.api?.zoom?.max ?? DEFAULT_MAX
  return { min, max }
}

function clampZoom(factor: number) {
  const { min, max } = getBounds()
  if (!Number.isFinite(factor)) return 1
  return Math.min(max, Math.max(min, roundZoom(factor)))
}

function readStoredZoom() {
  const stored = Number(localStorage.getItem(ZOOM_STORAGE_KEY))
  return stored ? clampZoom(stored) : 1
}

export function useZoomControl() {
  const [zoomFactor, setZoomFactorState] = useState<number>(() => readStoredZoom())

  const applyZoom = useCallback((factor: number) => {
    const clamped = clampZoom(factor)
    // Prefer the value the main process actually applied, when available.
    const applied = window.api?.zoom?.set
      ? clampZoom(window.api.zoom.set(clamped))
      : clamped
    localStorage.setItem(ZOOM_STORAGE_KEY, String(applied))
    setZoomFactorState(applied)
    return applied
  }, [])

  // Apply the persisted zoom once on mount so the window matches the saved
  // preference even after a restart.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    applyZoom(readStoredZoom())
  }, [applyZoom])

  const zoomIn = useCallback(() => applyZoom(zoomFactor + ZOOM_STEP), [applyZoom, zoomFactor])
  const zoomOut = useCallback(() => applyZoom(zoomFactor - ZOOM_STEP), [applyZoom, zoomFactor])
  const resetZoom = useCallback(() => applyZoom(1), [applyZoom])

  // Keyboard (Ctrl/Cmd +, -, 0) and Ctrl/Cmd + wheel shortcuts, matching the
  // browser-standard zoom gestures users expect.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      if (event.key === '+' || event.key === '=') {
        event.preventDefault()
        zoomIn()
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault()
        zoomOut()
      } else if (event.key === '0') {
        event.preventDefault()
        resetZoom()
      }
    }

    const handleWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      event.preventDefault()
      if (event.deltaY < 0) zoomIn()
      else if (event.deltaY > 0) zoomOut()
    }

    window.addEventListener('keydown', handleKeyDown)
    // passive:false is required so preventDefault suppresses the native
    // ctrl+wheel page zoom.
    window.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('wheel', handleWheel)
    }
  }, [zoomIn, zoomOut, resetZoom])

  const { min, max } = getBounds()

  return {
    zoomFactor,
    zoomPercent: Math.round(zoomFactor * 100),
    canZoomIn: zoomFactor < max,
    canZoomOut: zoomFactor > min,
    zoomIn,
    zoomOut,
    resetZoom,
  }
}
