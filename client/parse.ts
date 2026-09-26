import type { AlignmentResult } from '../shared/align.ts';

export type { AlignmentResult };

export interface ParsedReference {
  startYear: number;
  widths: number[];
}

/** 解析参考序列文本：每行「年份,宽度」（逗号/空白分隔均可），年份须连续递增 */
export function parseReference(text: string): ParsedReference {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
  if (lines.length === 0) throw new Error('请输入参考序列（每行：年份,宽度）。');

  const years: number[] = [];
  const widths: number[] = [];
  lines.forEach((line, idx) => {
    const parts = line.split(/[\s,，、]+/).filter(Boolean);
    if (parts.length !== 2) {
      throw new Error(`参考序列第 ${idx + 1} 行格式错误，应为「年份,宽度」：${line}`);
    }
    const year = Number(parts[0]);
    const width = Number(parts[1]);
    if (!Number.isInteger(year)) {
      throw new Error(`参考序列第 ${idx + 1} 行年份不是整数：${parts[0]}`);
    }
    if (!Number.isInteger(width) || width <= 0) {
      throw new Error(`参考序列第 ${idx + 1} 行宽度不是正整数：${parts[1]}`);
    }
    years.push(year);
    widths.push(width);
  });

  for (let i = 1; i < years.length; i++) {
    if (years[i] !== years[i - 1] + 1) {
      throw new Error(
        `参考序列年份必须连续递增：第 ${i} 年为 ${years[i - 1]}，第 ${i + 1} 年为 ${years[i]}。`
      );
    }
  }
  return { startYear: years[0], widths };
}

/** 解析样本宽度文本：正整数，可用换行/逗号/空白分隔 */
export function parseSample(text: string): number[] {
  const tokens = text
    .split(/[\s,，、]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !t.startsWith('#'));
  if (tokens.length === 0) throw new Error('请输入样本宽度序列（每行一个正整数）。');
  return tokens.map((t, idx) => {
    const w = Number(t);
    if (!Number.isInteger(w) || w <= 0) {
      throw new Error(`样本第 ${idx + 1} 个宽度不是正整数：${t}`);
    }
    return w;
  });
}
