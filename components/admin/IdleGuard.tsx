"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Warns before an idle session expires, and clears the screen when it does.
 *
 * The actual expiry is enforced on the server — this only makes it visible, so
 * she gets a warning rather than losing a half-written treatment note without
 * explanation. Anyone disabling JavaScript gets signed out just the same.
 */
export default function IdleGuard({
  idleMinutes,
  warnSeconds = 60,
}: {
  idleMinutes: number;
  warnSeconds?: number;
}) {
  const router = useRouter();
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const deadline = useRef(Date.now() + idleMinutes * 60_000);

  const resetTimer = useCallback(() => {
    deadline.current = Date.now() + idleMinutes * 60_000;
    setSecondsLeft(null);
  }, [idleMinutes]);

  useEffect(() => {
    const events = ["mousedown", "keydown", "touchstart", "scroll"] as const;
    for (const event of events) {
      window.addEventListener(event, resetTimer, { passive: true });
    }

    const tick = setInterval(() => {
      const remaining = Math.round((deadline.current - Date.now()) / 1000);

      if (remaining <= 0) {
        // The server has already dropped this session; navigating just makes
        // the browser catch up and clears the records off the screen.
        window.location.href = "/admin/login?idle=1";
        return;
      }

      setSecondsLeft(remaining <= warnSeconds ? remaining : null);
    }, 1000);

    return () => {
      for (const event of events) window.removeEventListener(event, resetTimer);
      clearInterval(tick);
    };
  }, [resetTimer, warnSeconds]);

  if (secondsLeft === null) return null;

  return (
    <div className="idle-warning" role="alert">
      <p>
        <strong>Still there?</strong> You&rsquo;ll be signed out in{" "}
        {secondsLeft} second{secondsLeft === 1 ? "" : "s"} to keep client
        records private.
      </p>
      <button
        className="btn btn-primary btn-small"
        type="button"
        onClick={() => {
          resetTimer();
          // Touch the server so its idle clock resets too, not just this one.
          router.refresh();
        }}
      >
        Keep me signed in
      </button>
    </div>
  );
}
