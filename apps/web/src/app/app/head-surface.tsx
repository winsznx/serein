"use client";

import { useEffect } from "react";

/** Sets the body surface attribute so the dark palette applies to the page chrome too. */
export function DarkSurface() {
  useEffect(() => {
    document.body.dataset.surface = "dark";
    return () => {
      delete document.body.dataset.surface;
    };
  }, []);
  return null;
}
