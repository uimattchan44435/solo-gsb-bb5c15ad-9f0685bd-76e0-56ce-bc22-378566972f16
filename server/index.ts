import express, { Request, Response, NextFunction } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CrossdatingError,
  crossdate,
  parseReference,
  parseSample,
  RefPoint,
} from '../src/lib/engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT ?? 3000);

const app = express();
app.use(express.json({ limit: '1mb' }));

interface CrossdateBody {
  referenceText?: unknown;
  sampleText?: unknown;
  reference?: unknown;
  sample?: unknown;
}

function readSeries(body: CrossdateBody): { reference: RefPoint[]; sample: number[] } {
  if (Array.isArray(body.reference) && Array.isArray(body.sample)) {
    const reference = (body.reference as Array<unknown>).map((p, i) => {
      if (
        !p ||
        typeof p !== 'object' ||
        !Number.isInteger((p as RefPoint).year) ||
        !Number.isInteger((p as RefPoint).width) ||
        (p as RefPoint).width <= 0
      ) {
        throw new CrossdatingError(`参考序列第 ${i + 1} 项必须为 {year: 整数, width: 正整数}`);
      }
      return p as RefPoint;
    });
    const sample = (body.sample as Array<unknown>).map((w, i) => {
      if (!Number.isInteger(w) || (w as number) <= 0) {
        throw new CrossdatingError(`样本第 ${i + 1} 个宽度必须为正整数`);
      }
      return w as number;
    });
    return { reference, sample };
  }
  if (typeof body.referenceText === 'string' && typeof body.sampleText === 'string') {
    return {
      reference: parseReference(body.referenceText),
      sample: parseSample(body.sampleText),
    };
  }
  throw new CrossdatingError('请求体需包含 referenceText / sampleText 字符串。');
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/crossdate', (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = crossdateFromBody(req.body as CrossdateBody);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

function crossdateFromBody(body: CrossdateBody) {
  const { reference, sample } = readSeries(body);
  return crossdate(reference, sample);
}

app.use(
  '/api',
  (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : '服务器内部错误';
    const status = err instanceof CrossdatingError ? 400 : 500;
    res.status(status).json({ error: message });
  },
);

// 生产模式：托管前端静态资源
app.use(express.static(DIST));
app.get('*', (_req, res) => {
  res.sendFile(path.join(DIST, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`树轮交叉定年工作台已启动: http://localhost:${PORT}`);
});
