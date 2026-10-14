// Takes phone-sized screenshots of the web build for review.
import { chromium } from 'playwright';
import fs from 'fs';

const t = JSON.parse(fs.readFileSync('tokens.json', 'utf8'));
const BASE = 'http://localhost:3000';
const report = `/report?year=${t.report_year}&month=${t.report_month}`;
fs.mkdirSync('shots', { recursive: true });

const browser = await chromium.launch();
const problems = [];

async function shoot(token, name, path, { height = 1500, action, dark = false } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height },
    deviceScaleFactor: 1,
    locale: 'pl-PL',
    colorScheme: dark ? 'dark' : 'light',
  });
  await ctx.addInitScript((tok) => {
    window.localStorage.setItem('authToken', tok);
  }, token);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`${name}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`${name} console: ${m.text().slice(0, 300)}`);
  });
  try {
    await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1800);
    if (action) await action(page);
    await page.screenshot({ path: `shots/${name}.png` });
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

// Pro user
await shoot(t.pro, '01-home', '/');
await shoot(t.pro, '02-transactions', '/transactions', { height: 900 });
await shoot(t.pro, '03-stats', '/stats');
await shoot(t.pro, '04-report-pro', report, { height: 2000 });
await shoot(t.pro, '05-recurring', '/recurring', { height: 1400 });
await shoot(t.pro, '06-recurring-new', '/recurring/edit', { height: 1300 });
await shoot(t.pro, '07-import-start', '/import', { height: 1100 });
await shoot(t.pro, '08-import-preview', '/import', { height: 1500, action: pickSample });
await shoot(t.pro, '09-import-category', '/import', {
  height: 900,
  action: async (page) => {
    await pickSample(page);
    await page.getByText('Jedzenie i Picie').first().click();
    await page.waitForTimeout(800);
  },
});
await shoot(t.pro, '10-budget-pro', '/budget/settings', { height: 1500 });
await shoot(t.pro, '11-more', '/more', { height: 1300 });
await shoot(t.pro, '12-add-transaction', '/transaction/add', { height: 1100 });
await shoot(t.pro, '13-home-dark', '/', { dark: true });

// Free user
await shoot(t.free, '20-report-free', report, { height: 1700 });
await shoot(t.free, '21-pro-upgrade', '/pro/upgrade', { height: 1900 });
await shoot(t.free, '22-budget-free', '/budget/settings', { height: 1100 });
await shoot(t.free, '23-recurring-free', '/recurring', { height: 1200 });

await browser.close();
fs.writeFileSync('shots/problems.txt', problems.join('\n') || 'none');
console.log(problems.join('\n') || 'no problems');
