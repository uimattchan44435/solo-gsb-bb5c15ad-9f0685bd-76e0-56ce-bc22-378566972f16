FROM node:20-bookworm-slim

WORKDIR /app

# 先拷贝依赖清单，利用构建缓存
COPY package.json package-lock.json* ./

# 拷贝全部源码
COPY . .

# 容器启动时安装依赖、构建并启动服务
RUN chmod +x docker-entrypoint.sh
EXPOSE 3000
CMD ["./docker-entrypoint.sh"]
