import type { AlignmentResult } from '../shared/align.ts';

const OP_TEXT: Record<string, string> = {
  M: '配对',
  D: '漏记（缺轮）',
  F: '伪轮'
};

function escapeCell(value: string | number | null): string {
  if (value === null) return '';
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 生成结果 CSV 文本（带 BOM，Excel 可直接打开） */
export function buildCsv(result: AlignmentResult): string {
  const lines: string[] = [];
  lines.push('树轮交叉定年结果');
  lines.push(`起始年份,${result.startYear}`);
  lines.push(`总代价,${result.totalCost}`);
  lines.push(`操作序列,${result.operationSequence}`);
  lines.push(`配对数,${result.matchedCount}`);
  lines.push(`漏记数,${result.missingCount}`);
  lines.push(`伪轮数,${result.falseCount}`);
  lines.push(
    `缺轮年份,${result.missingYears.length > 0 ? result.missingYears.join(' ') : '无'}`
  );
  lines.push('');
  lines.push(
    ['行号', '年份', '参考宽度', '样本位置', '样本宽度', '操作', '行代价', '缺轮']
      .map(escapeCell)
      .join(',')
  );
  for (const row of result.rows) {
    lines.push(
      [
        row.row,
        row.year,
        row.referenceWidth,
        row.samplePosition,
        row.sampleWidth,
        OP_TEXT[row.operation],
        row.cost,
        row.missing ? '缺轮' : ''
      ]
        .map(escapeCell)
        .join(',')
    );
  }
  return '﻿' + lines.join('\r\n');
}

export function downloadCsv(result: AlignmentResult): void {
  const csv = buildCsv(result);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `crossdating-${result.startYear}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
