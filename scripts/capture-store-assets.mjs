#!/usr/bin/env node
// 生成 Chrome Web Store 素材：1280×800 截图（英文 / 中文两套）+ 440×280 小宣传图 + 1400×560 大宣传图。
// 截图来自真实扩展 UI：加载 .output/chrome-mv3，用本地 HTTP 页面播放合成背景视频并注入示例字幕。
//
//   node scripts/capture-store-assets.mjs            # 两套语言 + 宣传图
//   node scripts/capture-store-assets.mjs --lang en  # 只出英文
//
// 产物：docs/store/assets/{en,zh}/*.jpg、docs/store/assets/promo/*.jpg
// 依赖：ffmpeg、已构建的扩展（pnpm build）、@playwright/test 的 chromium。

import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const EXTENSION_PATH = join(ROOT, '.output/chrome-mv3');
const TMP = join(ROOT, '.output/store-assets');
const OUT = join(ROOT, 'docs/store/assets');
const SCENE = join(TMP, 'scene.mp4');

const LANGS = process.argv.includes('--lang')
  ? [process.argv[process.argv.indexOf('--lang') + 1]]
  : ['en', 'zh'];
const LANG_CODES = { en: 'en-GB', zh: 'zh-CN' };

const SRT_JA = `1
00:00:01,000 --> 00:00:06,000
今日はいい天気ですね。駅まで歩きましょう。

2
00:00:06,500 --> 00:00:11,000
少し早く着くかもしれません。

3
00:00:11,500 --> 00:00:16,000
途中でコーヒーを買ってもいいですか。

4
00:00:16,500 --> 00:00:20,000
もちろんです。ゆっくり行きましょう。
`;

const SRT_ZH = `1
00:00:01,000 --> 00:00:06,000
今天天气真好。我们走去车站吧。

2
00:00:06,500 --> 00:00:11,000
说不定会早到一点。

3
00:00:11,500 --> 00:00:16,000
路上可以买杯咖啡吗？

4
00:00:16,500 --> 00:00:20,000
当然。我们慢慢走吧。
`;

function log(message) {
  console.log(`  ${message}`);
}

function ensureScene() {
  mkdirSync(TMP, { recursive: true });
  if (existsSync(SCENE)) return;
  log('生成背景视频 scene.mp4');
  execFileSync(
    'ffmpeg',
    [
      '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi',
      // 900×800 matches the side-split player box (1280−380 × 800), so contain leaves no bars there;
      // the full-frame shots crop it with object-fit: cover.
      '-i', 'gradients=s=900x800:c0=0x0a1220:c1=0x1d4a63:c2=0x7a4a2a:n=3:speed=0.01:d=20',
      '-vf', 'gblur=sigma=24,vignette=PI/4,noise=alls=4:allf=t,format=yuv420p',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-r', '30',
      '-y', SCENE,
    ],
    { stdio: 'inherit' },
  );
}

const PAGE_HTML = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<style>html,body{margin:0;width:100%;height:100%;background:#000;overflow:hidden}
video{width:100%;height:100%;object-fit:cover;display:block}</style></head>
<body><video id="v" src="/scene.mp4" muted playsinline></video>
<script>
  const v = document.getElementById('v');
  v.addEventListener('loadedmetadata', () => { v.pause(); v.currentTime = 2.4; });
</script></body></html>`;

function startServer() {
  return new Promise((resolveServer) => {
    const server = http.createServer((req, res) => {
      const path = new URL(req.url, 'http://127.0.0.1').pathname;
      if (path !== '/scene.mp4') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(PAGE_HTML);
        return;
      }
      const size = statSync(SCENE).size;
      const range = req.headers.range;
      if (range) {
        const [startText, endText] = range.replace(/bytes=/, '').split('-');
        const start = Number.parseInt(startText, 10);
        const end = endText ? Number.parseInt(endText, 10) : size - 1;
        res.writeHead(206, {
          'content-type': 'video/mp4',
          'content-range': `bytes ${start}-${end}/${size}`,
          'accept-ranges': 'bytes',
          'content-length': end - start + 1,
        });
        createReadStream(SCENE, { start, end }).pipe(res);
        return;
      }
      res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': size, 'accept-ranges': 'bytes' });
      createReadStream(SCENE).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolveServer(server));
  });
}

const now = Date.now();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const LIBRARY_PACKS = [
  {
    id: 'pack-monster',
    title: 'Monster',
    origin: {
      kind: 'kitsunekko',
      site: 'kitsunekko.net',
      seriesName: 'Monster',
      seriesPath: 'Monster',
      seriesUrl: 'https://kitsunekko.net/subtitles/japanese/Monster/',
      archiveName: 'Monster.zip',
      archiveUrl: 'https://kitsunekko.net/subtitles/japanese/Monster/Monster.zip',
      archiveModified: '2026-08-14 21:03',
      importedAt: now - 12 * DAY,
    },
    addedAt: now - 12 * DAY,
    updatedAt: now - 2 * DAY,
  },
  {
    id: 'pack-frieren',
    title: '葬送のフリーレン',
    origin: { kind: 'local', importedAt: now - 9 * DAY },
    addedAt: now - 9 * DAY,
    updatedAt: now - 9 * DAY,
  },
  {
    id: 'pack-apothecary',
    title: 'The Apothecary Diaries',
    origin: {
      kind: 'kitsunekko',
      site: 'kitsunekko.net',
      seriesName: 'Kusuriya no Hitorigoto',
      seriesPath: 'Kusuriya no Hitorigoto',
      seriesUrl: 'https://kitsunekko.net/subtitles/japanese/Kusuriya%20no%20Hitorigoto/',
      archiveName: 'Kusuriya no Hitorigoto.zip',
      archiveUrl: 'https://kitsunekko.net/subtitles/japanese/Kusuriya%20no%20Hitorigoto/Kusuriya%20no%20Hitorigoto.zip',
      archiveModified: '2026-07-30 18:44',
      importedAt: now - 25 * DAY,
    },
    addedAt: now - 25 * DAY,
    updatedAt: now - 25 * DAY,
  },
];

const LIBRARY_INDEX = [
  { id: 'item-monster-01', packId: 'pack-monster', name: 'Monster - 01 [jpn].srt', size: 18_432, addedAt: now - 12 * DAY, cueCount: 342 },
  { id: 'item-monster-02', packId: 'pack-monster', name: 'Monster - 02 [jpn].srt', size: 19_104, addedAt: now - 12 * DAY, cueCount: 361 },
  { id: 'item-monster-03', packId: 'pack-monster', name: 'Monster - 03 [jpn].srt', size: 17_880, addedAt: now - 12 * DAY, cueCount: 318 },
  { id: 'item-frieren-01', packId: 'pack-frieren', name: '葬送のフリーレン 第01話.srt', size: 22_016, addedAt: now - 9 * DAY, cueCount: 402 },
  { id: 'item-frieren-02', packId: 'pack-frieren', name: '葬送のフリーレン 第02話.srt', size: 21_504, addedAt: now - 9 * DAY, cueCount: 388 },
  { id: 'item-apothecary-01', packId: 'pack-apothecary', name: 'Kusuriya no Hitorigoto - 01 [jpn].ass', size: 26_624, addedAt: now - 25 * DAY, cueCount: 455 },
];

async function seed(worker, language, pageKey, withTranslation) {
  await worker.evaluate(
    async ({ language, pageKey, withTranslation, packs, index, srtJa, srtZh, now }) => {
      await chrome.storage.local.clear();
      await chrome.storage.local.set({
        'ui:language': language,
        'ui:theme': 'dark',
        'lib:packs': packs,
        'lib:index': index,
        'lib:settings': { lastId: 'item-monster-01', autoApply: true },
        'lib:item:item-monster-01': srtJa,
        'lib:item:item-monster-02': srtJa,
        'lib:item:item-monster-03': srtJa,
        'lib:item:item-frieren-01': srtJa,
        'lib:item:item-frieren-02': srtJa,
        'lib:item:item-apothecary-01': srtJa,
        [`cfg:${pageKey}`]: {
          offset: 0,
          subs: {
            a: { name: 'Monster - 01 [jpn].srt', text: srtJa },
            b: withTranslation
              ? { name: 'Monster - 01 [zh].srt', text: srtZh }
              : { name: '', text: '' },
          },
          layers: {
            a: { fontScale: 0.042, anchorY: 0.86 },
            b: { enabled: withTranslation, colorize: false, furigana: false, anchorY: 0.78 },
          },
        },
        'dict:settings': {
          enabled: true,
          levels: { 1: true, 2: true, 3: true, 4: true, 5: true },
          trigger: 'click',
          duration: { mode: 'cue', ms: 8000 },
          pronunciation: { romaji: true },
          pauseOnLookup: false,
        },
        seededAt: now,
      });
    },
    {
      language,
      pageKey,
      withTranslation,
      packs: LIBRARY_PACKS,
      index: LIBRARY_INDEX,
      srtJa: SRT_JA,
      srtZh: SRT_ZH,
      now,
    },
  );
}

async function waitForOverlay(page) {
  await page.waitForSelector('#jp-sub-host', { timeout: 15_000 });
  await page.waitForFunction(
    () => {
      const host = document.querySelector('#jp-sub-host');
      return !!host?.shadowRoot?.querySelector('.dict-word');
    },
    { timeout: 20_000 },
  );
  await page.waitForTimeout(700);
}

async function openPlayer(page, origin) {
  await page.goto('about:blank');
  await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const video = document.querySelector('video');
    return video && video.readyState >= 2;
  });
  await page.evaluate(() => {
    const video = document.querySelector('video');
    video.pause();
    video.currentTime = 2.4;
  });
  await page.waitForTimeout(400);
  await waitForOverlay(page);
  await page.mouse.move(40, 40);
}

async function captureOverlay(page, origin, outDir, lang, reseed) {
  // 1) 词卡：点「天気」，展示读音、级别、释义与例句。译文层关掉，避免词卡压住译文。
  await reseed(false);
  await openPlayer(page, origin);
  const word = page.locator('#jp-sub-host .dict-word', { hasText: '天気' }).first();
  await word.waitFor({ timeout: 10_000 });
  await word.click();
  await page.waitForFunction(() => {
    const card = document.querySelector('#jp-sub-host')?.shadowRoot?.querySelector('.card');
    return card && !card.hidden && card.textContent?.includes('天気');
  }, { timeout: 10_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(outDir, `${lang}-1-wordcard.jpg`), type: 'jpeg', quality: 92 });
  log(`${lang}-1-wordcard.jpg`);

  // 2) 控制面板：原文 + 译文、偏移、显示时长。
  await reseed(true);
  await openPlayer(page, origin);
  await page.mouse.move(640, 400);
  await page.waitForTimeout(200);
  await page.locator('#jp-sub-host .dock button').first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(outDir, `${lang}-2-panel.jpg`), type: 'jpeg', quality: 92 });
  log(`${lang}-2-panel.jpg`);

  // 3) 字幕流：右侧分栏，视频不遮挡。
  await reseed(true);
  await openPlayer(page, origin);
  await page.mouse.move(640, 400);
  await page.waitForTimeout(200);
  await page.locator('#jp-sub-host .dock button').nth(1).click();
  await page.locator('#jp-sub-host .transcript').waitFor({ timeout: 10_000 });
  // 默认右侧分栏：视频与字幕流各占一侧，不互相遮挡。
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(outDir, `${lang}-5-transcript.jpg`), type: 'jpeg', quality: 92 });
  log(`${lang}-5-transcript.jpg`);

  // 4) 干净的一帧，供宣传图复用。
  await openPlayer(page, origin);
  await page.mouse.move(40, 40);
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(TMP, `hero-${lang}.jpg`), type: 'jpeg', quality: 92 });
}

async function captureOptions(context, extensionId, outDir, lang) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`chrome-extension://${extensionId}/options.html#packs`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(outDir, `${lang}-3-library.jpg`), type: 'jpeg', quality: 92 });
  log(`${lang}-3-library.jpg`);

  await page.goto(`chrome-extension://${extensionId}/options.html#modes`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(outDir, `${lang}-4-modes.jpg`), type: 'jpeg', quality: 92 });
  log(`${lang}-4-modes.jpg`);
  await page.close();
}

function capturePromo(outDir, lang) {
  const hero = readFileSync(join(TMP, `hero-${lang}.jpg`)).toString('base64');
  const icon = readFileSync(join(ROOT, 'public/icon/128.png')).toString('base64');

  const render = async (context, width, height, path, body) => {
    const page = await context.newPage();
    await page.setViewportSize({ width, height });
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
      *{box-sizing:border-box}
      html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;
        background:#0a1220;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      .glow{position:absolute;inset:0;background:
        radial-gradient(70% 90% at 12% 0%, rgba(30,144,255,.30), transparent 62%),
        radial-gradient(60% 80% at 100% 100%, rgba(229,83,61,.22), transparent 60%)}
    </style></head><body><div class="glow"></div>${body}</body></html>`);
    await page.waitForTimeout(300);
    await page.screenshot({ path, type: 'jpeg', quality: 92 });
    await page.close();
    log(path.slice(path.indexOf('assets/') + 7));
  };

  return (async () => {
    const context = await chromium.launch({ channel: 'chromium', headless: true });

    await render(context, 440, 280, join(outDir, 'promo-small-440x280.jpg'), `
      <div style="position:absolute;left:34px;top:32px;display:flex;align-items:center;gap:12px">
        <img src="data:image/png;base64,${icon}" style="width:44px;height:44px;border-radius:11px">
        <div style="font-size:19px;font-weight:700;letter-spacing:-.01em">JP Subtitle Overlay</div>
      </div>
      <div style="position:absolute;left:34px;top:104px;font-size:27px;line-height:1.18;font-weight:700;letter-spacing:-.02em">
        Read Japanese<br>while you watch.
      </div>
      <div style="position:absolute;left:34px;bottom:34px;display:flex;gap:8px;font-size:11px;color:rgba(255,255,255,.72)">
        <span style="padding:3px 9px;border-radius:99px;background:rgba(255,255,255,.08)">POS colours</span>
        <span style="padding:3px 9px;border-radius:99px;background:rgba(255,255,255,.08)">JLPT cards</span>
        <span style="padding:3px 9px;border-radius:99px;background:rgba(255,255,255,.08)">Dual subtitles</span>
      </div>`);

    await render(context, 1400, 560, join(outDir, 'promo-marquee-1400x560.jpg'), `
      <img src="data:image/jpeg;base64,${hero}" style="position:absolute;right:0;top:0;width:760px;height:560px;object-fit:cover;opacity:.72;
        mask-image:linear-gradient(90deg,transparent,#000 42%);-webkit-mask-image:linear-gradient(90deg,transparent,#000 42%)">
      <div style="position:absolute;left:84px;top:92px;display:flex;align-items:center;gap:16px">
        <img src="data:image/png;base64,${icon}" style="width:68px;height:68px;border-radius:16px">
        <div style="font-size:27px;font-weight:700">JP Subtitle Overlay</div>
      </div>
      <div style="position:absolute;left:84px;top:208px;width:560px;font-size:54px;line-height:1.12;font-weight:800;letter-spacing:-.03em">
        Read Japanese<br>while you watch.
      </div>
      <div style="position:absolute;left:86px;top:356px;width:520px;font-size:18px;line-height:1.5;color:rgba(255,255,255,.76)">
        Local subtitles on any web video, part-of-speech colouring,
        furigana and JLPT word cards — fully offline.
      </div>
      <div style="position:absolute;left:86px;bottom:70px;font-size:13px;color:rgba(255,255,255,.55)">
        Free · No account · No ads · No tracking
      </div>`);

    await context.close();
  })();
}

async function main() {
  if (!existsSync(EXTENSION_PATH)) {
    throw new Error('找不到 .output/chrome-mv3，先执行 pnpm build');
  }
  ensureScene();
  for (const lang of LANGS) mkdirSync(join(OUT, lang), { recursive: true });
  mkdirSync(join(OUT, 'promo'), { recursive: true });

  const server = await startServer();
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;

  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 800 },
    reducedMotion: 'reduce',
    args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
  });

  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15_000 });
  const extensionId = new URL(worker.url()).host;

  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });

  for (const lang of LANGS) {
    log(`── ${lang} ──`);
    const outDir = join(OUT, lang);
    const pageKey = `${origin}/`;
    const reseed = (withTranslation) => seed(worker, LANG_CODES[lang], pageKey, withTranslation);
    await reseed(true);
    await captureOverlay(page, origin, outDir, lang, reseed);
    await captureOptions(context, extensionId, outDir, lang);
  }

  await context.close();
  server.close();

  await capturePromo(join(OUT, 'promo'), LANGS[0]);
  console.log('\n完成：docs/store/assets/');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
