import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { alignTreeRings } from '../shared/align.ts';
import type { AlignInput } from '../shared/align.ts';
import { DEMO_DATA } from '../shared/demo.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3001);

const app = express();
app.use(express.json({ limit: '1mb' }));

/** 交叉定年计算 */
app.post('/api/align', (req, res) => {
  try {
    const body = req.body as Partial<AlignInput>;
    const input: AlignInput = {
      referenceStartYear: Number(body.referenceStartYear),
      referenceWidths: body.referenceWidths as number[],
      sampleWidths: body.sampleWidths as number[]
    };
    const result = alignTreeRings(input);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(400).json({
      ok: false,
      error: err instanceof Error ? err.message : '计算失败'
    });
  }
});

/** 内置示例数据 */
app.get('/api/demo', (_req, res) => {
  res.json(DEMO_DATA);
});

// 生产模式：托管前端构建产物（SPA 回退到 index.html）
const distDir = path.resolve(__dirname, '../dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res
      .status(200)
      .send('树轮交叉定年工作台 API 运行中。前端开发服务请访问 Vite 端口（默认 5173）。');
  });
}

app.listen(PORT, () => {
  console.log(`树轮交叉定年工作台已启动: http://localhost:${PORT}`);
});
