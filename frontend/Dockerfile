FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
COPY backend/prisma ./backend/prisma
RUN npm ci
COPY frontend ./frontend
ARG NEXT_PUBLIC_API_URL=/api
ARG API_UPSTREAM_URL=http://backend:3001/api/v1
ENV NODE_OPTIONS=--max-old-space-size=768
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} API_UPSTREAM_URL=${API_UPSTREAM_URL} NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w frontend

FROM node:22-alpine
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/frontend/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/frontend/public ./frontend/public
COPY --from=builder --chown=nextjs:nodejs /app/frontend/.next/static ./frontend/.next/static
USER nextjs
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
EXPOSE 3000
CMD ["node", "frontend/server.js"]
