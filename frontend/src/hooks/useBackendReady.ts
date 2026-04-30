"use client";

import { useEffect, useRef, useState } from "react";

export type BackendReadyState =
  | { status: "checking" }
  | { status: "ready" }
  | { status: "not_ready"; reason?: string };

const POLL_INTERVAL_NOT_READY_MS = 3000;
const POLL_INTERVAL_READY_MS = 30_000;

export function useBackendReady(): BackendReadyState {
  const [state, setState] = useState<BackendReadyState>({ status: "checking" });
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const check = async () => {
      let next: BackendReadyState;
      try {
        const res = await fetch("/api/public/readyz", { cache: "no-store" });
        if (res.ok) {
          next = { status: "ready" };
        } else {
          let reason: string | undefined;
          try {
            const data = await res.json();
            reason = data?.reason;
          } catch {}
          next = { status: "not_ready", reason };
        }
      } catch {
        next = { status: "not_ready", reason: "network" };
      }

      if (!aliveRef.current) return;
      setState(next);

      const delay =
        next.status === "ready" ? POLL_INTERVAL_READY_MS : POLL_INTERVAL_NOT_READY_MS;
      timer = setTimeout(check, delay);
    };

    check();

    return () => {
      aliveRef.current = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return state;
}
