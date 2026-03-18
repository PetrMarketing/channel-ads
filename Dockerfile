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

# Install Python dependencies
COPY backend-python/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend
COPY backend-python/ ./backend-python/

# Copy built frontend
COPY --from=frontend-build /app/frontend-react/dist ./frontend-react/dist

# Create uploads directory
RUN mkdir -p /app/uploads

ENV PORT=8000
ENV NODE_ENV=production

EXPOSE 8000

CMD ["python", "backend-python/run.py"]
