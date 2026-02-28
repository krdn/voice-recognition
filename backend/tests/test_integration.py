"""통합 테스트: API 엔드포인트 E2E 검증 (실제 PostgreSQL 사용)"""
import uuid

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
class TestHealthCheck:
    async def test_health_endpoint(self, client: AsyncClient):
        response = await client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["version"] == "0.1.0"


@pytest.mark.asyncio
class TestAuth:
    async def test_register(self, client: AsyncClient):
        response = await client.post(
            "/api/auth/register",
            json={"email": "new@example.com", "name": "새 사용자", "password": "pass123"},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["email"] == "new@example.com"
        assert data["name"] == "새 사용자"
        assert "id" in data

    async def test_register_duplicate_email(self, client: AsyncClient):
        payload = {"email": "dup@example.com", "name": "사용자1", "password": "pass123"}
        await client.post("/api/auth/register", json=payload)
        response = await client.post("/api/auth/register", json=payload)
        assert response.status_code == 400
        assert "이미 등록된 이메일" in response.json()["detail"]

    async def test_login_success(self, client: AsyncClient):
        await client.post(
            "/api/auth/register",
            json={"email": "login@example.com", "name": "로그인", "password": "pass123"},
        )
        response = await client.post(
            "/api/auth/login",
            json={"email": "login@example.com", "password": "pass123"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    async def test_login_wrong_password(self, client: AsyncClient):
        await client.post(
            "/api/auth/register",
            json={"email": "wrong@example.com", "name": "실패", "password": "pass123"},
        )
        response = await client.post(
            "/api/auth/login",
            json={"email": "wrong@example.com", "password": "wrongpass"},
        )
        assert response.status_code == 401

    async def test_login_nonexistent_user(self, client: AsyncClient):
        response = await client.post(
            "/api/auth/login",
            json={"email": "noone@example.com", "password": "pass123"},
        )
        assert response.status_code == 401


@pytest.mark.asyncio
class TestProjects:
    async def test_create_project(self, auth_client: AsyncClient):
        response = await auth_client.post(
            "/api/projects",
            json={"name": "테스트 프로젝트", "description": "통합 테스트용"},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "테스트 프로젝트"
        assert data["description"] == "통합 테스트용"

    async def test_list_projects(self, auth_client: AsyncClient):
        await auth_client.post("/api/projects", json={"name": "프로젝트1"})
        await auth_client.post("/api/projects", json={"name": "프로젝트2"})
        response = await auth_client.get("/api/projects")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2

    async def test_list_projects_empty(self, auth_client: AsyncClient):
        response = await auth_client.get("/api/projects")
        assert response.status_code == 200
        assert response.json() == []

    async def test_unauthorized_access(self, client: AsyncClient):
        response = await client.get("/api/projects")
        # HTTPBearer는 토큰 없으면 401 반환
        assert response.status_code in (401, 403)


@pytest.mark.asyncio
class TestNotes:
    async def test_upload_invalid_extension(self, auth_client: AsyncClient):
        # 프로젝트 생성
        proj = await auth_client.post("/api/projects", json={"name": "노트 테스트"})
        project_id = proj.json()["id"]

        # 지원하지 않는 확장자
        response = await auth_client.post(
            "/api/notes/upload",
            params={"project_id": project_id, "title": "테스트"},
            files={"file": ("test.txt", b"not audio", "text/plain")},
        )
        assert response.status_code == 400
        assert "지원하지 않는 파일 형식" in response.json()["detail"]

    async def test_get_nonexistent_note(self, auth_client: AsyncClient):
        fake_id = str(uuid.uuid4())
        response = await auth_client.get(f"/api/notes/{fake_id}")
        assert response.status_code == 404

    async def test_get_nonexistent_transcript(self, auth_client: AsyncClient):
        fake_id = str(uuid.uuid4())
        response = await auth_client.get(f"/api/notes/{fake_id}/transcript")
        assert response.status_code == 404

    async def test_get_nonexistent_analysis(self, auth_client: AsyncClient):
        fake_id = str(uuid.uuid4())
        response = await auth_client.get(f"/api/notes/{fake_id}/analysis")
        assert response.status_code == 404
