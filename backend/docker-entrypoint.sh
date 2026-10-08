#!/bin/sh
set -e

echo "🚀 [LedgerMind Backend] Starting container initialization..."

if [ -n "$DATABASE_URL" ]; then
  echo "📦 [LedgerMind Backend] Synchronizing database schema with Prisma..."
  MAX_RETRIES=15
  COUNT=0
  until npx prisma db push --skip-generate; do
    COUNT=$((COUNT + 1))
    if [ "$COUNT" -ge "$MAX_RETRIES" ]; then
      echo "❌ [LedgerMind Backend] Database connection timed out after $MAX_RETRIES attempts."
      exit 1
    fi
    echo "⏳ Database not ready yet (attempt $COUNT/$MAX_RETRIES). Waiting 2s..."
    sleep 2
  done
  echo "✅ [LedgerMind Backend] Database schema synchronized successfully."
fi

if [ "$SEED_DATABASE" = "true" ]; then
  echo "🌱 [LedgerMind Backend] Seeding demo database..."
  npm run prisma:seed || echo "⚠️ Seeding step completed with warning."
fi

echo "✨ [LedgerMind Backend] Launching NestJS on port ${PORT:-3001}..."
exec "$@"
