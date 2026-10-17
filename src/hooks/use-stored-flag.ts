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

/** A setting kept in localStorage, so it survives reloads. Uses the fallback on the server, or when the stored value fails `isValid`. */
export function useStoredValue<T extends string>(
  key: string,
  fallback: T,
  isValid: (value: string) => value is T
): [T, (value: T) => void] {
  const read = React.useCallback(() => {
    try {
      const stored = window.localStorage.getItem(key)
      return stored !== null && isValid(stored) ? stored : fallback
    } catch {
      return fallback
    }
  }, [key, fallback, isValid])

  const value = React.useSyncExternalStore(subscribe, read, () => fallback)

  const set = React.useCallback(
    (next: T) => {
      try {
        window.localStorage.setItem(key, next)
      } catch {
        // Storage can be unavailable (private browsing); the setting just won't persist.
      }
      listeners.forEach((notify) => notify())
    },
    [key]
  )

  return [value, set]
}

const isFlag = (value: string): value is "true" | "false" => value === "true" || value === "false"

/** A true/false setting kept in localStorage, so it survives reloads. Uses the fallback on the server. */
export function useStoredFlag(key: string, fallback: boolean): [boolean, (value: boolean) => void] {
  const [value, set] = useStoredValue(key, fallback ? "true" : "false", isFlag)
  const setFlag = React.useCallback((next: boolean) => set(next ? "true" : "false"), [set])
  return [value === "true", setFlag]
}
