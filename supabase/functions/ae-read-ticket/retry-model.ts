// Bounded recovery for provider failures; never retry invalid or unauthorized requests.
// Google's free tier is flaky per model: at the same moment one Flash answers 503 "high demand"
// or hangs, another returns 404 (retired for new users) or 429 (no free quota), while others work.
// So we walk a list of different models, one call each, until one answers or the time budget ends.
export async function readTicketModel({preferred, call, listModels, maxCalls = 6, budgetMs = 85000,
  now = () => Date.now(), pause = ms => new Promise(resolve => setTimeout(resolve, ms))}) {
  const start = now();
  const tried = new Set<string>();
  let queue: string[] = [preferred], discovered = false;
  let response: Response | null = null, model = preferred;
  while (tried.size < maxCalls) {
    if (!queue.length) {
      if (discovered) break;
      discovered = true;
      queue = (await listModels()).filter((name: string) => !tried.has(name));
      if (!queue.length) break;
    }
    const next = queue.shift()!;
    if (tried.has(next)) continue;
    if (response) {
      await response.body?.cancel();
      // Same model retried? never: a short breath before the next model is enough.
      if ([500, 502, 503, 504].includes(response.status)) await pause(400 + Math.floor(Math.random() * 200));
    }
    if (now() - start > budgetMs) break;
    model = next; tried.add(model);
    response = await call(model, Math.max(1000, budgetMs - (now() - start)));
    if (response.ok || [400, 401, 403].includes(response.status)) break;
  }
  return {response: response!, model, tried: [...tried]};
}
