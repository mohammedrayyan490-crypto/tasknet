import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SECRET = process.env.TASKNEST_SECRET || 'dev-secret';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const b64 = (s) => Buffer.from(s).toString('base64url');
const sign = (p) => { const body = b64(JSON.stringify(p)); return body + '.' + crypto.createHmac('sha256', SECRET).update(body).digest('base64url'); };
function verify(t) {
  const [body, sig] = String(t || '').split('.');
  if (!body || !sig) return null;
  const good = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return sig === good ? JSON.parse(Buffer.from(body, 'base64url').toString()) : null;
}
const hash = (pw, salt = crypto.randomBytes(16).toString('hex')) => salt + ':' + crypto.scryptSync(pw, salt, 32).toString('hex');
const check = (pw, stored) => { const [salt] = stored.split(':'); return hash(pw, salt) === stored; };

export function createApp() {
  const users = new Map(); const tasks = []; let nextId = 1;
  const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(obj === null ? '' : JSON.stringify(obj)); };
  const readBody = (req) => new Promise((resolve) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => resolve(d)); });

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      if (!url.pathname.startsWith('/api/')) {
        const file = path.join(__dirname, 'public', url.pathname === '/' ? 'index.html' : url.pathname);
        if (!fs.existsSync(file)) { res.writeHead(404); return res.end('Not found'); }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'text/plain' }); return res.end(fs.readFileSync(file));
      }
      const body = req.method === 'GET' || req.method === 'DELETE' ? {} : JSON.parse((await readBody(req)) || '{}');
      if (url.pathname === '/api/auth/register' && req.method === 'POST') {
        if (users.has(body.email)) return send(res, 409, { error: 'Email exists' });
        users.set(body.email, { id: users.size + 1, email: body.email, password: hash(body.password) });
        return send(res, 201, { email: body.email });
      }
      if (url.pathname === '/api/auth/login' && req.method === 'POST') {
        const u = users.get(body.email);
        if (!u || !check(body.password, u.password)) return send(res, 401, { error: 'Invalid credentials' });
        return send(res, 200, { token: sign({ uid: u.id }) });
      }
      const user = verify((req.headers.authorization || '').replace('Bearer ', ''));
      if (!user) return send(res, 401, { error: 'Unauthorized' });
      const m = url.pathname.match(/^\/api\/tasks(?:\/(\d+))?$/);
      if (!m) return send(res, 404, { error: 'Not found' });
      if (!m[1] && req.method === 'GET') return send(res, 200, tasks.filter((t) => t.ownerId === user.uid));
      if (!m[1] && req.method === 'POST') {
        const t = { id: nextId++, ownerId: user.uid, title: body.title.trim(), description: body.description || '', done: false };
        tasks.push(t); return send(res, 201, t);
      }
      const t = tasks.find((x) => x.id === Number(m[1]));
      if (!t) return send(res, 404, { error: 'Task not found' });
      if (req.method === 'PUT') { Object.assign(t, body); return send(res, 200, t); }
      if (req.method === 'DELETE') { tasks.splice(tasks.indexOf(t), 1); return send(res, 204, null); }
      return send(res, 405, { error: 'Method not allowed' });
    } catch (e) { return send(res, 500, { error: 'Server error' }); }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) createApp().listen(process.env.PORT || 3000, () => console.log('TaskNest running'));
