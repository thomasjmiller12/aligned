"use client";

import { useCallback, useSyncExternalStore } from "react";
import { getMuted, setMuted } from "@/lib/sounds";

const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function notify() {
  listeners.forEach((cb) => cb());
}

export function useSound() {
  const isMuted = useSyncExternalStore(
    subscribe,
    () => getMuted(),
    () => true, // SSR: treat as muted
  );

  const toggleMute = useCallback(() => {
    setMuted(!getMuted());
    notify();
  }, []);

  return { isMuted, toggleMute };
}
