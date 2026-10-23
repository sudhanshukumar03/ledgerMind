FROM node:22-alpine AS builder
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
ENV NODE_OPTIONS=--max-old-space-size=512
COPY package.json package-lock.json .npmrc ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
COPY backend/prisma ./backend/prisma
RUN npm ci
COPY backend ./backend
RUN npm run prisma:generate -w backend && NODE_OPTIONS=--max-old-space-size=1024 npm run build -w backend

FROM node:22-alpine
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/backend ./backend
RUN chmod +x backend/docker-entrypoint.sh
USER node
WORKDIR /app/backend
ENV NODE_ENV=production PORT=3001
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 CMD wget -q --spider http://127.0.0.1:3001/api/v1/health || exit 1
ENTRYPOINT ["/app/backend/docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
