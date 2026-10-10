import * as React from "react"

const listeners = new Set<() => void>()

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  window.addEventListener("storage", onChange)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener("storage", onChange)
  }
}

/** A true/false setting kept in localStorage, so it survives reloads. Uses the fallback on the server. */
export function useStoredFlag(key: string, fallback: boolean): [boolean, (value: boolean) => void] {
  const read = React.useCallback(() => {
    try {
      const stored = window.localStorage.getItem(key)
      return stored === null ? fallback : stored === "true"
    } catch {
      return fallback
    }
  }, [key, fallback])

  const value = React.useSyncExternalStore(subscribe, read, () => fallback)

  const set = React.useCallback(
    (next: boolean) => {
      try {
        window.localStorage.setItem(key, String(next))
      } catch {
        // Storage can be unavailable (private browsing); the setting just won't persist.
      }
      listeners.forEach((notify) => notify())
    },
    [key]
  )

  return [value, set]
}
