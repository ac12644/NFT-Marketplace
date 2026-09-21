'use client';

import { useEffect, useState } from 'react';

function format(secondsLeft: number) {
  if (secondsLeft <= 0) return 'Ended';

  const d = Math.floor(secondsLeft / 86400);
  const h = Math.floor((secondsLeft % 86400) / 3600);
  const m = Math.floor((secondsLeft % 3600) / 60);
  const s = secondsLeft % 60;

  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

export function Countdown({ to }: { to: bigint }) {
  // `null` until mounted: the server and the client never share a clock, so
  // rendering a time on the server guarantees a hydration mismatch.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Math.floor(Date.now() / 1000));
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  if (now === null) {
    return <span className="inline-block w-14 align-baseline" aria-hidden />;
  }

  const left = Number(to) - now;
  const urgent = left > 0 && left < 600;

  return (
    <time
      dateTime={new Date(Number(to) * 1000).toISOString()}
      className={urgent ? 'font-medium text-destructive' : undefined}
    >
      {format(left)}
    </time>
  );
}

/** Whether a deadline has passed, without tripping hydration. */
export function useHasEnded(endTime: bigint) {
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    const check = () => setEnded(Number(endTime) * 1000 <= Date.now());
    check();
    const timer = setInterval(check, 1000);
    return () => clearInterval(timer);
  }, [endTime]);

  return ended;
}
