// Bounded recovery for transient provider failures; never retry invalid requests.
export async function readTicketModel({preferred, call, listModels, pause = ms => new Promise(resolve => setTimeout(resolve, ms))}) {
  let model = preferred;
  let response = await call(model);
  if (response.status === 404) {
    const alternatives = await listModels();
    for (const candidate of alternatives.filter(name => name !== model).slice(0, 3)) {
      model = candidate;
      response = await call(model);
      if (response.status !== 404) break;
    }
  }
  for (let attempt = 0; attempt < 2 && [408, 429, 500, 502, 503, 504].includes(response.status); attempt++) {
    // Release the failed response before sending the same ephemeral image again.
    await response.body?.cancel();
    await pause(1000 * 2 ** attempt + Math.floor(Math.random() * 250));
    if (attempt === 1) {
      const alternatives = await listModels();
      model = alternatives.find(name => name !== model) || model;
    }
    response = await call(model);
  }
  return {response, model};
}
