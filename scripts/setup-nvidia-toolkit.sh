#!/bin/bash
# NVIDIA Container Toolkit 설치 스크립트 (Ubuntu 24.04)
# 운영 서버(192.168.0.5)에서 실행
set -e

echo "=== NVIDIA Container Toolkit 설치 ==="

# 1. NVIDIA 저장소 추가
echo "[1/4] NVIDIA 저장소 추가..."
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
    sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
    sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

# 2. 패키지 설치
echo "[2/4] nvidia-container-toolkit 설치..."
sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit

# 3. Docker 런타임 설정
echo "[3/4] Docker 런타임 설정..."
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker

# 4. 테스트
echo "[4/4] GPU 접근 테스트..."
docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi

echo ""
echo "=== NVIDIA Container Toolkit 설치 완료! ==="
echo "이제 GPU 서비스를 시작할 수 있습니다:"
echo "  docker compose up -d voice-ollama voice-worker"
