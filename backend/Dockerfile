FROM python:3.12-slim

WORKDIR /app

# 의존성 먼저 설치 (캐시 활용)
COPY pyproject.toml .
RUN pip install --no-cache-dir .

COPY . .

EXPOSE 8000

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

CMD ["/docker-entrypoint.sh"]
