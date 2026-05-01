"use client";

import { useEffect, useRef } from "react";

const ACTIVITY_EVENTS: (keyof DocumentEventMap)[] = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];
const THROTTLE_MS = 5000;

export default function IdleLogoutGuard() {
  const lastActivityRef = useRef<number>(Date.now());
  const lastResetRef = useRef<number>(0);
  const timeoutMsRef = useRef<number>(0);
  const checkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loggedOutRef = useRef<boolean>(false);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/auth/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const seconds = Number(data.idleTimeoutSeconds);
        if (!Number.isFinite(seconds) || seconds <= 0) return;
        timeoutMsRef.current = seconds * 1000;
        startWatching();
      });

    function logout() {
      if (loggedOutRef.current) return;
      loggedOutRef.current = true;
      fetch("/api/logout", { method: "POST" }).finally(() => {
        window.location.href = "/login?reason=idle";
      });
    }

    function onActivity() {
      const now = Date.now();
      lastActivityRef.current = now;
      // Throttle to avoid resetting on every mousemove
      if (now - lastResetRef.current > THROTTLE_MS) {
        lastResetRef.current = now;
      }
    }

    function startWatching() {
      ACTIVITY_EVENTS.forEach((ev) => document.addEventListener(ev, onActivity, { passive: true }));

      checkTimerRef.current = setInterval(() => {
        if (timeoutMsRef.current <= 0) return;
        const idle = Date.now() - lastActivityRef.current;
        if (idle >= timeoutMsRef.current) {
          logout();
        }
      }, 5000);
    }

    return () => {
      cancelled = true;
      ACTIVITY_EVENTS.forEach((ev) => document.removeEventListener(ev, onActivity));
      if (checkTimerRef.current) clearInterval(checkTimerRef.current);
    };
  }, []);

  return null;
}
