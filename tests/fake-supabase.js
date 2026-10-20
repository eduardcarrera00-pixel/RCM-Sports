/* Supabase falso para pruebas locales de la página completa (sin red).
 * Toda consulta devuelve filas de window.__fake.tables[tabla] (o []) y
 * cada rpc devuelve window.__fake.rpc[nombre](args) (o []).
 * window.__fake.calls registra las llamadas.
 */
(() => {
  const fake = window.__fake = window.__fake || {};
  fake.tables = fake.tables || {};
  fake.rpc = fake.rpc || {};
  fake.calls = fake.calls || [];
  fake.user = fake.user || null;
  function builder(table) {
    const state = { filters: [] };
    const q = {};
    const chain = ['select', 'order', 'limit', 'range', 'not', 'is', 'gte', 'lte', 'gt', 'lt', 'ilike', 'like', 'match', 'filter', 'or', 'contains', 'overlaps'];
    for (const name of chain) q[name] = () => q;
    q.eq = (col, val) => { state.filters.push(r => r[col] === val); return q; };
    q.neq = (col, val) => { state.filters.push(r => r[col] !== val); return q; };
    q.in = (col, vals) => { state.filters.push(r => vals.includes(r[col])); return q; };
    for (const name of ['insert', 'update', 'upsert', 'delete']) q[name] = payload => { fake.calls.push({ table, op: name, payload }); return q; };
    const rows = () => (fake.tables[table] || []).filter(r => state.filters.every(f => f(r)));
    q.single = () => Promise.resolve({ data: rows()[0] || null, error: null });
    q.maybeSingle = q.single;
    q.then = (ok, ko) => Promise.resolve({ data: rows(), error: null, count: rows().length }).then(ok, ko);
    return q;
  }
  const auth = {
    getUser: async () => ({ data: { user: fake.user }, error: null }),
    getSession: async () => ({ data: { session: fake.user ? { user: fake.user } : null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: async () => ({ error: null }),
    signInWithPassword: async () => ({ data: {}, error: { message: 'sin red' } }),
    signInAnonymously: async () => ({ data: {}, error: { message: 'sin red' } })
  };
  const client = {
    from: builder, auth,
    rpc: async (name, args) => {
      fake.calls.push({ rpc: name, args });
      const handler = fake.rpc[name];
      try { return handler ? await handler(args) : { data: [], error: null }; }
      catch (e) { return { data: null, error: { message: e.message } }; }
    },
    storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }), upload: async () => ({ error: { message: 'sin red' } }) }) },
    functions: { invoke: async () => ({ data: null, error: { message: 'sin red' } }) },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel() {}
  };
  window.supabase = { createClient: () => client };
})();
