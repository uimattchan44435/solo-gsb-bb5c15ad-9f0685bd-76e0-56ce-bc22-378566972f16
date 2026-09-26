# 树轮交叉定年工作台 —— 单容器镜像
# 启动时安装依赖（npm install 在 entrypoint 中执行）
FROM node:20-bookworm-slim

WORKDIR /app

# 仅复制清单，便于利用构建缓存；依赖在容器启动时安装（见 entrypoint）
COPY package.json package-lock.json* ./
COPY tsconfig.json vite.config.ts index.html ./
COPY shared ./shared
COPY server ./server
COPY client ./client
COPY scripts ./scripts

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3001

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["start"]
