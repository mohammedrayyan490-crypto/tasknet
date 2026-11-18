import { chromium } from 'playwright'; import fs from 'node:fs';
const [,, txtFile, out, prompt] = process.argv;
const esc = (s) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
const body = esc((prompt ? '$ ' + prompt + '\n' : '') + fs.readFileSync(txtFile, 'utf8')).replace(/^(\s*✔.*)$/gm, '<span style="color:#7ee787">$1</span>').replace(/^(\s*(✖|FAIL).*)$/gm, '<span style="color:#ff7b72">$1</span>').replace(/^(\s*PASS.*)$/gm, '<span style="color:#7ee787">$1</span>');
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 900, height: 200 }, deviceScaleFactor: 1.5 });
await p.setContent(`<body style="margin:0;background:#0d1117"><pre style="margin:0;padding:16px;color:#e6edf3;font:14px/1.45 Consolas,'DejaVu Sans Mono',monospace;white-space:pre-wrap">${body}</pre></body>`);
await p.locator('pre').screenshot({ path: out }); await b.close();
