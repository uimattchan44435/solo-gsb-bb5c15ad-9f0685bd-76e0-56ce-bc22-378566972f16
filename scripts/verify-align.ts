/**
 * 核心算法自检脚本：npm run test:align
 * 1) 示例数据：期望起点 2005、序列 FMMMMMMDMMMMM、总代价 200
 * 2) 全等宽度：纯配对 0 代价最优；样本更长时平局取最早起点、字典序最小序列
 * 3) 与独立的记忆化穷举实现交叉验证（含示例数据与随机小样本）
 */
import { alignTreeRings, GAP_COST, OP_LIMIT } from '../shared/align.ts';
import { DEMO_DATA } from '../shared/demo.ts';
import type { AlignInput, AlignmentResult } from '../shared/align.ts';

let failures = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(
      `  ✗ ${name}\n    期望: ${JSON.stringify(expected)}\n    实际: ${JSON.stringify(actual)}`
    );
  }
}

// ---------- 用例 1：示例数据 ----------
console.log('用例 1：内置示例数据');
const demo = alignTreeRings(DEMO_DATA);
check('起始年份', demo.startYear, 2005);
check('操作序列', demo.operationSequence, 'FMMMMMMDMMMMM');
check('总代价', demo.totalCost, 200);
check('缺轮年份', demo.missingYears, [2011]);
check('伪轮位置', demo.falsePositions, [1]);
check('配对数', demo.matchedCount, 11);
check('行数', demo.rows.length, 13);

// ---------- 用例 2：全等宽度 ----------
console.log('用例 2：全等宽度');
const exact = alignTreeRings({
  referenceStartYear: 2000,
  referenceWidths: [5, 5, 5, 5, 5, 5],
  sampleWidths: [5, 5, 5]
});
check('纯配对起始年份', exact.startYear, 2000);
check('纯配对操作序列', exact.operationSequence, 'MMM');
check('纯配对总代价', exact.totalCost, 0);

const tie = alignTreeRings({
  referenceStartYear: 2000,
  referenceWidths: [5, 5, 5],
  sampleWidths: [5, 5, 5, 5]
});
check('平局起始年份', tie.startYear, 2000);
check('平局操作序列（字典序最小）', tie.operationSequence, 'FMMM');
check('平局总代价', tie.totalCost, GAP_COST);

// ---------- 用例 3：与独立穷举实现交叉验证 ----------
console.log('用例 3：与记忆化穷举交叉验证');

/**
 * 独立实现：固定每个候选起点，自顶向下记忆化 DFS，
 * 直接按 (代价, 起点, 操作序列字符串) 规则比较。
 */
function bruteForce(input: AlignInput): {
  cost: number;
  startYear: number;
  ops: string;
} {
  const { referenceStartYear, referenceWidths, sampleWidths } = input;
  const n = sampleWidths.length;
  const m = referenceWidths.length;

  let best: { cost: number; start: number; ops: string } | null = null;

  for (let s = 0; s < m; s++) {
    // memo[(i,p,d,f,hasM)] = 该状态下的最小剩余代价；序列另行比较
    const memo = new Map<string, { cost: number; ops: string } | null>();

    const solve = (
      i: number,
      p: number,
      d: number,
      f: number,
      hasM: boolean
    ): { cost: number; ops: string } | null => {
      if (i === n) return hasM ? { cost: 0, ops: '' } : null;
      const key = `${i},${p},${d},${f},${hasM ? 1 : 0}`;
      if (memo.has(key)) return memo.get(key) ?? null;

      let bestSuffix: { cost: number; ops: string } | null = null;
      const offer = (cand: { cost: number; ops: string } | null) => {
        if (cand === null) return;
        if (
          bestSuffix === null ||
          cand.cost < bestSuffix.cost ||
          (cand.cost === bestSuffix.cost && cand.ops < bestSuffix.ops)
        ) {
          bestSuffix = cand;
        }
      };

      if (p < m) {
        const sub = solve(i + 1, p + 1, d, f, true);
        if (sub) {
          offer({
            cost: Math.abs(sampleWidths[i] - referenceWidths[p]) + sub.cost,
            ops: 'M' + sub.ops
          });
        }
        if (d < OP_LIMIT && hasM) {
          const subD = solve(i, p + 1, d + 1, f, hasM);
          if (subD) offer({ cost: GAP_COST + subD.cost, ops: 'D' + subD.ops });
        }
      }
      if (f < OP_LIMIT) {
        const subF = solve(i + 1, p, d, f + 1, hasM);
        if (subF) offer({ cost: GAP_COST + subF.cost, ops: 'F' + subF.ops });
      }

      memo.set(key, bestSuffix);
      return bestSuffix;
    };

    const cand = solve(0, s, 0, 0, false);
    if (cand === null) continue;
    if (
      best === null ||
      cand.cost < best.cost ||
      (cand.cost === best.cost &&
        (s < best.start || (s === best.start && cand.ops < best.ops)))
    ) {
      best = { cost: cand.cost, start: s, ops: cand.ops };
    }
  }

  if (best === null) throw new Error('穷举未找到可行对齐');
  const b: { cost: number; start: number; ops: string } = best;
  return { cost: b.cost, startYear: referenceStartYear + b.start, ops: b.ops };
}

function crossCheck(name: string, input: AlignInput): void {
  const dp: AlignmentResult = alignTreeRings(input);
  const bf = bruteForce(input);
  const ok =
    dp.totalCost === bf.cost &&
    dp.startYear === bf.startYear &&
    dp.operationSequence === bf.ops;
  if (ok) {
    console.log(`  ✓ ${name}（代价 ${bf.cost}，起点 ${bf.startYear}，序列 ${bf.ops}）`);
  } else {
    failures++;
    console.error(
      `  ✗ ${name}\n    DP:  (${dp.startYear}, ${dp.totalCost}, ${dp.operationSequence})\n    穷举: (${bf.startYear}, ${bf.cost}, ${bf.ops})`
    );
  }
}

crossCheck('示例数据', DEMO_DATA);

let seed = 42;
const rand = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

let allOk = true;
for (let t = 0; t < 60; t++) {
  const m = 4 + Math.floor(rand() * 6);
  const n = 2 + Math.floor(rand() * 5);
  const widths = (len: number) =>
    Array.from({ length: len }, () => 1 + Math.floor(rand() * 6));
  const input: AlignInput = {
    referenceStartYear: 1900,
    referenceWidths: widths(m),
    sampleWidths: widths(n)
  };
  const dp = alignTreeRings(input);
  const bf = bruteForce(input);
  if (
    dp.totalCost !== bf.cost ||
    dp.startYear !== bf.startYear ||
    dp.operationSequence !== bf.ops
  ) {
    allOk = false;
    failures++;
    console.error(
      `  ✗ 随机样本 #${t}: ${JSON.stringify(input)}\n    DP:  (${dp.startYear}, ${dp.totalCost}, ${dp.operationSequence})\n    穷举: (${bf.startYear}, ${bf.cost}, ${bf.ops})`
    );
  }
}
if (allOk) console.log('  ✓ 60 组随机小样本与穷举结果一致');

// ---------- 用例 4：边界情形与输入校验 ----------
console.log('用例 4：边界情形与输入校验');

// 样本比参考长很多：至少需要 n-m 个伪轮，超过 2 即不可行
let infeasible = false;
try {
  alignTreeRings({
    referenceStartYear: 2000,
    referenceWidths: [1, 2, 3],
    sampleWidths: [1, 2, 3, 4, 5, 6]
  });
} catch (e) {
  infeasible = e instanceof Error && e.message.includes('找不到可行');
}
check('超出伪轮上限应报错', infeasible, true);

for (const bad of [
  { referenceStartYear: 2000, referenceWidths: [], sampleWidths: [1] },
  { referenceStartYear: 2000, referenceWidths: [1], sampleWidths: [] },
  { referenceStartYear: 2000, referenceWidths: [0, 2], sampleWidths: [1] },
  { referenceStartYear: 2000, referenceWidths: [1, -2], sampleWidths: [1] },
  { referenceStartYear: 2000, referenceWidths: [1.5, 2], sampleWidths: [1] }
]) {
  let threw = false;
  try {
    alignTreeRings(bad as AlignInput);
  } catch {
    threw = true;
  }
  check(`非法输入应报错: ${JSON.stringify(bad.referenceWidths)}`, threw, true);
}

// 大量随机交叉验证（更多平局机会）
let seed2 = 7;
const rand2 = () => {
  seed2 = (seed2 * 1664525 + 1013904223) % 4294967296;
  return seed2 / 4294967296;
};

let allOk2 = true;
for (let t = 0; t < 200; t++) {
  const m = 3 + Math.floor(rand2() * 8);
  const n = Math.max(1, m - 4 + Math.floor(rand2() * 9));
  const widthRange = 1 + Math.floor(rand2() * 3); // 宽度取值 1..3，平局密集
  const widths = (len: number) =>
    Array.from({ length: len }, () => 1 + Math.floor(rand2() * widthRange));
  const input: AlignInput = {
    referenceStartYear: 1850,
    referenceWidths: widths(m),
    sampleWidths: widths(n)
  };
  try {
    const dp = alignTreeRings(input);
    const bf = bruteForce(input);
    if (
      dp.totalCost !== bf.cost ||
      dp.startYear !== bf.startYear ||
      dp.operationSequence !== bf.ops
    ) {
      allOk2 = false;
      failures++;
      console.error(
        `  ✗ 随机样本 #${t}: ${JSON.stringify(input)}\n    DP:  (${dp.startYear}, ${dp.totalCost}, ${dp.operationSequence})\n    穷举: (${bf.startYear}, ${bf.cost}, ${bf.ops})`
      );
    }
  } catch (e) {
    // DP 报“不可行”时，穷举也应当找不到
    let bfInfeasible = false;
    try {
      bruteForce(input);
    } catch {
      bfInfeasible = true;
    }
    if (!bfInfeasible) {
      allOk2 = false;
      failures++;
      console.error(`  ✗ 随机样本 #${t} DP 误报不可行: ${JSON.stringify(input)} ${e}`);
    }
  }
}
if (allOk2) console.log('  ✓ 200 组随机样本（平局密集）与穷举结果一致');

if (failures > 0) {
  console.error(`\n${failures} 项检查失败`);
  process.exit(1);
}
console.log('\n全部检查通过');
