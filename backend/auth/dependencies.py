"""
Auth dependencies — resolve current user + workspace from JWT or API key.
Usage:
    user: User = Depends(get_current_user)
    workspace: Workspace = Depends(require_workspace)
"""
import hashlib
from typing import Optional

import structlog
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, APIKeyHeader
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.db.database import get_db
from backend.db.models import ApiKey, User, Workspace

log = structlog.get_logger()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    api_key: Optional[str] = Depends(api_key_header),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    Resolve a User from either:
      - Authorization: Bearer <jwt>
      - X-API-Key: <raw key>
    Raises 401 if neither is present or valid.
    """
    # ── JWT path ──
    if token:
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
            user_id: str = payload.get("sub")
            if not user_id:
                raise _unauthorized()
        except JWTError:
            raise _unauthorized()

        user = await db.get(User, user_id)
        if not user or not user.is_active:
            raise _unauthorized()
        return user

    # ── API Key path ──
    if api_key:
        key_hash = hashlib.sha256(api_key.encode()).hexdigest()
        result = await db.execute(select(ApiKey).where(ApiKey.key_hash == key_hash))
        db_key = result.scalar_one_or_none()
        if not db_key:
            raise _unauthorized()

        # Load the workspace owner (first owner user) to satisfy type contract
        result = await db.execute(
            select(User).where(
                User.workspace_id == db_key.workspace_id,
                User.role == "owner",
                User.is_active == True,
            )
        )
        user = result.scalar_one_or_none()
        if not user:
            raise _unauthorized()

        # Touch last_used_at lazily (best-effort)
        from datetime import datetime
        db_key.last_used_at = datetime.utcnow()

        return user

    raise _unauthorized()


async def require_workspace(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Workspace:
    workspace = await db.get(Workspace, user.workspace_id)
    if not workspace:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Workspace not found")
    return workspace


async def require_superadmin(
    user: User = Depends(get_current_user),
) -> User:
    """Allows access only to emails listed in ADMIN_EMAILS env var."""
    admin_emails = [e.strip().lower() for e in settings.ADMIN_EMAILS.split(",") if e.strip()]
    if not admin_emails:
        raise HTTPException(status_code=403, detail="Super admin access not configured")
    if user.email.lower() not in admin_emails:
        raise HTTPException(status_code=403, detail="Super admin access required")
    return user


def _unauthorized():
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )
