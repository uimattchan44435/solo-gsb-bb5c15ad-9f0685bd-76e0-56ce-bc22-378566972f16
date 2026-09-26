# 树轮交叉定年工作台（React + TypeScript + Node.js）

录入**已标年份的参考树轮宽度序列**与**待定年的样本宽度序列**（宽度均为正整数），
以参考序列中的每个连续年份作为候选起点，用动态规划求总代价最低的年份对齐，
并逐行展示年份、样本位置、操作与代价，缺轮年份单独标明。支持示例数据与结果 CSV 导出。

## 一条命令启动（Docker）

```bash
docker compose up --build
```

然后浏览器访问：

- **地址：http://localhost:8080**
- 端口：宿主机 **8080** → 容器内 Node 服务 **3001**

容器启动时会自动执行 `npm install` 安装依赖、构建前端并启动服务。
停止：`docker compose down`；如 8080 被占用，修改 `docker-compose.yml` 中端口映射即可。

## 对齐模型

| 操作 | 含义 | 代价 |
| ---- | ---- | ---- |
| `M` 配对 | 样本轮对到一个真实参考年份 | 两轮宽度差的绝对值 |
| `D` 漏记（缺轮） | 某真实年份在样本中缺失，不消耗样本位置 | 100 |
| `F` 伪轮 | 样本中出现不计年的假轮，不占用参考年份 | 100 |

- 漏记、伪轮各最多 **2** 次；样本必须全部被消费，对齐不得越过参考序列边界。
- **起始年份** = 第一条操作所在的参考年份（允许样本以伪轮开头）。
- 平局规则：**总代价最低 → 起始年份最早 → 操作序列字典序最小**（`D < F < M`）。

动态规划在「样本位置 × 参考位置 × 漏记数 × 伪轮数 × 是否已配对」的状态空间上
一次遍历覆盖全部候选起点；操作序列以 Trie + 倍增 LCA 做字典序比较。

## 使用说明

1. 左栏录入参考序列，每行 `年份,宽度`（逗号、空格、Tab 均可分隔），年份须连续递增。
2. 右栏录入样本宽度，每行一个正整数。
3. 点击 **开始定年**；或先点击 **载入示例数据** 再计算。
4. 结果区展示：起始年份、总代价、操作序列、配对/漏记/伪轮计数、逐行明细；
   缺轮行红色高亮，缺轮年份单独列出。
5. 点击 **导出结果 CSV** 下载（带 UTF-8 BOM，Excel 可直接打开）。

内置示例：参考 2000–2020 年；样本真实覆盖 2005–2016 年，其中 **2011 年漏记**、
**样本第 1 轮（宽度 60）为伪轮**。最优结果为起始年份 **2005**，操作序列
`FMMMMMMDMMMMM`（伪轮在前），总代价 **200**。

## 本地开发（不使用 Docker）

要求 Node.js ≥ 20。

```bash
npm install          # 安装依赖
npm run dev          # 同时启动 Node API(3001) 与 Vite 前端(5173)
```

开发模式访问 http://localhost:5173 （`/api` 自动代理到 3001）。

其他命令：

```bash
npm run build        # 构建前端到 dist/
npm start            # 生产模式单端口运行（http://localhost:3001）
npm run test:align   # 核心算法自检（含与朴素穷举的随机交叉验证）
npm run typecheck    # TypeScript 类型检查
```

## API

- `POST /api/align`
  ```json
  {
    "referenceStartYear": 2000,
    "referenceWidths": [120, 95, 143],
    "sampleWidths": [95, 143]
  }
  ```
  返回 `{ "ok": true, "result": { "startYear", "totalCost", "operationSequence", "rows", ... } }`。
- `GET /api/demo`：获取内置示例数据。

## 目录结构

```
shared/           # 前后端共享：动态规划对齐算法、示例数据
server/           # Express API（/api/align、/api/demo），生产模式托管前端
client/           # React + TypeScript 前端
scripts/          # 算法自检脚本
Dockerfile
docker-compose.yml
```
