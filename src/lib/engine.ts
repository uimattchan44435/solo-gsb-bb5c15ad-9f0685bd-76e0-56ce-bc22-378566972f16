// 树轮交叉定年动态规划引擎
// ------------------------------------------------------------------
// 操作：
//   M 正常配对 —— 样本第 j 轮 ↔ 参考第 k 年，代价 |w_sample[j] - w_ref[k]|
//   L 漏记（缺轮）—— 参考推进一个真实年份，样本不推进，罚分 100
//   F 伪轮 —— 样本推进一轮（不计年），参考不推进，罚分 100
//
// 约束：
//   * 漏记最多 2 个真实年份（L ≤ 2），伪轮最多 2 个（F ≤ 2）
//   * 首尾操作强制为 M（交叉定年常规假设：样本最内、最外层轮均真实）
//     —— 首部缺轮等价于另取更晚的候选起点且更省 100，
//        尾部缺轮不消费任何样本轮，二者均不可能出现在最优解中。
//
// 状态压缩为 (j, a, b)：
//   j = 已消费样本轮数（含伪轮），a = L 数，b = F 数
//   已消费参考偏移 k = j + a - b

export const GAP_PENALTY = 100;
export const MAX_MISSING = 2;
export const MAX_FALSE = 2;

export type Op = 'M' | 'L' | 'F';

export interface RefPoint {
  year: number;
  width: number;
}

export interface AlignRow {
  /** 连续操作序号，从 1 开始 */
  step: number;
  /** 参考年份；M/L 行为真实年份，F 行沿用前一配对年份（不计年） */
  year: number;
  /** 样本轮位置（1 基）；缺轮行为 null */
  sampleIndex: number | null;
  /** 样本宽度；缺轮行为 null */
  sampleWidth: number | null;
  /** 参考宽度；伪轮行为 null */
  refWidth: number | null;
  op: Op;
  /** 本行代价 */
  cost: number;
  /** 缺轮年份标记 */
  missing: boolean;
  /** 伪轮不计年标记 */
  falseRing: boolean;
}

export interface Candidate {
  /** 候选起始年份：样本第一轮正常配对的参考年份 */
  startYear: number;
  /** 最后一个正常配对的真实年份 */
  endYear: number;
  cost: number;
  missingCount: number;
  falseCount: number;
  matchCount: number;
  ops: Op[];
  rows: AlignRow[];
  /** 缺轮的真实年份列表（单独标明） */
  missingYears: number[];
}

export interface CrossdatingResult {
  reference: RefPoint[];
  sample: number[];
  candidateCount: number;
  best: Candidate;
  candidates: Candidate[];
}

export class CrossdatingError extends Error {}

/** 把“年份,宽度”形式的文本解析为参考序列 */
export function parseReference(text: string): RefPoint[] {
  return parseSeries(text).map(([year, width]) => ({ year, width }));
}

/** 解析“年份/索引, 宽度”文本，返回二元组 */
export function parseSeries(text: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const parts = line.split(/[,\t;，；\s]+/).filter(Boolean);
    if (parts.length !== 2) {
      throw new CrossdatingError(
        `第 ${i + 1} 行格式错误：应为「年份, 宽度」，实际为「${raw}」`,
      );
    }
    const a = Number(parts[0]);
    const w = Number(parts[1]);
    if (!Number.isInteger(a)) {
      throw new CrossdatingError(`第 ${i + 1} 行年份不是整数：${parts[0]}`);
    }
    if (!Number.isInteger(w) || w <= 0) {
      throw new CrossdatingError(`第 ${i + 1} 行宽度必须为正整数：${parts[1]}`);
    }
    out.push([a, w]);
  });
  if (out.length === 0) {
    throw new CrossdatingError('序列为空，请至少输入一行数据。');
  }
  return out;
}

/** 解析样本：每行一个正整数宽度（也容忍“序号, 宽度”形式） */
export function parseSample(text: string): number[] {
  const out: number[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const parts = line.split(/[,\t;，；\s]+/).filter(Boolean);
    let w: number;
    if (parts.length === 1) {
      w = Number(parts[0]);
    } else if (parts.length === 2) {
      w = Number(parts[1]);
    } else {
      throw new CrossdatingError(
        `样本第 ${i + 1} 行格式错误：应为每行一个宽度值（或「序号, 宽度」）`,
      );
    }
    if (!Number.isInteger(w) || w <= 0) {
      throw new CrossdatingError(`样本第 ${i + 1} 行宽度必须为正整数：${line}`);
    }
    out.push(w);
  });
  if (out.length === 0) {
    throw new CrossdatingError('样本序列为空，请至少输入一个宽度值。');
  }
  return out;
}

/** 校验参考序列：按年升序排列后必须连续且不重复 */
export function normalizeReference(ref: RefPoint[]): RefPoint[] {
  const sorted = [...ref].sort((p, q) => p.year - q.year);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].year === sorted[i - 1].year) {
      throw new CrossdatingError(`参考序列存在重复年份：${sorted[i].year}`);
    }
    if (sorted[i].year !== sorted[i - 1].year + 1) {
      throw new CrossdatingError(
        `参考序列年份不连续：${sorted[i - 1].year} 之后应为 ` +
          `${sorted[i - 1].year + 1}，实际为 ${sorted[i].year}`,
      );
    }
  }
  return sorted;
}

const INF = Number.POSITIVE_INFINITY;

/**
 * 对参考起点 refStart（参考下标）做动态规划对齐。
 * 返回 null 表示该起点无法在允许的缺轮/伪轮数内对齐。
 */
function alignFromStart(
  sample: number[],
  ref: RefPoint[],
  refStart: number,
): { cost: number; ops: Op[] } | null {
  const n = sample.length;
  const mAvail = ref.length - refStart;
  if (mAvail < Math.max(1, n - MAX_MISSING)) return null;

  // ---- 前向最小代价 g[j][a][b]，已消费参考偏移 k = j + a - b ----
  const g: number[][][] = Array.from({ length: n + 1 }, () =>
    Array.from({ length: MAX_MISSING + 1 }, () =>
      new Array<number>(MAX_FALSE + 1).fill(INF),
    ),
  );

  // 第一条操作强制 M：样本第 0 轮 ↔ 参考起始年（偏移 0）
  g[1][0][0] = Math.abs(sample[0] - ref[refStart].width);

  for (let j = 1; j < n; j++) {
    for (let a = 0; a <= MAX_MISSING; a++) {
      for (let b = 0; b <= MAX_FALSE; b++) {
        const cur = g[j][a][b];
        if (cur === INF) continue;
        const k = j + a - b; // 已消费参考偏移；下一待用偏移为 k
        if (k < 0 || k > mAvail) continue;

        // F：样本第 j 轮为伪轮，参考不推进（不得为最后一步：尾操作为 M）
        if (b + 1 <= MAX_FALSE && j + 1 < n) {
          g[j + 1][a][b + 1] = Math.min(g[j + 1][a][b + 1], cur + GAP_PENALTY);
        }

        // M：样本第 j 轮 ↔ 参考偏移 k
        if (k <= mAvail - 1) {
          const ri = refStart + k;
          g[j + 1][a][b] = Math.min(
            g[j + 1][a][b],
            cur + Math.abs(sample[j] - ref[ri].width),
          );
        }

        // L：参考偏移 k 这一年漏记（样本不推进）；j<n 故不可能成为拖尾缺轮
        if (a + 1 <= MAX_MISSING && k <= mAvail - 1) {
          g[j][a + 1][b] = Math.min(g[j][a + 1][b], cur + GAP_PENALTY);
        }
      }
    }
  }

  // 终止 (n, a, b)：j=n 由最后一步 M 到达（F 在 j+1=n 时已被禁止）
  let bestCost = INF;
  let bestAB: [number, number] | null = null;
  for (let a = 0; a <= MAX_MISSING; a++) {
    for (let b = 0; b <= MAX_FALSE; b++) {
      const k = n + a - b;
      if (k < 1 || k > mAvail) continue;
      if (g[n][a][b] < bestCost) {
        bestCost = g[n][a][b];
        bestAB = [a, b];
      }
    }
  }
  if (!bestAB || bestCost === INF) return null;

  // ---- 反向启发代价 h[j][a][b]：从该状态到任意合法终点的最小剩余代价 ----
  const h: number[][][] = Array.from({ length: n + 1 }, () =>
    Array.from({ length: MAX_MISSING + 1 }, () =>
      new Array<number>(MAX_FALSE + 1).fill(INF),
    ),
  );
  for (let a = 0; a <= MAX_MISSING; a++) {
    for (let b = 0; b <= MAX_FALSE; b++) {
      const k = n + a - b;
      if (k >= 1 && k <= mAvail) h[n][a][b] = 0;
    }
  }
  for (let j = n - 1; j >= 1; j--) {
    for (let a = MAX_MISSING; a >= 0; a--) {
      for (let b = MAX_FALSE; b >= 0; b--) {
        const k = j + a - b;
        if (k < 0 || k > mAvail) continue;
        let best = INF;

        // F → (j+1, a, b+1)，同样禁止作为最后一步
        if (b + 1 <= MAX_FALSE && j + 1 < n) {
          best = Math.min(best, GAP_PENALTY + h[j + 1][a][b + 1]);
        }
        // M → (j+1, a, b)，使用参考偏移 k
        if (k <= mAvail - 1) {
          const ri = refStart + k;
          best = Math.min(
            best,
            Math.abs(sample[j] - ref[ri].width) + h[j + 1][a][b],
          );
        }
        // L → (j, a+1, b)
        if (a + 1 <= MAX_MISSING && k <= mAvail - 1) {
          best = Math.min(best, GAP_PENALTY + h[j][a + 1][b]);
        }
        h[j][a][b] = best;
      }
    }
  }

  // 首步 M 之后必须能以 bestCost 收尾
  const firstEdge = Math.abs(sample[0] - ref[refStart].width);
  if (firstEdge + h[1][0][0] !== bestCost) return null;

  // ---- 贪心重建：每步按 F < L < M 字典序选择仍取得最优代价的操作 ----
  const ops: Op[] = ['M'];
  let j = 1;
  let a = 0;
  let b = 0;
  while (j < n) {
    const k = j + a - b;
    const curG = g[j][a][b];
    let chosen: Op | null = null;

    if (
      b + 1 <= MAX_FALSE &&
      j + 1 < n &&
      curG + GAP_PENALTY + h[j + 1][a][b + 1] === bestCost
    ) {
      chosen = 'F';
    }
    if (
      chosen === null &&
      a + 1 <= MAX_MISSING &&
      k <= mAvail - 1 &&
      curG + GAP_PENALTY + h[j][a + 1][b] === bestCost
    ) {
      chosen = 'L';
    }
    if (chosen === null && k <= mAvail - 1) {
      const ri = refStart + k;
      const edge = Math.abs(sample[j] - ref[ri].width);
      if (curG + edge + h[j + 1][a][b] === bestCost) chosen = 'M';
    }

    if (!chosen) return null; // 理论上不可达
    ops.push(chosen);
    if (chosen === 'F') {
      j += 1;
      b += 1;
    } else if (chosen === 'L') {
      a += 1;
    } else {
      j += 1;
    }
  }

  return { cost: bestCost, ops };
}

function buildCandidate(
  sample: number[],
  ref: RefPoint[],
  refStart: number,
  cost: number,
  ops: Op[],
): Candidate {
  const rows: AlignRow[] = [];
  const missingYears: number[] = [];
  let j = 0; // 已消费样本数
  let k = 0; // 已消费参考偏移
  let matchCount = 0;
  let missingCount = 0;
  let falseCount = 0;
  let currentYear = ref[refStart].year;

  ops.forEach((op, idx) => {
    const step = idx + 1;
    if (op === 'M') {
      const ri = refStart + k;
      const w = Math.abs(sample[j] - ref[ri].width);
      currentYear = ref[ri].year;
      rows.push({
        step,
        year: ref[ri].year,
        sampleIndex: j + 1,
        sampleWidth: sample[j],
        refWidth: ref[ri].width,
        op,
        cost: w,
        missing: false,
        falseRing: false,
      });
      j += 1;
      k += 1;
      matchCount += 1;
    } else if (op === 'L') {
      const ri = refStart + k;
      missingYears.push(ref[ri].year);
      rows.push({
        step,
        year: ref[ri].year,
        sampleIndex: null,
        sampleWidth: null,
        refWidth: ref[ri].width,
        op,
        cost: GAP_PENALTY,
        missing: true,
        falseRing: false,
      });
      k += 1;
      missingCount += 1;
    } else {
      // F：伪轮不计年，行上沿用前一配对年份并明确标注
      rows.push({
        step,
        year: currentYear,
        sampleIndex: j + 1,
        sampleWidth: sample[j],
        refWidth: null,
        op,
        cost: GAP_PENALTY,
        missing: false,
        falseRing: true,
      });
      j += 1;
      falseCount += 1;
    }
  });

  const startYear = ref[refStart].year;
  const endYear = rows.filter((r) => r.op === 'M').slice(-1)[0].year;
  return {
    startYear,
    endYear,
    cost,
    missingCount,
    falseCount,
    matchCount,
    ops,
    rows,
    missingYears,
  };
}

export function crossdate(
  referenceInput: RefPoint[],
  sample: number[],
): CrossdatingResult {
  const reference = normalizeReference(referenceInput);
  if (sample.length < 1) throw new CrossdatingError('样本序列至少需要 1 个轮宽。');
  sample.forEach((w, i) => {
    if (!Number.isInteger(w) || w <= 0) {
      throw new CrossdatingError(`样本第 ${i + 1} 个宽度必须为正整数。`);
    }
  });
  reference.forEach((p) => {
    if (!Number.isInteger(p.width) || p.width <= 0) {
      throw new CrossdatingError(`参考 ${p.year} 年的宽度必须为正整数。`);
    }
  });

  const candidates: Candidate[] = [];
  const minSpan = Math.max(1, sample.length - MAX_MISSING);
  for (let s = 0; s < reference.length; s++) {
    if (reference.length - s < minSpan) break;
    const res = alignFromStart(sample, reference, s);
    if (res) {
      candidates.push(buildCandidate(sample, reference, s, res.cost, res.ops));
    }
  }

  if (candidates.length === 0) {
    throw new CrossdatingError('参考序列长度不足以容纳任何候选对齐（样本过长？）。');
  }

  // 平局：总代价 → 起始年份最早 → 操作序列字典序最小（ASCII：F < L < M）
  candidates.sort((p, q) => {
    if (p.cost !== q.cost) return p.cost - q.cost;
    if (p.startYear !== q.startYear) return p.startYear - q.startYear;
    const po = p.ops.join('');
    const qo = q.ops.join('');
    return po < qo ? -1 : po > qo ? 1 : 0;
  });

  return {
    reference,
    sample,
    candidateCount: candidates.length,
    best: candidates[0],
    candidates,
  };
}
