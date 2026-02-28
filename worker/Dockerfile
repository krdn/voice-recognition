FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# 시스템 패키지 설치
RUN apt-get update && apt-get install -y \
    software-properties-common \
    && add-apt-repository ppa:deadsnakes/ppa \
    && apt-get update && apt-get install -y \
    python3.12 python3.12-venv python3.12-dev ffmpeg git curl \
    && update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.12 1 \
    && rm -rf /var/lib/apt/lists/*

# pip 설치 (get-pip.py 사용)
RUN curl -sS https://bootstrap.pypa.io/get-pip.py | python3.12

WORKDIR /app

# PyTorch 먼저 설치 (CUDA 12.4)
RUN pip install --no-cache-dir torch torchaudio --index-url https://download.pytorch.org/whl/cu124

# whisperx 및 의존성 설치
RUN pip install --no-cache-dir whisperx

# 나머지 의존성 설치
RUN pip install --no-cache-dir \
    redis>=5.0.0 \
    "sqlalchemy[asyncio]>=2.0.0" \
    asyncpg>=0.30.0 \
    httpx>=0.27.0 \
    pydantic-settings>=2.0.0

COPY . .

CMD ["python3", "-m", "app.main"]
