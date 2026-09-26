/**
 * 树轮交叉定年核心算法（前后端共享）
 *
 * 比对模型：
 *   M（正常配对）：样本轮 i 对到参考位置 p，代价 = |样本宽度 − 参考宽度|
 *   D（漏记/缺轮）：参考位置 p 的真实年份样本缺失，不消费样本位置，代价 100
 *   F（伪轮）    ：样本轮为不计年伪轮，不占用参考年份，代价 100
 * D、F 各自最多使用 2 次。
 *
 * 起始年份 = 第一条操作（M 或 F）所在的参考年份；参考序列中每个连续年份都
 * 作为候选起点。样本必须全部消费，对齐不得越过参考序列两端。
 *
 * 最优规则：总代价最低 → 起始年份最早 → 操作序列字典序最小（D < F < M）。
 *
 * 动态规划在「样本位置 × 参考位置 × 漏记数 × 伪轮数 × 是否已有配对」上进行，
 * 一次遍历即可覆盖全部候选起点；操作序列组织成 Trie，用倍增 LCA 做 O(log n)
 * 的字典序比较。
 */

export const GAP_COST = 100;
export const OP_LIMIT = 2;

/** 状态条目数上限（含全部维度），防止极端输入撑爆内存 */
const MAX_ENTRIES = 2_000_000;

/** 操作代码，数值即字典序名次：D(0) < F(1) < M(2) */
export const OP_D = 0;
export const OP_F = 1;
export const OP_M = 2;
export const OP_LABELS = ['D', 'F', 'M'] as const;

export interface AlignInput {
  /** 参考序列起始年份（已标定） */
  referenceStartYear: number;
  /** 参考树轮宽度（正整数），下标 0 对应 referenceStartYear，年份连续 */
  referenceWidths: number[];
  /** 待定年样本宽度（正整数） */
  sampleWidths: number[];
}

export interface AlignmentRow {
  /** 行号（从 1 开始） */
  row: number;
  /** 参考真实年份；伪轮行为 null */
  year: number | null;
  /** 参考轮宽度；伪轮行为 null */
  referenceWidth: number | null;
  /** 样本位置（从 1 开始）；缺轮行为 null */
  samplePosition: number | null;
  /** 样本轮宽度；缺轮行为 null */
  sampleWidth: number | null;
  /** 操作：M 配对 / D 漏记 / F 伪轮 */
  operation: 'M' | 'D' | 'F';
  /** 本行代价 */
  cost: number;
  /** 是否为缺轮（漏记真实年份）行 */
  missing: boolean;
}

export interface AlignmentResult {
  /** 定年结果：样本第一轮（若为伪轮则第一个真实轮）对应的参考年份 */
  startYear: number;
  /** 总代价 */
  totalCost: number;
  /** 操作序列（按对齐顺序） */
  operationSequence: string;
  matchedCount: number;
  missingCount: number;
  falseCount: number;
  /** 缺轮对应的真实年份（升序） */
  missingYears: number[];
  /** 伪轮在样本中的位置（1 起，升序） */
  falsePositions: number[];
  rows: AlignmentRow[];
}

export function validateInput(input: AlignInput): void {
  const { referenceStartYear, referenceWidths, sampleWidths } = input;
  if (
    typeof referenceStartYear !== 'number' ||
    !Number.isInteger(referenceStartYear)
  ) {
    throw new Error('参考序列起始年份必须是整数。');
  }
  if (!Array.isArray(referenceWidths) || referenceWidths.length === 0) {
    throw new Error('参考树轮宽度序列不能为空。');
  }
  if (!Array.isArray(sampleWidths) || sampleWidths.length === 0) {
    throw new Error('样本树轮宽度序列不能为空。');
  }
  const checkWidths = (widths: number[], name: string) => {
    for (const w of widths) {
      if (typeof w !== 'number' || !Number.isInteger(w) || w <= 0) {
        throw new Error(`${name}宽度必须全部为正整数。`);
      }
    }
  };
  checkWidths(referenceWidths, '参考序列');
  checkWidths(sampleWidths, '样本序列');

  const k = OP_LIMIT + 1;
  const entries =
    (referenceWidths.length + 1) * (sampleWidths.length + 1) * k * k * 2;
  if (entries > MAX_ENTRIES) {
    throw new Error(
      `序列过长（动态规划状态数 ${entries} 超过上限 ${MAX_ENTRIES}），请缩短序列。`
    );
  }
}

/**
 * 操作序列 Trie：相同序列共享同一节点（hash-consing），节点 0 为空序列。
 * 借助倍增祖先求 LCA，从而按「首个分歧操作」比较字典序。
 */
class SequenceTrie {
  readonly parent: number[] = [0];
  readonly lastOp: number[] = [-1];
  readonly depth: number[] = [0];
  /** up[t][k]：节点 k 的 2^t 级祖先 */
  readonly up: number[][];
  private readonly interned = new Map<number, number>();

  constructor(maxLen: number) {
    const levels = Math.max(1, Math.floor(Math.log2(maxLen + 1)) + 1);
    // 每层都必须以根节点（根的任意级祖先都是自己）打底，保证 up[t][k]
    // 始终对应节点 k，否则 push 会造成下标错位
    this.up = [];
    for (let t = 0; t < levels; t++) this.up.push([0]);
  }

  append(node: number, op: number): number {
    const key = node * 4 + op;
    const existing = this.interned.get(key);
    if (existing !== undefined) return existing;

    const k = this.parent.length;
    this.parent.push(node);
    this.lastOp.push(op);
    this.depth.push(this.depth[node] + 1);
    this.up[0].push(node);
    for (let t = 1; t < this.up.length; t++) {
      this.up[t].push(this.up[t - 1][this.up[t - 1][k]]);
    }
    this.interned.set(key, k);
    return k;
  }

  private lift(node: number, steps: number): number {
    let k = node;
    let t = 0;
    let s = steps;
    while (s > 0) {
      if (s & 1) k = this.up[t][k];
      s >>>= 1;
      t++;
    }
    return k;
  }

  private lca(a: number, b: number): number {
    if (this.depth[a] < this.depth[b]) b = this.lift(b, this.depth[b] - this.depth[a]);
    else if (this.depth[a] > this.depth[b]) a = this.lift(a, this.depth[a] - this.depth[b]);
    if (a === b) return a;
    for (let t = this.up.length - 1; t >= 0; t--) {
      if (this.up[t][a] !== this.up[t][b]) {
        a = this.up[t][a];
        b = this.up[t][b];
      }
    }
    return this.up[0][a];
  }

  /** 字典序比较：负数 a 小，正数 b 小，0 相同。前缀情形下短序列更小。 */
  compare(a: number, b: number): number {
    if (a === b) return 0;
    const w = this.lca(a, b);
    const da = this.depth[a] - this.depth[w];
    const db = this.depth[b] - this.depth[w];
    if (da === 0) return -1;
    if (db === 0) return 1;
    const nextA = this.lastOp[this.lift(a, da - 1)];
    const nextB = this.lastOp[this.lift(b, db - 1)];
    return nextA < nextB ? -1 : nextA > nextB ? 1 : 0;
  }
}

const INF = Number.POSITIVE_INFINITY;

export function alignTreeRings(input: AlignInput): AlignmentResult {
  validateInput(input);

  const { referenceStartYear, referenceWidths, sampleWidths } = input;
  const n = sampleWidths.length;
  const m = referenceWidths.length;
  const k = OP_LIMIT + 1;
  const P = m + 1;
  const entries = (n + 1) * P * k * k * 2;

  /**
   * 状态 (i,p,d,f,h)：
   *   i 已消费样本轮数；p 下一条 M/D 要消费的参考位置
   *   d 已用漏记；f 已用伪轮；h 是否已经出现过配对 M
   * 下标 = ((((i*P + p)*k + d)*k + f)*2 + h)
   */
  const indexOf = (i: number, p: number, d: number, f: number, h: number): number =>
    ((((i * P + p) * k + d) * k + f) * 2 + h);

  const decode = (s: number): number[] => {
    let r = s;
    const h = r % 2;
    r = (r - h) / 2;
    const fv = r % k;
    r = (r - fv) / k;
    const dv = r % k;
    r = (r - dv) / k;
    const pv = r % P;
    const iv = (r - pv) / P;
    return [iv, pv, dv, fv, h];
  };

  const cost = new Float64Array(entries);
  const seq = new Int32Array(entries);
  const startPos = new Int32Array(entries);
  const prev = new Int32Array(entries);
  const op = new Uint8Array(entries); // 0 不可达 / 1 M / 2 D / 3 F / 4 起步
  cost.fill(INF);
  prev.fill(-1);

  const trie = new SequenceTrie(n + 2 * OP_LIMIT);

  /**
   * 松弛目标状态。平局时保留：代价更低 → 起点更早 → 序列字典序更小。
   * 到达同一状态的两条路径后续转移完全一致，因此该局部剪枝与全局最优一致。
   */
  const relax = (
    target: number,
    newCost: number,
    newSeq: number,
    newStart: number,
    predecessor: number,
    operation: number
  ): void => {
    const oldCost = cost[target];
    if (newCost > oldCost) return;
    if (newCost === oldCost) {
      if (newStart > startPos[target]) return;
      if (newStart === startPos[target] && trie.compare(newSeq, seq[target]) >= 0) {
        return;
      }
    }
    cost[target] = newCost;
    seq[target] = newSeq;
    startPos[target] = newStart;
    prev[target] = predecessor;
    op[target] = operation;
  };

  // 拓扑序递推：i 升序、p 升序
  for (let i = 0; i <= n; i++) {
    for (let p = 0; p <= m; p++) {
      for (let d = 0; d < k; d++) {
        for (let f = 0; f < k; f++) {
          // h=0：从参考位置 p 新开一条对齐（每个候选起点）
          if (i === 0 && d === 0 && f === 0 && p < m) {
            const s0 = indexOf(0, p, 0, 0, 0);
            relax(s0, 0, 0, p, -1, 4);
          }

          for (let h = 0; h < 2; h++) {
            const s = indexOf(i, p, d, f, h);
            if (!Number.isFinite(cost[s])) continue;

            // M：样本轮 i 配参考年份 p
            if (i < n && p < m) {
              const t = indexOf(i + 1, p + 1, d, f, 1);
              relax(
                t,
                cost[s] + Math.abs(sampleWidths[i] - referenceWidths[p]),
                trie.append(seq[s], OP_M),
                startPos[s],
                s,
                1
              );
            }

            // D：漏记参考年份 p。首次配对之前不允许漏记
            //（起步即漏记严格劣于直接从下一年起步）。
            if (p < m && d < OP_LIMIT && h === 1) {
              const t = indexOf(i, p + 1, d + 1, f, h);
              relax(
                t,
                cost[s] + GAP_COST,
                trie.append(seq[s], OP_D),
                startPos[s],
                s,
                2
              );
            }

            // F：样本轮 i 为伪轮，参考位置不动
            if (i < n && f < OP_LIMIT) {
              const t = indexOf(i + 1, p, d, f + 1, h);
              relax(
                t,
                cost[s] + GAP_COST,
                trie.append(seq[s], OP_F),
                startPos[s],
                s,
                3
              );
            }
          }
        }
      }
    }
  }

  // 终点：样本全部消费且至少一次配对（h=1）
  let best = -1;
  for (let p = 1; p <= m; p++) {
    for (let d = 0; d < k; d++) {
      for (let f = 0; f < k; f++) {
        const s = indexOf(n, p, d, f, 1);
        if (!Number.isFinite(cost[s])) continue;
        if (best === -1) {
          best = s;
          continue;
        }
        if (cost[s] < cost[best]) {
          best = s;
        } else if (cost[s] === cost[best]) {
          if (
            startPos[s] < startPos[best] ||
            (startPos[s] === startPos[best] && trie.compare(seq[s], seq[best]) < 0)
          ) {
            best = s;
          }
        }
      }
    }
  }

  if (best === -1) {
    throw new Error('在最多 2 次漏记、2 次伪轮的允许范围内，找不到可行的对齐。');
  }

  return reconstruct(best);

  /** 沿前驱回溯，生成按对齐顺序排列的逐行结果 */
  function reconstruct(goal: number): AlignmentResult {
    interface Step {
      op: number;
      refPos: number | null;
      samplePos: number | null;
    }
    const stepsRev: Step[] = [];

    let cur = goal;
    while (op[cur] !== 4) {
      const [i, p] = decode(cur);
      const operation = op[cur];
      if (operation === 1) {
        // M：父 (i-1, p-1)，消费参考 p-1、样本第 i 轮
        stepsRev.push({ op: OP_M, refPos: p - 1, samplePos: i });
      } else if (operation === 2) {
        // D：父 (i, p-1)，漏记参考 p-1
        stepsRev.push({ op: OP_D, refPos: p - 1, samplePos: null });
      } else {
        // F：父 (i-1, p)，消费样本第 i 轮，无参考年份
        stepsRev.push({ op: OP_F, refPos: null, samplePos: i });
      }
      cur = prev[cur];
    }
    stepsRev.reverse();

    const rows: AlignmentRow[] = [];
    const missingYears: number[] = [];
    const falsePositions: number[] = [];
    let matched = 0;
    let missing = 0;
    let falseCount = 0;
    let totalCost = 0;

    for (const step of stepsRev) {
      if (step.op === OP_M) {
        const rp = step.refPos as number;
        const sp = step.samplePos as number;
        const rowCost = Math.abs(sampleWidths[sp - 1] - referenceWidths[rp]);
        totalCost += rowCost;
        matched++;
        rows.push({
          row: rows.length + 1,
          year: referenceStartYear + rp,
          referenceWidth: referenceWidths[rp],
          samplePosition: sp,
          sampleWidth: sampleWidths[sp - 1],
          operation: 'M',
          cost: rowCost,
          missing: false
        });
      } else if (step.op === OP_D) {
        const rp = step.refPos as number;
        totalCost += GAP_COST;
        missing++;
        missingYears.push(referenceStartYear + rp);
        rows.push({
          row: rows.length + 1,
          year: referenceStartYear + rp,
          referenceWidth: referenceWidths[rp],
          samplePosition: null,
          sampleWidth: null,
          operation: 'D',
          cost: GAP_COST,
          missing: true
        });
      } else {
        const sp = step.samplePos as number;
        totalCost += GAP_COST;
        falseCount++;
        falsePositions.push(sp);
        rows.push({
          row: rows.length + 1,
          year: null,
          referenceWidth: null,
          samplePosition: sp,
          sampleWidth: sampleWidths[sp - 1],
          operation: 'F',
          cost: GAP_COST,
          missing: false
        });
      }
    }

    missingYears.sort((a, b) => a - b);
    falsePositions.sort((a, b) => a - b);

    return {
      startYear: referenceStartYear + startPos[goal],
      totalCost,
      operationSequence: stepsRev.map((s) => OP_LABELS[s.op]).join(''),
      matchedCount: matched,
      missingCount: missing,
      falseCount,
      missingYears,
      falsePositions,
      rows
    };
  }
}
