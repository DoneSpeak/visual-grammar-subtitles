/**
 * Bulk-download subtitles from kitsunekko.net to a local folder.
 *
 *   node scripts/fetch-subtitles.ts Monster --out subtitles/Monster
 *   node scripts/fetch-subtitles.ts Monster --list
 *   node scripts/fetch-subtitles.ts Monster --file "retimed"
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { KITSUNEKKO_BASE, fetchIndex, listDir, mergeSeries, searchSeries, type SubFile } from '../src/features/scraper/kitsunekko.ts';
import { fetchSubtitleFiles } from '../src/features/scraper/subtitles.ts';
import { needsEnglish, translateToEnglish } from '../src/shared/translate.ts';

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const has = (name: string): boolean => argv.includes(`--${name}`);
const positional = argv.filter((arg, i) => !arg.startsWith('--') && !argv[i - 1]?.startsWith('--'));
const query = positional[0];

if (!query) {
  console.error('用法: node scripts/fetch-subtitles.ts <标题> [--out 目录] [--file 关键字] [--list]');
  process.exit(1);
}

const index = await fetchIndex();
let series = searchSeries(index, query);
if (needsEnglish(query)) {
  const english = await translateToEnglish(query).catch(() => null);
  if (english) {
    console.log(`标题非英文，已翻译为「${english}」一并搜索`);
    series = mergeSeries([series, searchSeries(index, english)]);
  }
}
if (!series.length) {
  console.error(`kitsunekko 没有匹配「${query}」的番剧（用英文 / 罗马音标题）`);
  process.exit(1);
}
if (series.length > 1) {
  console.error(`匹配到 ${series.length} 个，使用第一个：${series[0].name}`);
  for (const s of series.slice(0, 10)) console.error(`  - ${s.name}`);
}
const target = series[0];
console.log(`系列: ${target.name} (${target.path})`);

const { files } = await listDir(target.path);
if (!files.length) {
  console.error('该目录没有文件');
  process.exit(1);
}
const byDate = (a: SubFile, b: SubFile): number => Date.parse(b.modified) - Date.parse(a.modified);
const sorted = [...files].sort(byDate);

if (has('list')) {
  for (const f of sorted) console.log(`${f.modified}  ${(f.size / 1024).toFixed(0).padStart(5)}KB  ${f.name}`);
  process.exit(0);
}

const needle = flag('file')?.toLowerCase();
const picked = needle ? sorted.find((f) => f.name.toLowerCase().includes(needle)) : sorted[0];
if (!picked) {
  console.error(`没有文件名包含「${needle}」的文件。可用 --list 查看`);
  process.exit(1);
}
console.log(`文件: ${picked.name}`);

const subtitles = await fetchSubtitleFiles(picked.url);
if (!subtitles.length) {
  console.error('压缩包里没有可识别的字幕（.srt/.vtt/.ass/.ssa）');
  process.exit(1);
}

const outDir = flag('out') ?? join('subtitles', target.name);
await mkdir(outDir, { recursive: true });
for (const sub of subtitles) {
  await writeFile(join(outDir, sub.name), sub.text, 'utf8');
}

// Keep the pack traceable: one anime folder = one pack, with where it came from.
const source = {
  kind: 'kitsunekko',
  site: 'kitsunekko.net',
  seriesName: target.name,
  seriesPath: target.path,
  seriesUrl: `${KITSUNEKKO_BASE}/dirlist.php?dir=${encodeURIComponent(target.path)}`,
  archiveName: picked.name,
  archiveUrl: picked.url,
  archiveModified: picked.modified,
  importedAt: new Date().toISOString(),
  fileCount: subtitles.length,
  files: subtitles.map((sub) => sub.name),
};
await writeFile(join(outDir, 'source.json'), `${JSON.stringify(source, null, 2)}\n`, 'utf8');
console.log(`已写入 ${subtitles.length} 份字幕 + source.json -> ${outDir}`);