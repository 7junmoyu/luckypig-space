// Liveness only: content readiness is checked separately through /api/health.
try {
  const port = Number(process.env.PORT || 4173);
  const response = await fetch(`http://127.0.0.1:${port}/api/status`, { signal: AbortSignal.timeout(3500) });
  if (!response.ok || !(await response.json()).chat?.mode) process.exitCode = 1;
} catch { process.exitCode = 1; }
