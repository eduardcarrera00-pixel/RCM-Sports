// Bounded recovery for transient provider failures; never retry invalid requests.
// Under "high demand" (503) Google often overloads one model while others answer, so after one
// retry on the same model we fail over to up to two different models (newest Flash, then Flash-Lite).
export async function readTicketModel({preferred, call, listModels, pause = ms => new Promise(resolve => setTimeout(resolve, ms))}) {
  let model = preferred;
  const tried = new Set([model]);
  let response = await call(model);
  if (response.status === 404) {
    const alternatives = await listModels();
    for (const candidate of alternatives.filter(name => !tried.has(name)).slice(0, 3)) {
      model = candidate; tried.add(model);
      response = await call(model);
      if (response.status !== 404) break;
    }
  }
  let alternatives: string[] | null = null;
  for (let attempt = 0; attempt < 3 && [408, 429, 500, 502, 503, 504].includes(response.status); attempt++) {
    // Release the failed response before sending the same ephemeral image again.
    await response.body?.cancel();
    await pause(1000 * 2 ** attempt + Math.floor(Math.random() * 250));
    if (attempt >= 1) {
      alternatives ??= await listModels();
      model = alternatives.find(name => !tried.has(name)) || model;
      tried.add(model);
    }
    response = await call(model);
  }
  return {response, model};
}
