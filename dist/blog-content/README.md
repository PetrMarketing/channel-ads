# Дамп контента блога

Срез базы блога на момент коммита: **31 статья** (11 published, 20 drafts),
**69 скриншотов** (~41 МБ), **6 категорий**, **228 русских подсказок** для
будущих скринов.

## Файлы

- `blog-data.sql` — INSERT'ы для 4 таблиц: blog_categories, blog_articles,
  blog_screenshots, blog_screenshot_hints
- `uploads/` — 69 PNG/JPG, имена соответствуют записям в `blog_screenshots.file_url`
- `screenshot-files.txt` — плоский список имён файлов

## Установка на новой/чистой инсталляции

```bash
# 1. Подтяни код (создаст таблицы автоматически через миграции 069/070/071)
git pull origin main
docker-compose up -d --build app

# 2. Если на проде уже были блог-данные — обнули, иначе пропусти
docker exec -i channel-ads-db psql -U channel_ads -d channel_ads -c \
  "TRUNCATE blog_articles, blog_categories, blog_screenshots, blog_screenshot_hints RESTART IDENTITY CASCADE;"

# 3. Залей данные
docker exec -i channel-ads-db psql -U channel_ads -d channel_ads \
  < dist/blog-content/blog-data.sql
# Должно вывести: INSERT 0 6, INSERT 0 31, INSERT 0 69, INSERT 0 228

# 4. Скопируй файлы скринов в /uploads контейнера
docker cp dist/blog-content/uploads/. channel-ads:/app/uploads/

# 5. Проверь
curl https://max.pkmarketing.ru/api/blog/articles?limit=20 | jq '.total'
# должно быть 11

curl -I https://max.pkmarketing.ru/uploads/8a58f33d923de0631880d71f77f80df2.png
# 200 OK
```

После этого:
- `https://max.pkmarketing.ru/blog` — список из 11 статей
- `https://max.pkmarketing.ru/promo` — блок «Свежее в блоге»
- `https://max.pkmarketing.ru/` — карусель «Свежее в блоге» в Обзоре

## Что НЕ переносится

- `blog_views` — статистика просмотров (накопится свежая)
- `blog_cta_clicks` — клики по кнопке (накопятся свежие)
- `users.blog_referrer_slug` — атрибуция регистраций из блога

Эти 3 поля живут только на конкретной инсталляции и со временем накапливаются заново.

## Обновление дампа

```bash
# На дев-машине после изменений в админке:
docker exec channel-ads-db pg_dump -U channel_ads -d channel_ads \
  --data-only --column-inserts --no-owner --no-privileges \
  -t blog_categories -t blog_articles -t blog_screenshots -t blog_screenshot_hints \
  > dist/blog-content/blog-data.sql

# Если добавились новые скриншоты — пересобрать uploads/:
docker exec channel-ads-db psql -U channel_ads -d channel_ads -t -A -c \
  "SELECT replace(file_url, '/uploads/', '') FROM blog_screenshots WHERE file_url LIKE '/uploads/%';" \
  > dist/blog-content/screenshot-files.txt
mkdir -p dist/blog-content/uploads
while read f; do docker cp "channel-ads:/app/uploads/$f" "dist/blog-content/uploads/$f"; done \
  < dist/blog-content/screenshot-files.txt

git add dist/blog-content && git commit -m "blog content snapshot"
```
