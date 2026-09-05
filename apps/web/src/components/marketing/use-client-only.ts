import { useSyncExternalStore } from "react";

const emptySubscribe = (): (() => void) => () => {};

/**
 * True once mounted on the client, false during SSR and the first client render.
 *
 * `useSyncExternalStore` is the primitive React intends for reading a value that legitimately
 * differs between server and client — it is exempt from the "no setState synchronously in an
 * effect" rule because it is not an effect calling setState at all; the alternative idiom
 * (`useState(false)` + `useEffect(() => setState(true), [])`) is what that rule now flags.
 */
export function useHasMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

/** Live value of `prefers-reduced-motion: reduce`, false on the server and while unmounted. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia("(prefers-reduced-motion: reduce)");
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}
