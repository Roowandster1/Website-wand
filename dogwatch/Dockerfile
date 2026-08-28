FROM python:3.12-slim

WORKDIR /app

# Dependencies first so code changes don't bust the layer cache.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY service/ ./service/
COPY tools/ ./tools/

# Unbuffered so logs reach docker logs immediately.
ENV PYTHONUNBUFFERED=1

# Fail fast and loudly on a bad config rather than half-running.
CMD ["python", "-m", "service", "--config", "/config/dogwatch.yml", "run"]
