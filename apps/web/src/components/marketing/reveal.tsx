"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { useHasMounted, usePrefersReducedMotion } from "./use-client-only";

/**
 * The landing's one motion primitive.
 *
 * Everything that "appears on scroll" on the marketing page goes through this. An IntersectionObserver
 * flips a boolean once, and the boolean drives an opacity/transform transition — no animation library,
 * no per-frame JS. `prefers-reduced-motion` disables the transform and shows content immediately, and
 * a user with JavaScript disabled or an observer that never fires still sees the content: the element
 * starts visible in markup and is only ever hidden by an inline style set after mount.
 */

const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

export function Reveal({
  children,
  delay = 0,
  y = 24,
  duration = 700,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [intersected, setIntersected] = useState(false);
  const hasMounted = useHasMounted();
  const reduceMotion = usePrefersReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node || reduceMotion) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setIntersected(true);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -60px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [reduceMotion]);

  const shown = reduceMotion || intersected;

  // Nothing is hidden until the client confirms it can actually run the reveal — a server render,
  // or a browser that never fires the observer, shows the content rather than stranding it at
  // opacity 0.
  const style: CSSProperties = hasMounted
    ? {
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : `translateY(${y}px)`,
        transition: `opacity ${duration}ms ${EASE} ${delay}ms, transform ${duration}ms ${EASE} ${delay}ms`,
      }
    : {};

  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
}

/**
 * A staggered group. Each child reveals `step`ms after the previous one, capped at six children —
 * past that the last item would still be settling in while a reader has already moved on.
 */
export function Stagger({
  children,
  step = 90,
  className,
}: {
  children: ReactNode[];
  step?: number;
  className?: string;
}) {
  const items = children.slice(0, 6);
  return (
    <div className={className}>
      {items.map((child, index) => (
        <Reveal key={index} delay={index * step}>
          {child}
        </Reveal>
      ))}
    </div>
  );
}
