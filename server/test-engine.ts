import { crossdate, parseReference, parseSample } from '../src/lib/engine.js';

const EX_REF = `1990,42
1991,58
1992,35
1993,71
1994,49
1995,86
1996,33
1997,64
1998,27
1999,78
2000,41
2001,12
2002,198
2003,15
2004,30
2005,83
2006,46
2007,60
2008,25
2009,74
2010,52`;

const EX_SAMPLE = `86
33
64
27
78
41
150
12
198
30
83
46
60
25`;

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fail += 1;
    console.error(`  ✗ ${name} ${detail}`);
  }
}

// --- 1. 示例数据：真实区间 1995–2008，2003 缺轮，第 7 轮为伪轮 ---
{
  const ref = parseReference(EX_REF);
  const sample = parseSample(EX_SAMPLE);
  const r = crossdate(ref, sample);
  check('示例-最优起始年为 1995', r.best.startYear === 1995, `实际 ${r.best.startYear}`);
  check('示例-结束年为 2008', r.best.endYear === 2008);
  check('示例-总代价 200（1 缺 + 1 伪，宽度全吻合）', r.best.cost === 200, `实际 ${r.best.cost}`);
  check('示例-缺轮年份 [2003]', JSON.stringify(r.best.missingYears) === '[2003]');
  check('示例-配对数 13', r.best.matchCount === 13);
  check('示例-首末操作均为 M', r.best.ops[0] === 'M' && r.best.ops[r.best.ops.length - 1] === 'M');
  check('示例-操作序列合法', validOps(r.best.ops, sample.length));
  let acc = 0;
  for (const row of r.best.rows) acc += row.cost;
  check('示例-逐行代价之和等于总代价', acc === r.best.cost);
  console.log('    ops =', r.best.ops.join(''));
}

// --- 2. 完全吻合，无缺轮无伪轮 ---
{
  const ref = parseReference('2000,10\n2001,20\n2002,30\n2003,40');
  const sample = parseSample('10\n20\n30');
  const r = crossdate(ref, sample);
  check('吻合-起始 2000', r.best.startYear === 2000);
  check('吻合-代价 0', r.best.cost === 0);
  check('吻合-序列 MMM', r.best.ops.join('') === 'MMM');
}

// --- 3. 含 1 个缺轮：样本对应 2000,2002（错配代价 170 > 罚分 100） ---
{
  const ref = parseReference('2000,10\n2001,200\n2002,30');
  const sample = parseSample('10\n30');
  const r = crossdate(ref, sample);
  check('缺轮-起始 2000', r.best.startYear === 2000);
  check('缺轮-代价 100', r.best.cost === 100, `实际 ${r.best.cost}`);
  check('缺轮-序列 MLM', r.best.ops.join('') === 'MLM');
  check('缺轮年份为 2001', JSON.stringify(r.best.missingYears) === '[2001]');
}

// --- 4. 含 1 个伪轮：样本第二轮是假的 ---
{
  const ref = parseReference('2000,10\n2001,20\n2002,30');
  const sample = parseSample('10\n77\n20\n30');
  const r = crossdate(ref, sample);
  check('伪轮-起始 2000', r.best.startYear === 2000);
  check('伪轮-代价 100', r.best.cost === 100);
  check('伪轮-序列 MFMM', r.best.ops.join('') === 'MFMM', r.best.ops.join(''));
}

// --- 5. 平局：起始年份最早优先 ---
{
  // 参考周期性数据，多个起点代价相同
  const ref = parseReference('2000,5\n2001,5\n2002,5\n2003,5');
  const sample = parseSample('5\n5');
  const r = crossdate(ref, sample);
  check('平局-取最早起点 2000', r.best.startYear === 2000);
  check('平局-代价 0', r.best.cost === 0);
}

// --- 6. 同起点同代价：F 路径（MFMM，170）与 L 路径（MMLMM，170）平局，取字典序 F<L ---
{
  // 2000 起点：
  //   MFMM  = M(0) F(100) M(s2↔r1=0) M(s3↔r2=70)                          = 170
  //   MMLMM = M(0) M(s1↔r1=50) L(100) M(s2↔r3=0) M(s3↔r4=20)             = 170
  const ref = parseReference('2000,10\n2001,200\n2002,80\n2003,200\n2004,30');
  const sample = parseSample('10\n150\n200\n10');
  const r = crossdate(ref, sample);
  for (const c of r.candidates.slice(0, 6)) {
    console.log(`    start=${c.startYear} cost=${c.cost} ops=${c.ops.join('')}`);
  }
  check('字典序-起始 2000', r.best.startYear === 2000);
  check('字典序-总代价 170', r.best.cost === 170, `实际 ${r.best.cost}`);
  check('字典序-取 F 路径 MFMM', r.best.ops.join('') === 'MFMM', r.best.ops.join(''));
  // 同一 2000 起点的 L 路径 MMLMM 手工核算同为 170（M0 + M50 + L100 + M0 + M20），
  // API 只保留字典序最小者，故返回 MFMM（"MFMM" < "MMLMM"）。
  const fCost = 0 + 100 + Math.abs(200 - 200) + Math.abs(10 - 80);
  const lCost = 0 + Math.abs(150 - 200) + 100 + Math.abs(200 - 200) + Math.abs(10 - 30);
  check('字典序-F/L 两条路径手工核算同分 170', fCost === 170 && lCost === 170);
  check('字典序-MFMM 确实小于 MMLMM', 'MFMM' < 'MMLMM');
}

// --- 7. 硬错配代价高于罚分：最优为连续 2 个缺轮（达到上限） ---
{
  // n=3 需 3 个配对，含 2 个缺轮 ⇒ 操作 MLLMM，跨度 5 个真实年份
  const ref = parseReference('2000,10\n2001,250\n2002,210\n2003,300\n2004,20');
  const sample = parseSample('10\n300\n20');
  const r = crossdate(ref, sample);
  const c0 = r.candidates.find((c) => c.startYear === 2000);
  check('上限-2000 起点最优为 MLLMM 罚 200', c0 !== undefined && c0.cost === 200 && c0.ops.join('') === 'MLLMM',
    c0 ? `${c0.cost} ${c0.ops.join('')}` : '无该候选');
  check('上限-缺轮年份 [2001,2002]', c0 !== undefined && JSON.stringify(c0.missingYears) === '[2001,2002]');
  check('上限-该方案为全局最优', r.best.startYear === 2000 && r.best.cost === 200,
    `实际 start=${r.best.startYear} cost=${r.best.cost}`);
}

// --- 8. 缺轮年份在行表中标注 ---
{
  const ref = parseReference('2000,10\n2001,200\n2002,30');
  const sample = parseSample('10\n30');
  const r = crossdate(ref, sample);
  const missingRows = r.best.rows.filter((x) => x.missing);
  check('行表-恰好 1 行缺轮', missingRows.length === 1);
  check(
    '行表-缺轮行年份 2001 且样本位置为空',
    missingRows[0] !== undefined &&
      missingRows[0].year === 2001 &&
      missingRows[0].sampleIndex === null &&
      missingRows[0].sampleWidth === null &&
      missingRows[0].cost === 100,
  );
  const falseRows = r.best.rows.filter((x) => x.falseRing);
  check('行表-无伪轮行', falseRows.length === 0);
}

// --- 9. 暴力枚举对照：小规模下 DP 结果必须与全枚举一致 ---
{
  function brute(refW: number[], sampleW: number[]) {
    const n = sampleW.length;
    const bestByStart = new Map<number, { cost: number; ops: string }>();
    for (let s = 0; s < refW.length; s++) {
      let best: { cost: number; ops: string } | null = null;
      const walk = (j: number, k: number, a: number, b: number, cost: number, seq: string) => {
        if (j === n) {
          if (seq.endsWith('M') && k >= 1) {
            if (!best || cost < best.cost || (cost === best.cost && seq < best.ops)) {
              best = { cost, ops: seq };
            }
          }
          return;
        }
        if (s + k >= refW.length) return;
        walk(j + 1, k + 1, a, b, cost + Math.abs(sampleW[j] - refW[s + k]), seq + 'M');
        if (a < 2) walk(j, k + 1, a + 1, b, cost + 100, seq + 'L');
        if (b < 2 && j + 1 < n) walk(j + 1, k, a, b + 1, cost + 100, seq + 'F');
      };
      walk(1, 1, 0, 0, Math.abs(sampleW[0] - refW[s]), 'M');
      if (best) bestByStart.set(s, best);
    }
    return bestByStart;
  }

  let mismatch = 0;
  for (let seed = 0; seed < 500; seed++) {
    let x = seed * 1103515245 + 12345;
    const rnd = () => {
      x = (x * 1103515245 + 12345) & 0x7fffffff;
      return x % 100;
    };
    const refW = Array.from({ length: 4 + (seed % 5) }, () => 1 + (rnd() % 30));
    const sampleW = Array.from({ length: 2 + (seed % 3) }, () => 1 + (rnd() % 30));
    const ref = refW.map((w, i) => ({ year: 2000 + i, width: w }));
    const r = crossdate(ref, sampleW);
    const bruteMap = brute(refW, sampleW);
    for (const [sIdx, b] of bruteMap) {
      const cand = r.candidates.find((c) => c.startYear === 2000 + sIdx);
      if (!cand || cand.cost !== b.cost || cand.ops.join('') !== b.ops) {
        mismatch += 1;
        if (mismatch <= 5) {
          console.error(
            `    seed=${seed} start=${2000 + sIdx} DP=`,
            cand ? `${cand.cost}/${cand.ops.join('')}` : 'none',
            'brute=', `${b.cost}/${b.ops}`,
          );
        }
      }
    }
  }
  check('暴力对照-500 组随机小序列 DP 与全枚举完全一致', mismatch === 0, `${mismatch} 处不一致`);
}

function validOps(ops: string[], n: number): boolean {
  let j = 0;
  let a = 0;
  let b = 0;
  for (const op of ops) {
    if (op === 'M') { j += 1; }
    if (op === 'L') { a += 1; }
    if (op === 'F') { j += 1; b += 1; }
  }
  return j === n && a <= 2 && b <= 2 && ops[0] === 'M' && ops[ops.length - 1] === 'M';
}

console.log(`\n${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
