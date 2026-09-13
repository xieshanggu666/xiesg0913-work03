import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import type { Geometry } from '@shared/types';
import { boundingBox, pointInPolygon } from '@shared/geometry';

export interface ImportedImage {
  originalRel: string;
  thumbRel: string;
  checksum: string;
  width: number;
  height: number;
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function safeName(name: string): string {
  return (
    basename(name)
      .replace(/[^\w一-龥.\-]+/g, '_')
      .slice(0, 80) || 'scan'
  );
}

/**
 * 把用户选择的扫描原图复制进项目目录并设为只读（0o444）。
 * 应用任何代码路径都不会回写 original/ 下的文件；缩略图、对照图另存。
 */
export async function importOriginal(
  projectDir: string,
  srcPath: string,
  folioId: string
): Promise<ImportedImage> {
  for (const sub of ['original', 'thumb']) {
    mkdirSync(join(projectDir, sub), { recursive: true });
  }
  const ext = extname(srcPath).toLowerCase() || '.png';
  const originalRel = join('original', `${folioId}${ext}`);
  const thumbRel = join('thumb', `${folioId}.jpg`);
  const absOriginal = join(projectDir, originalRel);
  copyFileSync(srcPath, absOriginal);
  // 只读保存：文件权限 + 应用侧纪律（所有写操作走 after/thumb 目录）
  try {
    chmodSync(absOriginal, 0o444);
  } catch {
    /* Windows 上 chmod 不生效；访问控制由应用逻辑保证 */
  }

  const checksum = sha256File(absOriginal);
  const img = sharp(absOriginal, { failOn: 'error' });
  const meta = await img.metadata();
  await img
    .clone()
    .rotate()
    .resize({ width: 480, withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toFile(join(projectDir, thumbRel));

  return {
    originalRel,
    thumbRel,
    checksum,
    width: meta.width ?? 0,
    height: meta.height ?? 0
  };
}

/** 导入修复后对照图（不触碰原图） */
export function importAfterImage(projectDir: string, folioId: string, srcPath: string) {
  const dir = join(projectDir, 'after');
  mkdirSync(dir, { recursive: true });
  const ext = extname(srcPath).toLowerCase() || '.png';
  const rel = join('after', `${folioId}${ext}`);
  const abs = join(projectDir, rel);
  copyFileSync(srcPath, abs);
  return { rel, checksum: sha256File(abs) };
}

/** 复制工序/样本配图 */
export function importPhoto(projectDir: string, subdir: string, id: string, srcPath: string): string {
  const dir = join(projectDir, subdir);
  mkdirSync(dir, { recursive: true });
  const ext = extname(srcPath).toLowerCase() || '.jpg';
  const rel = join(subdir, `${id}${ext}`);
  copyFileSync(srcPath, join(projectDir, rel));
  return rel;
}

export function checksum(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/**
 * 图像（或指定 ROI 内）平均色，返回 hex。
 * ROI 为多边形时按像素质掩码统计；矩形/椭圆走对应包围盒。
 */
export async function averageColorHex(projectDir: string, originalRel: string, geo: Geometry | null): Promise<string> {
  const abs = join(projectDir, originalRel);
  const target = sharp(abs).rotate();
  const meta = await target.metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;

  if (!geo) {
    const { data, info } = await target
      .clone()
      .resize(64, 64, { fit: 'cover' })
      .raw()
      .toBuffer({ resolveWithObject: true });
    return avgHex(data, info.channels);
  }

  const bb = boundingBox(geo);
  const left = Math.max(0, Math.floor(bb.x));
  const top = Math.max(0, Math.floor(bb.y));
  const width = Math.min(W - left, Math.ceil(bb.w));
  const height = Math.min(H - top, Math.ceil(bb.h));
  if (width <= 0 || height <= 0) return '#cccccc';

  const { data, info } = await target
    .clone()
    .extract({ left, top, width, height })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = info.channels;

  let rs = 0;
  let gs = 0;
  let bs = 0;
  let n = 0;
  const inside = (lx: number, ly: number): boolean => {
    const x = left + lx;
    const y = top + ly;
    if (geo.type === 'ellipse') {
      const rx = (geo.w ?? 0) / 2;
      const ry = (geo.h ?? 0) / 2;
      if (rx === 0 || ry === 0) return false;
      const dx = (x - ((geo.x ?? 0) + rx)) / rx;
      const dy = (y - ((geo.y ?? 0) + ry)) / ry;
      return dx * dx + dy * dy <= 1;
    }
    if (geo.type === 'polygon') return pointInPolygon(geo.points ?? [], { x, y });
    return true;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (inside(x, y)) {
        const i = (y * width + x) * ch;
        rs += data[i];
        gs += data[i + 1];
        bs += data[i + 2];
        n++;
      }
    }
  }
  if (n === 0) return '#cccccc';
  const toHex = (v: number) =>
    Math.round(Math.max(0, Math.min(255, v)))
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(rs / n)}${toHex(gs / n)}${toHex(bs / n)}`;
}

function avgHex(data: Buffer, ch: number): string {
  let rs = 0;
  let gs = 0;
  let bs = 0;
  const n = data.length / ch;
  for (let i = 0; i < data.length; i += ch) {
    rs += data[i];
    gs += data[i + 1];
    bs += data[i + 2];
  }
  const toHex = (v: number) =>
    Math.round(v)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(rs / n)}${toHex(gs / n)}${toHex(bs / n)}`;
}

export { existsSync, safeName };
