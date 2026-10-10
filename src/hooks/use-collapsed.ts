import * as React from "react"

// Which slips are collapsed, kept in localStorage so the choice survives reloads,
// day changes and the board's polling.
const KEY = "parlay-board:collapsed-slips"
const listeners = new Set<() => void>()

function read(): string {
  try {
    return window.localStorage.getItem(KEY) ?? "[]"
  } catch {
    return "[]"
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  window.addEventListener("storage", onChange)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener("storage", onChange)
  }
}

function parse(raw: string): string[] {
  try {
    const value: unknown = JSON.parse(raw)
    return Array.isArray(value) ? value.filter((id) => typeof id === "string") : []
  } catch {
    return []
  }
}

export function useCollapsed(id: string): [boolean, () => void] {
  const raw = React.useSyncExternalStore(subscribe, read, () => "[]")
  const collapsed = parse(raw).includes(id)

  const toggle = React.useCallback(() => {
    const ids = new Set(parse(read()))
    if (!ids.delete(id)) ids.add(id)
    try {
      window.localStorage.setItem(KEY, JSON.stringify([...ids]))
    } catch {
      // Storage can be unavailable (private browsing); the toggle just won't persist.
    }
    listeners.forEach((notify) => notify())
  }, [id])

  return [collapsed, toggle]
}
