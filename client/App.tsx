import { useState } from 'react';
import type { AlignmentResult } from '../shared/align.ts';
import { parseReference, parseSample } from './parse';
import { downloadCsv } from './csv';

const OP_TEXT: Record<string, string> = {
  M: '配对',
  D: '漏记（缺轮）',
  F: '伪轮'
};

interface AlignResponse {
  ok: boolean;
  result?: AlignmentResult;
  error?: string;
}

export default function App() {
  const [refText, setRefText] = useState('');
  const [sampleText, setSampleText] = useState('');
  const [result, setResult] = useState<AlignmentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadDemo = async () => {
    setError(null);
    try {
      const res = await fetch('/api/demo');
      const demo = await res.json();
      const refLines = demo.referenceWidths.map(
        (w: number, i: number) => `${demo.referenceStartYear + i},${w}`
      );
      setRefText(refLines.join('\n'));
      setSampleText(demo.sampleWidths.join('\n'));
      setResult(null);
    } catch {
      setError('示例数据加载失败，请确认服务已启动。');
    }
  };

  const runAlign = async () => {
    setError(null);
    setResult(null);
    let payload: {
      referenceStartYear: number;
      referenceWidths: number[];
      sampleWidths: number[];
    };
    try {
      const ref = parseReference(refText);
      const sampleWidths = parseSample(sampleText);
      payload = {
        referenceStartYear: ref.startYear,
        referenceWidths: ref.widths,
        sampleWidths
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : '输入解析失败');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/align', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data: AlignResponse = await res.json();
      if (!data.ok || !data.result) {
        setError(data.error ?? '计算失败');
      } else {
        setResult(data.result);
      }
    } catch {
      setError('请求失败，请确认服务已启动。');
    } finally {
      setLoading(false);
    }
  };

  const clearAll = () => {
    setRefText('');
    setSampleText('');
    setResult(null);
    setError(null);
  };

  return (
    <div className="page">
      <header>
        <h1>树轮交叉定年工作台</h1>
        <p className="subtitle">
          动态规划对齐 · 漏记/伪轮各最多 2 次 · 操作罚分 100 · 配对代价为宽度差绝对值
        </p>
      </header>

      <section className="panel">
        <div className="inputs">
          <div className="input-block">
            <label htmlFor="ref-input">
              参考序列（已标年份，每行：年份,宽度）
            </label>
            <textarea
              id="ref-input"
              rows={12}
              placeholder={'2000,120\n2001,95\n2002,143\n…'}
              value={refText}
              onChange={(e) => setRefText(e.target.value)}
            />
          </div>
          <div className="input-block">
            <label htmlFor="sample-input">
              待定年样本宽度（每行一个正整数）
            </label>
            <textarea
              id="sample-input"
              rows={12}
              placeholder={'88\n132\n105\n…'}
              value={sampleText}
              onChange={(e) => setSampleText(e.target.value)}
            />
          </div>
        </div>
        <div className="actions">
          <button onClick={loadDemo}>载入示例数据</button>
          <button className="primary" onClick={runAlign} disabled={loading}>
            {loading ? '计算中…' : '开始定年'}
          </button>
          <button onClick={() => result && downloadCsv(result)} disabled={!result}>
            导出结果 CSV
          </button>
          <button onClick={clearAll}>清空</button>
        </div>
        {error && <div className="error">{error}</div>}
      </section>

      {result && (
        <section className="panel">
          <h2>定年结果</h2>
          <div className="summary">
            <div className="card highlight">
              <div className="card-label">样本起始年份</div>
              <div className="card-value">{result.startYear}</div>
            </div>
            <div className="card">
              <div className="card-label">总代价</div>
              <div className="card-value">{result.totalCost}</div>
            </div>
            <div className="card">
              <div className="card-label">操作序列</div>
              <div className="card-value mono">{result.operationSequence}</div>
            </div>
            <div className="card">
              <div className="card-label">配对 / 漏记 / 伪轮</div>
              <div className="card-value">
                {result.matchedCount} / {result.missingCount} / {result.falseCount}
              </div>
            </div>
          </div>

          {result.missingYears.length > 0 && (
            <div className="missing-banner">
              缺轮年份（样本漏记的真实年份）：
              {result.missingYears.map((y) => (
                <span key={y} className="missing-tag">
                  {y}
                </span>
              ))}
            </div>
          )}
          {result.falsePositions.length > 0 && (
            <div className="false-banner">
              伪轮位置（样本中不计年的轮）：
              {result.falsePositions.map((p) => (
                <span key={p} className="false-tag">
                  第 {p} 轮
                </span>
              ))}
            </div>
          )}

          <table className="result-table">
            <thead>
              <tr>
                <th>行号</th>
                <th>年份</th>
                <th>参考宽度</th>
                <th>样本位置</th>
                <th>样本宽度</th>
                <th>操作</th>
                <th>行代价</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr
                  key={row.row}
                  className={
                    row.operation === 'D'
                      ? 'row-missing'
                      : row.operation === 'F'
                        ? 'row-false'
                        : ''
                  }
                >
                  <td>{row.row}</td>
                  <td>
                    {row.year ?? '—'}
                    {row.missing && <span className="missing-tag">缺轮</span>}
                  </td>
                  <td>{row.referenceWidth ?? '—'}</td>
                  <td>{row.samplePosition ?? '—'}</td>
                  <td>{row.sampleWidth ?? '—'}</td>
                  <td>{OP_TEXT[row.operation]}</td>
                  <td>{row.cost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <footer>
        <p>
          最优规则：总代价最低 → 起始年份最早 → 操作序列字典序最小（D &lt; F &lt; M）。
          对齐起点为第一条操作所在的参考年份。
        </p>
      </footer>
    </div>
  );
}
