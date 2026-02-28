#!/bin/bash
# 운영 서버(192.168.0.5) 배포 스크립트
set -e

REMOTE_HOST="gon@192.168.0.5"
REMOTE_DIR="/home/gon/projects/ai/voice-recognition"

echo "=== Voice Recognition Service 배포 ==="

# 1. 원격 서버에 프로젝트 디렉토리 확인/생성
echo "[1/6] 원격 서버 디렉토리 준비..."
ssh $REMOTE_HOST "mkdir -p $REMOTE_DIR"

# 2. Git push 후 원격에서 pull (또는 rsync)
echo "[2/6] 소스 코드 동기화..."
rsync -avz --exclude='.venv' --exclude='node_modules' --exclude='__pycache__' \
    --exclude='.env' --exclude='.git' --exclude='uploads/*' --exclude='.claude' \
    -e ssh ./ $REMOTE_HOST:$REMOTE_DIR/

# 3. .env 파일 확인
echo "[3/6] .env 파일 확인..."
ssh $REMOTE_HOST "
    if [ ! -f $REMOTE_DIR/.env ]; then
        echo '.env 파일이 없습니다. .env.example에서 복사합니다.'
        cp $REMOTE_DIR/.env.example $REMOTE_DIR/.env
        echo '⚠️  .env 파일의 비밀번호와 SECRET_KEY를 변경하세요!'
    else
        echo '.env 파일이 존재합니다.'
    fi
"

# 4. uploads 디렉토리 생성
ssh $REMOTE_HOST "mkdir -p $REMOTE_DIR/uploads"

# 5. Docker Compose 빌드 + 배포 (GPU 서비스 제외)
echo "[4/6] DB + Redis + API + Frontend 빌드 및 배포..."
ssh $REMOTE_HOST "
    cd $REMOTE_DIR
    docker compose up -d --build voice-postgres voice-redis voice-api voice-frontend
"

# 6. 헬스체크
echo "[5/6] 헬스체크 대기 (10초)..."
sleep 10
ssh $REMOTE_HOST "curl -sf http://localhost:8200/health || echo 'API 헬스체크 실패'"

echo "[6/6] 배포 완료!"
echo ""
echo "=== 서비스 URL ==="
echo "API:      http://192.168.0.5:8200"
echo "Frontend: http://192.168.0.5:3200"
echo ""
echo "=== GPU 서비스 (별도 실행 필요) ==="
echo "NVIDIA Container Toolkit 설치 후:"
echo "  ssh $REMOTE_HOST 'cd $REMOTE_DIR && docker compose up -d voice-ollama voice-worker'"
echo "  ssh $REMOTE_HOST 'docker exec voice-ollama ollama pull llama3.2'"
