"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SetStateAction = Set<number> | ((prev: Set<number>) => Set<number>);

/**
 * Persists an expanded-folder Set<number> in localStorage so the open/closed
 * state of a folder tree survives reloads and navigation.
 *
 * Drop-in replacement for `useState<Set<number>>(new Set())`: returns the same
 * `[value, setValue]` tuple. The state is keyed by `storageKey`; pass a key that
 * is stable per feature (and optionally per context) to avoid collisions.
 */
export function usePersistedExpanded(
  storageKey: string,
): [Set<number>, (action: SetStateAction) => void] {
  const [expanded, setExpandedState] = useState<Set<number>>(new Set());
  // Guards against writing back the empty initial state before we have loaded
  // the persisted value on mount.
  const hydrated = useRef(false);

  // Load persisted state on mount / when the key changes.
  useEffect(() => {
    hydrated.current = false;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const ids = JSON.parse(raw);
        if (Array.isArray(ids)) {
          setExpandedState(new Set(ids.filter((n) => typeof n === "number")));
        } else {
          setExpandedState(new Set());
        }
      } else {
        setExpandedState(new Set());
      }
    } catch {
      setExpandedState(new Set());
    }
    hydrated.current = true;
  }, [storageKey]);

  const setExpanded = useCallback(
    (action: SetStateAction) => {
      setExpandedState((prev) => {
        const next = typeof action === "function" ? action(prev) : action;
        if (hydrated.current) {
          try {
            localStorage.setItem(storageKey, JSON.stringify([...next]));
          } catch {
            /* ignore quota / unavailable storage */
          }
        }
        return next;
      });
    },
    [storageKey],
  );

  return [expanded, setExpanded];
}
