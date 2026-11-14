import { SPORTSCORE_BASE, type SportScoreEnvelope, type SportScoreMatch } from "./sportscore";

export class SportScoreError extends Error {}

/** GET a documented SportScore endpoint. Throws SportScoreError with a message safe to show to admins. */
export async function fetchSportScore(path: string): Promise<SportScoreMatch[]> {
  let res: Response;
  try {
    res = await fetch(`${SPORTSCORE_BASE}${path}`, {
      headers: { Accept: "application/json", "User-Agent": "CricxX/1.0 (+https://cricx-x-live-arena.lovable.app)" },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    console.error("[cricx] SportScore fetch failed", path, e);
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new SportScoreError(timedOut ? "SportScore took too long to answer. Please try again." : "Could not reach SportScore.");
  }
  if (res.status === 429) {
    throw new SportScoreError("SportScore is limiting requests right now. Please wait a few minutes and try again.");
  }
  let body: SportScoreEnvelope | null = null;
  try {
    body = (await res.json()) as SportScoreEnvelope;
  } catch {
    body = null;
  }
  if (!res.ok) {
    console.error("[cricx] SportScore HTTP", res.status, path, body?.error);
    throw new SportScoreError(`SportScore responded with an error (${res.status}${body?.error ? `: ${body.error}` : ""}).`);
  }
  if (!body || !Array.isArray(body.matches)) {
    console.error("[cricx] SportScore unexpected body", path);
    throw new SportScoreError("SportScore sent data in an unexpected format.");
  }
  return body.matches;
}
