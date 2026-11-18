import { chromium } from 'playwright';
import fs from 'node:fs';
const [,, dir, label] = process.argv;
const { createApp } = await import(`${process.cwd()}/${dir}/server.js`);
const server = createApp(); await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
const call = async (path, { method = 'GET', body, token } = {}) => {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: res.status === 204 ? null : await res.json().catch(() => ({})) };
};
const mk = async (e) => { await call('/api/auth/register', { method: 'POST', body: { email: e, password: 'password123' } }); return (await call('/api/auth/login', { method: 'POST', body: { email: e, password: 'password123' } })).data.token; };
const results = [];
const rec = (id, name, observed, pass) => results.push({ id, name, observed, pass });

// C1 no token
rec('C1', 'Request without token', 'HTTP ' + (await call('/api/tasks')).status, (await call('/api/tasks')).status === 401);
// C2 cross-user delete
const A = await mk('alice@example.com'), Bz = await mk('bob@example.com');
const t1 = (await call('/api/tasks', { method: 'POST', token: A, body: { title: 'Submit AAT-2 report' } })).data;
await call('/api/tasks', { method: 'POST', token: A, body: { title: 'Prepare viva slides' } });
const del = await call('/api/tasks/' + t1.id, { method: 'DELETE', token: Bz });
const aLeft = (await call('/api/tasks', { token: A })).data.length;
rec('C2', "Bob deletes Alice's task", `HTTP ${del.status}; Alice has ${aLeft} task(s) left`, del.status !== 204 && aLeft === 2);
// C3 non-string title
const bad = await call('/api/tasks', { method: 'POST', token: A, body: { title: 12345 } });
rec('C3', 'Task with non-string title (12345)', 'HTTP ' + bad.status, bad.status === 400);
// C4 over-long title
const long = await call('/api/tasks', { method: 'POST', token: A, body: { title: 'x'.repeat(10000) } });
rec('C4', 'Task with 10,000-character title', 'HTTP ' + long.status, long.status === 400);
// remove the 10k task if it was stored so screenshots stay readable
if (long.status === 201) await call('/api/tasks/' + long.data.id, { method: 'DELETE', token: A });

// C5 XSS in the browser
const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 820, height: 560 } });
await page.goto(base + '/');
await page.fill('#email', 'carol@example.com'); await page.fill('#password', 'password123');
await page.click('#register'); await page.waitForTimeout(200); await page.click('#login'); await page.waitForSelector('#app:not([hidden])');
for (const title of ['<h1 style="color:#d00">INJECTED HTML</h1>', '<img src=x onerror="document.title=\'XSS-RAN\'">']) {
  await page.fill('#title', title); await page.press('#title', 'Enter'); await page.waitForTimeout(250);
}
await page.waitForTimeout(300);
const titleAfter = await page.title();
const heading = await page.locator('#tasks h1').count();
rec('C5', 'HTML/script payload in task title', `page title "${titleAfter}"; injected <h1> elements: ${heading}`, titleAfter === 'TaskNest' && heading === 0);
await page.screenshot({ path: `shots/${label}_xss.png` });

// UI screenshot of Alice's list after Bob's attempt
const p2 = await browser.newPage({ viewport: { width: 820, height: 420 } });
await p2.goto(base + '/'); await p2.fill('#email', 'alice@example.com'); await p2.fill('#password', 'password123'); await p2.click('#login'); await p2.waitForSelector('#app:not([hidden])');
await p2.waitForTimeout(250); await p2.screenshot({ path: `shots/${label}_alice.png` });
await browser.close(); server.close();
const passed = results.filter((r) => r.pass).length;
fs.writeFileSync(`shots/${label}_results.json`, JSON.stringify({ label, passed, failed: results.length - passed, results }, null, 2));
console.log(`${label}: ${passed}/${results.length} passed`); results.forEach((r) => console.log(` ${r.pass ? 'PASS' : 'FAIL'} ${r.id} ${r.name}: ${r.observed}`));
