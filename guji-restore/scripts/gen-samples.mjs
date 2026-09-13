/**
 * 生成内置仿真古籍样例（无需外部素材，全部离线由 SVG + sharp 合成）：
 *   resources/samples/sample-1.png       卷首序（带水痕）
 *   resources/samples/sample-2.png       第二叶（带霉变）
 *   resources/samples/sample-3.png       第三叶（虫孔群、撕裂、焦斑）
 *   resources/samples/sample-3-after.png 第三叶修复后（演示前后对比）
 *   resources/samples/manifest.json
 *
 * 纸色、虫蛀位置使用固定种子，便于标注坐标与图像稳定对应。
 */
import sharp from 'sharp';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const W = 900;
const H = 1300;
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const outDir = join(root, 'resources', 'samples');
const publicDir = join(root, 'public', 'samples');
mkdirSync(outDir, { recursive: true });
mkdirSync(publicDir, { recursive: true });

// 固定种子的简易 PRNG，保证每次生成像素一致
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickFont() {
  return `"AR PL UMing CN","Noto Serif CJK SC","Songti SC","STSong","SimSun",serif`;
}

function pageSvg({ title, columns, seed, pageNo }) {
  const rnd = mulberry32(seed);
  const blotches = [];
  // 纸张杂色
  for (let i = 0; i < 260; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const r = 0.6 + rnd() * 2.2;
    const o = 0.04 + rnd() * 0.1;
    blotches.push(
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="#8a6d3b" opacity="${o.toFixed(2)}"/>`
    );
  }
  // 纸边旧化（内框 + 书口）
  const border = `<rect x="24" y="24" width="${W - 48}" height="${H - 48}" fill="none" stroke="#8a744a" stroke-width="3" opacity="0.55"/>
    <line x1="${W - 60}" y1="24" x2="${W - 60}" y2="${H - 24}" stroke="#7a6238" stroke-width="10" opacity="0.18"/>`;

  const colW = 64;
  const colGap = 22;
  const colX0 = 90;
  const colTop = 110;
  const colBottom = H - 150;
  const colEls = columns
    .map((text, ci) => {
      const x = colX0 + ci * (colW + colGap);
      const chars = Array.from(text.replace(/\s+/g, ''));
      const lineH = 46;
      const spans = chars
        .slice(0, Math.floor((colBottom - colTop) / lineH))
        .map((ch, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : lineH}">${ch}</tspan>`)
        .join('');
      return `<text x="${x}" y="${colTop}" font-family='${pickFont()}' font-size="34" fill="#33291d" opacity="0.92">${spans}</text>`;
    })
    .join('');

  const titleEl = `<text x="${W / 2}" y="74" text-anchor="middle" font-family='${pickFont()}' font-size="30" fill="#4a3a26" letter-spacing="8">${title}</text>`;
  const pageNoEl = `<text x="${W / 2}" y="${H - 70}" text-anchor="middle" font-family='${pickFont()}' font-size="24" fill="#6b563e">${pageNo}</text>`;

  return wrap({ inner: blotches.join('') + border + titleEl + colEls + pageNoEl });
}

function wrap({ inner, extra = '', bg = '#ede1c2' }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="paper" cx="50%" cy="42%" r="75%">
      <stop offset="0%" stop-color="${bg}"/>
      <stop offset="78%" stop-color="#e5d6ad"/>
      <stop offset="100%" stop-color="#cbb985"/>
    </radialGradient>
    <filter id="soft"><feGaussianBlur stdDeviation="1.1"/></filter>
    <filter id="rough"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="2.2"/></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#paper)"/>
  ${inner}${extra}</svg>`;
}

function wormhole(x, y, rx, ry, ragged = 6) {
  const rnd = mulberry32(Math.round(x * 13 + y * 7 + rx * 3));
  let d = '';
  for (let i = 0; i < ragged; i++) {
    const a = (i / ragged) * Math.PI * 2;
    const k = 0.72 + rnd() * 0.5;
    const px = x + Math.cos(a) * rx * k;
    const py = y + Math.sin(a) * ry * k;
    d += `${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`;
  }
  return `<path d="${d}Z" fill="#241a10" opacity="0.9"/>
    <path d="${d}Z" fill="none" stroke="#5a4326" stroke-width="2" opacity="0.7"/>`;
}

function blob(x, y, rx, ry, color, opacity, blur = 8) {
  return `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${color}" opacity="${opacity}" filter="url(#soft)"/>`;
}

async function save(svg, name) {
  await sharp(Buffer.from(svg))
    .png({ compressionLevel: 9 })
    .toFile(join(outDir, name));
  // 同步一份给浏览器 Mock/Playwright（public 随 vite build 进入 out/renderer）
  copyFileSync(join(outDir, name), join(publicDir, name));
  console.log('生成', name);
}

const page1Columns = [
  '稼軒長短句序器大者聲不滿顧小者',
  '詞至東坡始變而豪放然猧當行',
  '本色稼軒斂雄心才氣高調雖有',
  '譏之者終不能廢也餘謂詞至南渡',
  '而後作者輩出體製日新然流於纖',
  '靡者亦不少惟稼軒磊落英多之氣',
  '卒不可掩豈非一時豪傑之士哉',
  '詞源東坡而色澤似淮南固自別',
  '有源流未可以一格拘也覽者詳之'
];
const page2Columns = [
  '青玉案元夕東風夜放花千樹更吹落',
  '星如雨寶馬雕車香滿路鳳簫聲動',
  '玉壺光轉一夜魚龍舞蛾兒雪柳黃',
  '金縷笑裏盈盈暗香去眾裏尋他千',
  '百度驀然回首那人卻在燈火闌珊處',
  '滿路香滿袖衣衫涼生鬢影微寒惻',
  '惻輕盈好夢無尋處惟有斷腸人',
  '在天涯腸斷回首江南江北千里月',
  '白雲深處一聲長笛吹徹古今愁多少'
];
const page3Columns = [
  '破陣子為陳同甫賦壯詞以寄之醉裏',
  '挑燈看劍夢回吹角連營八百里分',
  '麾下炙五十弦翻塞外聲沙場秋點兵',
  '馬作的盧飛快弓如霹靂弦驚了卻',
  '君王天下事可憐白髮生了却君王',
  '天下事可憐白髮生此詞字句間多',
  '有蠹損修補時須辨其原墨慎勿以新',
  '墨亂真凡補綴之紙宜薄漿宜稀取',
  '其可復揭為上石渠己亥秋修復記'
];

// 第一叶：水痕
await save(
  pageSvg({
    title: '稼軒長短句 · 序',
    columns: page1Columns,
    seed: 101,
    pageNo: '一'
  }).replace('</svg>', blob(330, 700, 300, 90, '#7d6a3c', 0.16) + blob(420, 720, 220, 60, '#93c0c8', 0.1) + '</svg>'),
  'sample-1.png'
);

// 第二叶：霉变 + 淡焦斑
await save(
  pageSvg({
    title: '青玉案 · 元夕',
    columns: page2Columns,
    seed: 202,
    pageNo: '二'
  }).replace(
    '</svg>',
    blob(530, 340, 90, 70, '#6f7d3a', 0.2) +
      blob(470, 300, 40, 34, '#5f6b2f', 0.22) +
      blob(610, 380, 30, 26, '#566027', 0.18) +
      '</svg>'
  ),
  'sample-2.png'
);

// 第三叶：虫孔群 + 撕裂 + 焦斑
const tearPath =
  '<path d="M130,160 L205,152 L245,178 L290,168 L315,196 L330,212 L130,184 Z" fill="#3a2b1c" opacity="0.82" filter="url(#rough)"/>' +
  '<path d="M130,160 L205,152 L245,178 L290,168 L315,196 L330,212" fill="none" stroke="#c8b487" stroke-width="1.5" opacity="0.6"/>';

const wormholes = [
  [445, 258, 24, 20],
  [470, 246, 14, 12],
  [430, 276, 12, 10],
  [575, 540, 16, 14],
  [560, 556, 10, 9],
  [590, 522, 9, 8]
]
  .map((w, i) => wormhole(w[0], w[1], w[2], w[3], 7 + i))
  .join('');

await save(
  pageSvg({
    title: '破陣子 · 為陳同甫賦',
    columns: page3Columns,
    seed: 303,
    pageNo: '三'
  }).replace(
    '</svg>',
    tearPath +
      wormholes +
      blob(680, 205, 44, 38, '#9a7b2e', 0.18) +
      blob(668, 220, 20, 18, '#7a5e1f', 0.2) +
      '</svg>'
  ),
  'sample-3.png'
);

// 第三叶修复后：虫孔以同色补纸盖住（略浅、可见嵌补边缘），撕裂以补纸贴合（细线痕），焦斑经清洗减淡
const patches = [
  [445, 258, 30, 26],
  [470, 246, 18, 16],
  [430, 276, 15, 13],
  [575, 540, 20, 18],
  [560, 556, 13, 12],
  [590, 522, 12, 11]
]
  .map(
    ([x, y, rx, ry]) =>
      `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#e8dcb4" opacity="0.94" stroke="#b3a06a" stroke-width="1" stroke-dasharray="3 3"/>`
  )
  .join('');
const repairedTear =
  '<path d="M130,160 L205,152 L245,178 L290,168 L315,196 L330,212 L130,184 Z" fill="#e6d8ae" opacity="0.88" filter="url(#rough)"/>' +
  '<path d="M130,160 L205,152 L245,178 L290,168 L315,196 L330,212" fill="none" stroke="#b3a06a" stroke-width="1" opacity="0.8"/>';

await save(
  pageSvg({
    title: '破陣子 · 為陳同甫賦',
    columns: page3Columns,
    seed: 303,
    pageNo: '三'
  }).replace(
    '</svg>',
    repairedTear +
      patches +
      blob(680, 205, 40, 34, '#b8a068', 0.07) +
      '</svg>'
  ),
  'sample-3-after.png'
);

writeFileSync(
  join(outDir, 'manifest.json'),
  JSON.stringify(
    {
      format: 'guji-samples/1',
      pages: [
        { file: 'sample-1.png', name: '卷首序', damage: ['watermark'] },
        { file: 'sample-2.png', name: '卷一·第二叶', damage: ['mildew'] },
        { file: 'sample-3.png', name: '卷一·第三叶（虫蛀）', damage: ['wormhole', 'tear', 'foxing'], after: 'sample-3-after.png' }
      ],
      note: '仿真样例，非真实古籍；虫孔/撕裂坐标与应用内示例标注对应。'
    },
    null,
    2
  )
);
console.log('样例生成完成 →', root);
