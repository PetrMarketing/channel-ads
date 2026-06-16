#!/usr/bin/env bash
# Однострочный деплой на прод. Запускать из директории /home/project/channel-ads
# (или с любым cwd — sh sам перейдёт в свою директорию).
#
# Использование:
#   ./deploy.sh           # обычный деплой
#   ./deploy.sh --hard    # дополнительно подтянуть свежие npm пакеты frontend
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "==> Бэкап .env..."
cp -f backend-python/.env "/root/channel-ads-env.bak.$(date +%Y%m%d-%H%M%S)" 2>/dev/null || true

echo "==> git pull..."
git fetch origin
git pull --ff-only origin main

echo "==> docker-compose up -d --build app..."
docker-compose up -d --build app

echo "==> docker-compose restart rtmp (на случай изменений nginx.conf)..."
docker-compose restart rtmp 2>/dev/null || true

echo "==> Запуск миграций произойдёт автоматически при старте."
sleep 5

echo "==> Проверка хелсчека..."
curl -sI --noproxy '*' http://127.0.0.1:8010/health 2>&1 | head -1

echo "==> Готово. Логи: docker-compose logs -f --tail=100 app"
