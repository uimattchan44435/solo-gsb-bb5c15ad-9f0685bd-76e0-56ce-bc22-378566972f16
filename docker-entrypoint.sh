#!/bin/sh
set -e

echo "[entrypoint] 安装依赖（npm install）..."
npm install --no-audit --no-fund

echo "[entrypoint] 构建前端（vite build）..."
npm run build

echo "[entrypoint] 启动 Node 服务..."
exec npm start
