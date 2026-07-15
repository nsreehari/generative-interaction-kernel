import React from "react";

export interface CountdownTimerOptions {
  durationMs: number;
  running: boolean;
  onElapsed: () => void;
  resetKey?: unknown;
}

export interface CountdownTimer {
  remainingMs: number;
  remainingSeconds: number;
  restart: () => void;
}

export function useCountdownTimer({
  durationMs,
  running,
  onElapsed,
  resetKey,
}: CountdownTimerOptions): CountdownTimer {
  const safeDurationMs = Math.max(0, durationMs);
  const [remainingMs, setRemainingMs] = React.useState(safeDurationMs);
  const [restartToken, setRestartToken] = React.useState(0);
  const onElapsedRef = React.useRef(onElapsed);
  const generationRef = React.useRef(0);
  onElapsedRef.current = onElapsed;

  React.useEffect(() => {
    if (!running) {
      generationRef.current += 1;
      setRemainingMs(safeDurationMs);
      return;
    }

    const generation = ++generationRef.current;
    const deadline = Date.now() + safeDurationMs;
    let elapsed = false;
    setRemainingMs(safeDurationMs);

    const update = () => {
      if (generation !== generationRef.current) return;
      const nextRemainingMs = Math.max(0, deadline - Date.now());
      setRemainingMs(nextRemainingMs);
      if (nextRemainingMs === 0 && !elapsed) {
        elapsed = true;
        onElapsedRef.current();
      }
    };

    const intervalId = window.setInterval(update, 250);
    const timeoutId = window.setTimeout(update, safeDurationMs);
    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, [running, safeDurationMs, resetKey, restartToken]);

  return {
    remainingMs,
    remainingSeconds: Math.max(0, Math.ceil(remainingMs / 1000)),
    restart: () => {
      generationRef.current += 1;
      setRemainingMs(safeDurationMs);
      setRestartToken((value) => value + 1);
    },
  };
}