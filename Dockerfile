# Stage 1: Build frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend-react
COPY frontend-react/package.json frontend-react/package-lock.json ./
RUN npm ci
COPY frontend-react/ ./
RUN npm run build

# Stage 2: Production
FROM python:3.12-slim
WORKDIR /app

# Устанавливаем корневые сертификаты Минцифры (Russian Trusted Root CA + Sub CA),
# чтобы TLS-соединения к российским сервисам с сертификатом Минцифры проходили верификацию
# (securepay.tinkoff.ru перешёл на цепочку Минцифры 30.09.2025 — без этих CA aiohttp падает
# c SSLCertVerificationError: self-signed certificate in certificate chain).
COPY docker/ca-certificates/russian_trusted_root_ca.crt /usr/local/share/ca-certificates/russian_trusted_root_ca.crt
COPY docker/ca-certificates/russian_trusted_sub_ca.crt /usr/local/share/ca-certificates/russian_trusted_sub_ca.crt
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY backend-python/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend (includes migrations/)
COPY backend-python/ ./backend-python/

# Copy built frontend
COPY --from=frontend-build /app/frontend-react/dist ./frontend-react/dist

# Create uploads directory
RUN mkdir -p /app/uploads

ENV PORT=8000
ENV NODE_ENV=production

EXPOSE 8000

CMD ["python", "backend-python/run.py"]
