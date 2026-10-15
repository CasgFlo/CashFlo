// Google Play store graphics: phone screenshots with a headline (1080x1920) and the feature graphic (1024x500).
// Runs after seed.py, against the web build on :3000 (see screenshots.yml).
import { chromium } from 'playwright';
import fs from 'fs';

const t = JSON.parse(fs.readFileSync('tokens.json', 'utf8'));
const BASE = 'http://localhost:3000';
const RAW = 'shots/store/raw';
const OUT = 'shots/store';
fs.mkdirSync(RAW, { recursive: true });

const browser = await chromium.launch();
const problems = [];

// 360x640 at 3x = 1080x1920, a common phone screen
async function capture(name, path, action) {
  const ctx = await browser.newContext({
    viewport: { width: 360, height: 640 },
    deviceScaleFactor: 3,
    locale: 'pl-PL',
    colorScheme: 'light',
  });
  await ctx.addInitScript((tok) => window.localStorage.setItem('authToken', tok), t.pro);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`${name}: ${e.message}`));
  try {
    await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1800);
    if (action) await action(page);
    await page.screenshot({ path: `${RAW}/${name}.png` });
  } catch (e) {
    problems.push(`${name}: ${e.message.slice(0, 300)}`);
  }
  await ctx.close();
}

const pickSample = async (page) => {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 10000 }),
    page.getByText('Wybierz plik CSV lub Excel').click(),
  ]);
  await chooser.setFiles('sample.csv');
  await page.waitForTimeout(3000);
};

const report = `/report?year=${t.report_year}&month=${t.report_month}`;
const screens = [
  { name: '01-start', path: '/', title: 'Zobacz, <mark>dokąd</mark> idą Twoje pieniądze', sub: 'Saldo, budżet i najbliższe płatności na jednym ekranie' },
  { name: '02-import', path: '/import', action: pickSample, title: 'Historia z banku <mark>w minutę</mark>', sub: 'Wgraj plik CSV lub Excel, kategorie dobiorą się same' },
  { name: '03-stale', path: '/recurring', title: 'Wszystkie <mark>subskrypcje</mark> w jednym miejscu', sub: 'Wiesz, ile naprawdę kosztują Cię w roku' },
  { name: '04-raport', path: report, title: 'Co miesiąc <mark>konkretne</mark> wnioski', sub: 'Co wzrosło, co spadło i gdzie możesz odłożyć' },
  { name: '05-dodaj', path: '/transaction/add', title: 'Wydatek dodasz w <mark>kilka sekund</mark>', sub: 'Kwota, kategoria, gotowe' },
  { name: '06-budzet', path: '/budget/settings', title: 'Limity, które <mark>pilnują</mark> budżetu', sub: 'Ustaw limit na jedzenie czy rozrywkę i patrz, ile zostało' },
];

for (const s of screens) await capture(s.name, s.path, s.action);

const FONTS =
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@800&family=Onest:wght@500;600&display=swap">';
const BASE_CSS = `
  * { box-sizing: border-box; margin: 0; }
  body { width: var(--w); height: var(--h); overflow: hidden; background: #0D6A54; color: #fff; font-family: Onest, sans-serif; }
  h1 { font: 800 var(--title)/1.05 "Bricolage Grotesque", sans-serif; letter-spacing: -0.02em; text-wrap: balance; }
  mark { color: #15201B; background: linear-gradient(transparent 10%, #F5C344 10%, #F5C344 90%, transparent 90%); padding: 0 0.08em; margin: 0 -0.04em; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
`;

async function render(html, file, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: file });
  await ctx.close();
}

const img = (name) => `data:image/png;base64,${fs.readFileSync(`${RAW}/${name}.png`).toString('base64')}`;

for (const s of screens) {
  if (!fs.existsSync(`${RAW}/${s.name}.png`)) continue;
  const html = `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${BASE_CSS}
    body { --w: 1080px; --h: 1920px; --title: 92px; padding: 110px 84px 0; display: flex; flex-direction: column; gap: 28px; }
    p { font-size: 40px; line-height: 1.3; font-weight: 500; color: #D8EEE6; max-width: 880px; }
    .phone { margin-top: 36px; align-self: center; width: 820px; border-radius: 56px; overflow: hidden; border: 14px solid #15201B; box-shadow: 0 30px 80px rgba(0,0,0,.35); background: #15201B; }
    .phone img { display: block; width: 100%; }
  </style></head><body>
    <h1>${s.title}</h1><p>${s.sub}</p>
    <div class="phone"><img src="${img(s.name)}"></div>
  </body></html>`;
  await render(html, `${OUT}/${s.name}.png`, 1080, 1920);
}

// Feature graphic 1024x500
if (fs.existsSync(`${RAW}/01-start.png`)) {
  const html = `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${BASE_CSS}
    body { --w: 1024px; --h: 500px; --title: 64px; position: relative; padding: 70px 0 0 64px; }
    .brand { font: 800 44px/1 "Bricolage Grotesque", sans-serif; display: flex; align-items: center; gap: 14px; margin-bottom: 40px; }
    .dot { width: 22px; height: 22px; border-radius: 50%; background: #F5C344; box-shadow: 0 0 0 5px #15201B; }
    h1 { max-width: 560px; }
    p { margin-top: 22px; font-size: 26px; color: #D8EEE6; max-width: 520px; }
    .phone { position: absolute; right: 64px; top: 48px; width: 300px; border-radius: 36px; overflow: hidden; border: 10px solid #15201B; box-shadow: 0 24px 60px rgba(0,0,0,.35); transform: rotate(4deg); }
    .phone img { display: block; width: 100%; }
  </style></head><body>
    <div class="brand"><span class="dot"></span>Cashflo</div>
    <h1>Zobacz, <mark>dokąd</mark> idą Twoje pieniądze</h1>
    <p>Prosta aplikacja do wydatków i budżetu</p>
    <div class="phone"><img src="${img('01-start')}"></div>
  </body></html>`;
  await render(html, `${OUT}/feature-graphic.png`, 1024, 500);
}

await browser.close();
fs.writeFileSync(`${OUT}/problems.txt`, problems.join('\n') || 'none');
console.log(problems.join('\n') || 'store graphics: no problems');
