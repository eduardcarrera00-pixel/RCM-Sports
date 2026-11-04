// username-auth (función de Supabase) con un Supabase en memoria: registro,
// inicio de sesión sin distinguir mayúsculas y recuperación (4 nov 2026).
// Uso: node tests/username-auth-handler.mjs
import assert from 'node:assert/strict';
import {makeHandler} from '../supabase/functions/username-auth/handler.mjs';

const accounts = [];   // ae_auth_accounts (username con mayúsculas, username_key en minúsculas)
const users = new Map(); // auth.users: email → {id, password, user_metadata}
const key = row => { row.username_key = String(row.username).toLowerCase(); return row; };

function table(name) {
  assert.equal(name, 'ae_auth_accounts');
  let op = 'select', payload = null; const filters = [];
  const rows = () => accounts.filter(r => filters.every(f => f(r)));
  const q = {
    select() { return q; },
    insert(row) {
      const next = key({...row, user_id: null, created_at: new Date().toISOString()});
      // Restricciones como en producción: formato, clave primaria y username_key únicos.
      if (!/^[A-Za-z0-9_]{3,30}$/.test(next.username)) return Promise.resolve({error: {message: 'username_check'}});
      if (accounts.some(r => r.username === next.username || r.username_key === next.username_key)) return Promise.resolve({error: {message: 'duplicate key'}});
      accounts.push(next); return Promise.resolve({error: null});
    },
    update(changes) { op = 'update'; payload = changes; return q; },
    delete() { op = 'delete'; return q; },
    eq(col, val) { filters.push(r => r[col] === val); return q; },
    is(col, val) { filters.push(r => (r[col] ?? null) === val); return q; },
    lt(col, val) { filters.push(r => r[col] < val); return q; },
    run() {
      const hit = rows();
      if (op === 'delete') { for (const r of hit) accounts.splice(accounts.indexOf(r), 1); return {data: null, error: null}; }
      if (op === 'update') { for (const r of hit) key(Object.assign(r, payload)); }
      return {data: hit, error: null};
    },
    single() { const {data} = q.run(); return Promise.resolve(data.length === 1 ? {data: data[0], error: null} : {data: null, error: {message: 'not single'}}); },
    maybeSingle() { const {data} = q.run(); return Promise.resolve({data: data[0] || null, error: null}); },
    then(ok, ko) { return Promise.resolve(q.run()).then(ok, ko); }
  };
  return q;
}
let nextId = 1;
const createClient = () => ({
  from: table,
  rpc: async () => ({data: true, error: null}),
  auth: {
    admin: {
      createUser: async ({email, password, user_metadata}) => {
        const user = {id: 'u' + nextId++, email, password, user_metadata};
        users.set(email, user); return {data: {user}, error: null};
      },
      deleteUser: async id => { for (const [e, u] of users) if (u.id === id) users.delete(e); return {error: null}; },
      updateUserById: async (id, {password}) => { for (const u of users.values()) if (u.id === id) u.password = password; return {error: null}; },
      signOut: async () => ({error: null})
    },
    signInWithPassword: async ({email, password}) => {
      const user = users.get(email);
      if (!user || user.password !== password) return {data: {session: null, user: null}, error: {message: 'invalid'}};
      return {data: {session: {access_token: 't-' + user.id, refresh_token: 'r', user}, user}, error: null};
    }
  }
});

const handler = makeHandler({url: 'https://x.test', serviceKey: 's', anonKey: 'a', createClient});
async function call(body) {
  const res = await handler(new Request('https://x.test/functions/v1/username-auth', {
    method: 'POST', headers: {origin: 'https://camsports.github.io', 'content-type': 'application/json'}, body: JSON.stringify(body)}));
  return {status: res.status, data: await res.json()};
}

// Registro: la primera letra va en mayúscula y el resto como se escribió.
let r = await call({action: 'register', username: 'eduard_10', password: 'contraseña-1'});
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.equal(r.data.username, 'Eduard_10');
assert.equal(accounts[0].username, 'Eduard_10');
assert.equal([...users.values()][0].user_metadata.username, 'Eduard_10');
const code = r.data.recovery_code;
r = await call({action: 'register', username: 'MaríaX', password: 'contraseña-1'});
assert.equal(r.status, 400, 'acentos fuera');
r = await call({action: 'register', username: 'luisMX', password: 'contraseña-2'});
assert.equal(r.data.username, 'LuisMX', 'respeta el resto de mayúsculas');
// No puede haber otro igual cambiando mayúsculas.
r = await call({action: 'register', username: 'EDUARD_10', password: 'contraseña-3'});
assert.equal(r.status, 400, 'nombre repetido con otras mayúsculas');
r = await call({action: 'register', username: 'Admin', password: 'contraseña-3'});
assert.equal(r.status, 400, 'reservado también con mayúscula');

// Inicio de sesión: da igual cómo se escriban las mayúsculas (y la @ delante).
for (const name of ['eduard_10', 'EDUARD_10', 'Eduard_10', '@eduard_10']) {
  r = await call({action: 'login', username: name, password: 'contraseña-1'});
  assert.equal(r.status, 200, name + ': ' + JSON.stringify(r.data));
  assert.equal(r.data.username, 'Eduard_10', 'devuelve el nombre como se ve');
}
r = await call({action: 'login', username: 'eduard_10', password: 'mala'});
assert.equal(r.status, 400);

// Si el perfil lo cambia a minúsculas, sigue entrando igual.
accounts[0].username = 'eduard_10'; key(accounts[0]);
r = await call({action: 'login', username: 'Eduard_10', password: 'contraseña-1'});
assert.equal(r.status, 200); assert.equal(r.data.username, 'eduard_10');

// Recuperación y código nuevo también sin distinguir mayúsculas.
r = await call({action: 'recover', username: 'EDUARD_10', password: 'nueva-contraseña', recovery_code: code});
assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.username, 'eduard_10');
r = await call({action: 'code', username: 'Eduard_10', password: 'nueva-contraseña'});
assert.equal(r.status, 200); assert.ok(r.data.recovery_code);

console.log('PASS: username-auth registra con mayúscula inicial y entra sin distinguir mayúsculas (registro, acceso, recuperación, código).');
