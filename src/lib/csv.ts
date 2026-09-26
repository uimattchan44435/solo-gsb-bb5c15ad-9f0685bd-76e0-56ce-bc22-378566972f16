import { Candidate, Op } from './engine';

const OP_LABEL: Record<Op, string> = {
  M: '正常配对',
  L: '缺轮（漏记）',
  F: '伪轮（不计年）',
};

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 生成带 UTF-8 BOM 的 CSV（Excel 可直接打开） */
export function buildCsv(candidate: Candidate): string {
  const lines: string[] = [];
  lines.push(['树轮交叉定年结果'].join(','));
  lines.push(
    [
      '候选起始年份',
      '终止年份',
      '总代价',
      '配对数',
      '缺轮数',
      '伪轮数',
      '缺轮年份',
      '操作序列',
    ]
      .map(csvCell)
      .join(','),
  );
  lines.push(
    [
      candidate.startYear,
      candidate.endYear,
      candidate.cost,
      candidate.matchCount,
      candidate.missingCount,
      candidate.falseCount,
      candidate.missingYears.length ? candidate.missingYears.join(';') : '无',
      candidate.ops.join(''),
    ]
      .map(csvCell)
      .join(','),
  );
  lines.push('');
  lines.push(
    ['序号', '参考年份', '样本位置', '样本宽度', '参考宽度', '操作', '本行代价', '标记']
      .map(csvCell)
      .join(','),
  );
  for (const r of candidate.rows) {
    const mark = r.missing ? '缺轮年份' : r.falseRing ? '伪轮不计年' : '';
    lines.push(
      [
        r.step,
        r.year,
        r.sampleIndex ?? '',
        r.sampleWidth ?? '',
        r.refWidth ?? '',
        OP_LABEL[r.op],
        r.cost,
        mark,
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return '﻿' + lines.join('\r\n');}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
