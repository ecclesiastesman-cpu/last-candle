// Запекание авторского SVG-кита UI в webp (рендер в Chromium — полная поддержка SVG-фильтров).
import { chromium } from 'playwright';
import { readFileSync, readdirSync } from 'fs';
import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, 'uikit');
const TMP = process.env.UIKIT_TMP || '/tmp/uikit';
execSync(`mkdir -p ${TMP}`);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
for (const f of readdirSync(SRC).filter(x => x.endsWith('.svg'))) {
  const svg = readFileSync(join(SRC, f), 'utf8');
  const m = svg.match(/width="(\d+)" height="(\d+)"/);
  const [w, h] = [+m[1], +m[2]];
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(`<style>*{margin:0}body{background:transparent}</style>${svg}`);
  await page.waitForTimeout(250);
  const out = join(TMP, f.replace('.svg', '.png'));
  await page.screenshot({ path: out, omitBackground: true });
  await page.close();
  console.log(f, '->', out);
}
await browser.close();
// PNG -> webp в assets/ui
execSync(`python3 - <<'EOF'
from PIL import Image
import os
tmp = '${TMP}'
out = os.path.join('${HERE}', '..', 'assets', 'ui')
for f in os.listdir(tmp):
    if f.endswith('.png'):
        Image.open(os.path.join(tmp, f)).save(os.path.join(out, f[:-4] + '.webp'), 'WEBP', quality=88)
        print(f[:-4] + '.webp')
EOF`, { stdio: 'inherit' });
