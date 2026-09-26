#!/bin/sh
# 容器启动脚本：启动时安装依赖 → 构建前端 → 启动服务
set -e

cd /app

echo "[启动] 安装依赖…"
npm install

if [ "$1" = "start" ]; then
  echo "[启动] 构建前端…"
  npm run build
  echo "[启动] 启动 Node 服务…"
  exec npm start
fi

exec "$@"
