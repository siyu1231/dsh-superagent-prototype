/** Lets a sidebar Session row action ask the panel to switch to one of its pages. */
import { useEffect } from 'react'

/** Pages a row action may ask for; only pages that explain the Sessions themselves. */
export type AskedPage = 'sessions'
const listeners = new Set<(page: AskedPage) => void>()
let pending: AskedPage | undefined
/** Ask the open panel to show `page`; a request made before the panel ever mounted is kept for its first render. */
export function askPage(page: AskedPage): void {
  if (!listeners.size) { pending = page; return }
  for (const listener of [...listeners]) listener(page)
}
export function useAskedPage(show: (page: AskedPage) => void): void {
  useEffect(() => {
    listeners.add(show)
    if (pending) { const page = pending; pending = undefined; show(page) }
    return () => { listeners.delete(show) }
  }, [show])
}
