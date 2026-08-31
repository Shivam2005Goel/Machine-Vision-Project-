import { chromium } from 'playwright';
import path from 'path';

const html = path.resolve('scripts/ar-screenshot-demo.html');
const out = '/opt/cursor/artifacts/screenshots/ar-cube-overlay-demo.png';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(`file://${html}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.screenshot({ path: out, fullPage: false });
await browser.close();
console.log('saved', out);
