import uuid

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.security import create_access_token, hash_password
from app.models import Base
from app.models.user import User

# NullPool: 이벤트 루프 간 연결 재사용 방지
test_engine = create_async_engine(settings.database_url, echo=False, poolclass=NullPool)
TestSessionFactory = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture(scope="session")
async def _setup_tables():
    """세션 시작 시 테이블 생성"""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await test_engine.dispose()


@pytest_asyncio.fixture(autouse=True)
async def _clean_tables(_setup_tables):
    """각 테스트 후 데이터 초기화"""
    yield
    async with test_engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            await conn.execute(text(f"TRUNCATE TABLE {table.name} CASCADE"))


@pytest_asyncio.fixture
async def client():
    """API 클라이언트 - 각 요청마다 새 DB 세션 사용"""
    from app.core.database import get_db
    from app.main import app

    async def override_get_db():
        async with TestSessionFactory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def test_user():
    """테스트용 사용자를 DB에 직접 생성"""
    user_id = uuid.uuid4()
    async with TestSessionFactory() as session:
        user = User(
            id=user_id,
            email="test@example.com",
            name="테스트 사용자",
            password_hash=hash_password("testpass123"),
        )
        session.add(user)
        await session.commit()

    # 반환할 때는 심플한 객체로 (세션 밖에서도 사용 가능)
    class UserInfo:
        def __init__(self, id, email, name):
            self.id = id
            self.email = email
            self.name = name

    return UserInfo(id=user_id, email="test@example.com", name="테스트 사용자")


@pytest_asyncio.fixture
async def auth_headers(test_user):
    """인증 헤더 생성"""
    token = create_access_token({"sub": str(test_user.id)})
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def auth_client(client, auth_headers):
    """인증된 클라이언트"""
    client.headers.update(auth_headers)
    return client
