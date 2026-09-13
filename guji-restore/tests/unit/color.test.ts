import { describe, expect, it } from 'vitest';
import { colorMatchScore, deltaE2000, hexToLab, hexToRgb, rgbToHex } from '@shared/color';

describe('hex 转换', () => {
  it('rgbToHex / hexToRgb 往返', () => {
    expect(rgbToHex(18, 52, 86)).toBe('#123456');
    expect(hexToRgb('#123456')).toEqual({ r: 18, g: 52, b: 86 });
  });
  it('非法 hex 返回 null', () => {
    expect(hexToRgb('nope')).toBeNull();
  });
});

describe('Lab', () => {
  it('白接近 (100,0,0)', () => {
    const lab = hexToLab('#ffffff')!;
    expect(lab.L).toBeCloseTo(100, 0);
    expect(Math.abs(lab.a)).toBeLessThan(0.1);
    expect(Math.abs(lab.b)).toBeLessThan(0.1);
  });
  it('黑 L≈0', () => {
    expect(hexToLab('#000000')!.L).toBeCloseTo(0, 0);
  });
  it('米黄 b 为正（偏黄）', () => {
    expect(hexToLab('#e8d9b8')!.b).toBeGreaterThan(10);
  });
});

describe('deltaE2000', () => {
  it('相同颜色 ΔE≈0', () => {
    const lab = hexToLab('#e8d9b8')!;
    expect(deltaE2000(lab, lab)).toBeLessThan(1e-9);
  });
  it('黑白差异很大', () => {
    expect(deltaE2000(hexToLab('#000000')!, hexToLab('#ffffff')!)).toBeGreaterThan(90);
  });
  it('相近米黄差异小（<3）', () => {
    const dE = deltaE2000(hexToLab('#e8d9b8')!, hexToLab('#ece0c2')!);
    expect(dE).toBeLessThan(3);
  });
  it('对称性', () => {
    const a = hexToLab('#d9480f')!;
    const b = hexToLab('#2b8a3e')!;
    expect(deltaE2000(a, b)).toBeCloseTo(deltaE2000(b, a), 6);
  });
});

describe('colorMatchScore', () => {
  it('ΔE≤1 满分；随色差单调下降', () => {
    expect(colorMatchScore(0)).toBe(100);
    expect(colorMatchScore(1)).toBe(100);
    const s5 = colorMatchScore(5);
    expect(s5).toBeLessThan(100);
    expect(s5).toBeGreaterThan(colorMatchScore(15));
    expect(colorMatchScore(30)).toBe(0);
  });
});
