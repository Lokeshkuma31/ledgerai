import * as React from "react"

/**
 * Tracks the user's prefers-reduced-motion setting. Every new animated
 * primitive (AnimatedCounter, StatusDot) must consult this and snap to its
 * final/static state rather than merely slowing down — no component in
 * this app handled reduced-motion before this hook existed.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false)

  React.useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)")
    const onChange = () => setReduced(mql.matches)
    onChange()
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return reduced
}
