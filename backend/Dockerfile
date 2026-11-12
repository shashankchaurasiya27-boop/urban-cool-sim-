FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app

WORKDIR /app

# Install system build dependencies for scientific/ML and PostgreSQL
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgomp1 \
    libpq-dev \
    libexpat1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

COPY . .

RUN sed -i 's/\r$//' start.sh && \
    chmod +x start.sh && \
    useradd -m -u 1000 appuser && \
    mkdir -p /app/storage/models /app/storage/reports /app/storage/rasters && \
    chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["./start.sh"]
