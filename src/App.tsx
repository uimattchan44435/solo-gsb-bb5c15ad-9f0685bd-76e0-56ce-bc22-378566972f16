import { useState } from 'react';
import {
  AlignRow,
  Candidate,
  CrossdatingResult,
  Op,
} from './lib/engine';
import { EXAMPLE_REFERENCE, EXAMPLE_SAMPLE } from './lib/example';
import { buildCsv, downloadCsv } from './lib/csv';

const OP_LABEL: Record<Op, string> = {
  M: '配对',
  L: '缺轮',
  F: '伪轮',
};

export function App() {
  const [referenceText, setReferenceText] = useState('');
  const [sampleText, setSampleText] = useState('');
  const [result, setResult] = useState<CrossdatingResult | null>(null);
  const [selectedStart, setSelectedStart] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadExample = () => {
    setReferenceText(EXAMPLE_REFERENCE);
    setSampleText(EXAMPLE_SAMPLE);
    setResult(null);
    setError(null);
    setSelectedStart(null);
  };

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch('/api/crossdate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referenceText, sampleText }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error ?? `请求失败（${resp.status}）`);
      }
      setResult(data as CrossdatingResult);
      setSelectedStart(data.best.startYear);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const selected: Candidate | null =
    result && selectedStart !== null
      ? result.candidates.find((c) => c.startYear === selectedStart) ??
        result.best
      : null;

  const exportCsv = () => {
    if (!result || !selected) return;
    const tag = `start${selected.startYear}`;
    downloadCsv(`crossdating_${tag}.csv`, buildCsv(selected));
  };

  return (
    <div className="page">
      <header>
        <h1>树轮交叉定年工作台</h1>
        <p className="subtitle">
          参考序列连续年份为候选起点，动态规划对齐 · 缺轮/伪轮各至多 2
          次，每次罚分 100，配对代价为两轮宽度差绝对值
        </p>
      </header>

      <section className="inputs">
        <div className="panel">
          <h2>参考序列（已标年份）</h2>
          <p className="hint">每行：年份,宽度（逗号/空格/Tab 分隔），年份必须连续，宽度为正整数</p>
          <textarea
            value={referenceText}
            onChange={(e) => setReferenceText(e.target.value)}
            placeholder={'1990,42\n1991,58\n1992,35'}
            rows={14}
          />
        </div>
        <div className="panel">
          <h2>样本序列（待定年）</h2>
          <p className="hint">每行一个轮宽（正整数），也支持「序号,宽度」</p>
          <textarea
            value={sampleText}
            onChange={(e) => setSampleText(e.target.value)}
            placeholder={'86\n33\n64'}
            rows={14}
          />
        </div>
      </section>

      <section className="controls">
        <button onClick={loadExample}>载入示例数据</button>
        <button className="primary" onClick={run} disabled={loading}>
          {loading ? '计算中…' : '开始交叉定年'}
        </button>
        <button onClick={exportCsv} disabled={!selected}>
          导出结果 CSV
        </button>
      </section>

      {error && <div className="error">⚠ {error}</div>}

      {result && selected && (
        <section className="results">
          <div className="summary">
            <div className="card highlight">
              <div className="card-label">最优起始年份</div>
              <div className="card-value">{result.best.startYear}</div>
              <div className="card-sub">结束于 {result.best.endYear} 年</div>
            </div>
            <div className="card">
              <div className="card-label">最低总代价</div>
              <div className="card-value">{result.best.cost}</div>
              <div className="card-sub">
                配对差和 {result.best.cost - 100 * (result.best.missingCount + result.best.falseCount)}
                {' '}+ 罚分 {100 * (result.best.missingCount + result.best.falseCount)}
              </div>
            </div>
            <div className="card">
              <div className="card-label">配对 / 缺轮 / 伪轮</div>
              <div className="card-value">
                {result.best.matchCount} / {result.best.missingCount} /{' '}
                {result.best.falseCount}
              </div>
              <div className="card-sub">
                操作序列 {result.best.ops.join('')}
              </div>
            </div>
            <div className="card">
              <div className="card-label">缺轮年份</div>
              <div className="card-value">
                {result.best.missingYears.length
                  ? result.best.missingYears.join(', ')
                  : '无'}
              </div>
              <div className="card-sub">
                共评估 {result.candidateCount} 个候选起点
              </div>
            </div>
          </div>

          <h2>候选起点排名（前 10）</h2>
          <p className="hint">
            平局规则：总代价最低 → 起始年份最早 → 操作序列字典序最小（F &lt; L
            &lt; M）
          </p>
          <table className="rank-table">
            <thead>
              <tr>
                <th>名次</th>
                <th>起始年份</th>
                <th>结束年份</th>
                <th>总代价</th>
                <th>配对</th>
                <th>缺轮</th>
                <th>伪轮</th>
                <th>操作序列</th>
              </tr>
            </thead>
            <tbody>
              {result.candidates.slice(0, 10).map((c, i) => (
                <tr
                  key={c.startYear}
                  className={c.startYear === selected.startYear ? 'selected' : ''}
                  onClick={() => setSelectedStart(c.startYear)}
                >
                  <td>{i + 1}</td>
                  <td>{c.startYear}</td>
                  <td>{c.endYear}</td>
                  <td>{c.cost}</td>
                  <td>{c.matchCount}</td>
                  <td className={c.missingCount ? 'op-L' : ''}>
                    {c.missingCount}
                    {c.missingCount ? `（${c.missingYears.join(',')}）` : ''}
                  </td>
                  <td className={c.falseCount ? 'op-F' : ''}>{c.falseCount}</td>
                  <td className="mono">{c.ops.join('')}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2>
            对齐明细
            {selected.startYear === result.best.startYear
              ? '（最优）'
              : `（候选起点 ${selected.startYear}）`}
          </h2>
          <div className="legend">
            <span className="badge op-M">M 正常配对</span>
            <span className="badge op-L">L 缺轮：参考推进、样本不消费</span>
            <span className="badge op-F">F 伪轮：样本消费、不计年</span>
          </div>
          <table className="align-table">
            <thead>
              <tr>
                <th>#</th>
                <th>参考年份</th>
                <th>样本位置</th>
                <th>样本宽度</th>
                <th>参考宽度</th>
                <th>操作</th>
                <th>本行代价</th>
                <th>累计代价</th>
              </tr>
            </thead>
            <tbody>
              {selected.rows.map((r, i) => (
                <Row key={r.step} row={r} cumul={cumulative(selected.rows, i)} />
              ))}
              <tr className="total">
                <td colSpan={6}>总代价</td>
                <td>{selected.cost}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </section>
      )}

      <footer>
        罚分 100/次 · 缺轮与伪轮各不超过 2 · 首尾操作强制为正常配对
      </footer>
    </div>
  );
}

function cumulative(rows: AlignRow[], idx: number): number {
  let s = 0;
  for (let i = 0; i <= idx; i++) s += rows[i].cost;
  return s;
}

function Row({ row, cumul }: { row: AlignRow; cumul: number }) {
  return (
    <tr className={`row-${row.op}${row.missing ? ' is-missing' : ''}`}>
      <td>{row.step}</td>
      <td>
        {row.year}
        {row.falseRing && <span className="tag">不计年</span>}
        {row.missing && <span className="tag tag-L">缺轮年份</span>}
      </td>
      <td>{row.sampleIndex ?? '—'}</td>
      <td>{row.sampleWidth ?? '—'}</td>
      <td>{row.refWidth ?? '—'}</td>
      <td>
        <span className={`badge op-${row.op}`}>
          {row.op} {OP_LABEL[row.op]}
        </span>
      </td>
      <td>{row.cost}</td>
      <td>{cumul}</td>
    </tr>
  );
}
