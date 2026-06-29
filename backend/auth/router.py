"""
Auth router — register, login, Google OAuth, API keys.
All routes are public except /me and /api-keys (require JWT).
"""
import hashlib
import os
import secrets
import uuid
from datetime import datetime, timedelta

import bcrypt as _bcrypt
import structlog
import asyncio
import base64
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from jose import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pydantic import BaseModel as _BaseModel

from backend.auth.dependencies import get_current_user, require_workspace
from backend.auth.google_oauth import exchange_code_for_user, get_google_auth_url
from backend.config import settings
from backend.db.database import get_db
from backend.db.models import ApiKey, NotificationPreference, PasswordResetToken, User, Workspace
from backend.notifications import email as mailer
from backend.notifications import templates as tmpl
from backend.models.schemas import (
    ApiKeyCreate,
    ApiKeyCreated,
    ApiKeyOut,
    LoginRequest,
    RegisterRequest,
    TokenOut,
    UserOut,
    WorkspaceOut,
)


class UpdateWorkspaceRequest(_BaseModel):
    name: str


class InviteRequest(_BaseModel):
    email: str
    role: str = "member"


class ForgotPasswordRequest(_BaseModel):
    email: str


class ResetPasswordRequest(_BaseModel):
    token: str
    new_password: str


class ChangePasswordRequest(_BaseModel):
    current_password: str = ""
    new_password: str


# Password-reset link validity (minutes)
PASSWORD_RESET_TTL_MINUTES = 30

log = structlog.get_logger()
router = APIRouter()


def _hash_password(password: str) -> str:
    return _bcrypt.hashpw(password.encode(), _bcrypt.gensalt()).decode()


def _verify_password(password: str, hashed: str) -> bool:
    return _bcrypt.checkpw(password.encode(), hashed.encode())


def _create_access_token(user_id: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(
        {"sub": user_id, "exp": expire},
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )


# ── Register ──────────────────────────────────────────────────────────────────

@router.post("/register", response_model=TokenOut, status_code=201)
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db)):
    # Check email uniqueness
    existing = await db.execute(select(User).where(User.email == payload.email.lower()))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    workspace = Workspace(
        id=str(uuid.uuid4()),
        name=payload.workspace_name.strip(),
    )
    db.add(workspace)
    await db.flush()

    user = User(
        id=str(uuid.uuid4()),
        workspace_id=workspace.id,
        email=payload.email.lower().strip(),
        hashed_password=_hash_password(payload.password),
        role="owner",
    )
    db.add(user)
    await db.flush()
    await db.commit()

    await db.commit()

    # Create default notification preferences
    db.add(NotificationPreference(user_id=user.id))
    await db.commit()

    # Grant the free-trial call minutes so a new (free-plan) workspace can start calling.
    try:
        from backend.billing.credits import add_credits
        await add_credits(db, workspace.id, float(settings.FREE_TRIAL_MINUTES),
                          tx_type="free_trial", description="Welcome free-trial minutes")
        await db.commit()
    except Exception as exc:
        log.warning("Free-trial credit grant failed", workspace_id=workspace.id, error=str(exc))

    log.info("New workspace registered", workspace_id=workspace.id, email=user.email,
             trial_minutes=settings.FREE_TRIAL_MINUTES)

    # Send welcome email (fire-and-forget)
    subject, html = tmpl.welcome(workspace.name, user.email, settings.FRONTEND_URL or "")
    asyncio.create_task(mailer.send_email(user.email, subject, html))

    return TokenOut(access_token=_create_access_token(user.id))


# ── Login ─────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenOut)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == payload.email.lower()))
    user = result.scalar_one_or_none()

    if not user or not user.hashed_password:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not _verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    return TokenOut(access_token=_create_access_token(user.id))


# ── Forgot / Reset password ────────────────────────────────────────────────────

def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


@router.post("/forgot-password")
async def forgot_password(
    payload: ForgotPasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Send a password-reset link to the user's email.
    Always returns a generic success response — never reveals whether the
    email exists (prevents account enumeration).
    """
    email = payload.email.lower().strip()
    generic = {"message": "If an account exists for that email, a reset link has been sent."}

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    # Proceed for any real, active account. OAuth-only users (no password yet)
    # can use this flow to set a password for the first time — the link still
    # only ever goes to their own verified inbox.
    if not user or not user.is_active:
        return generic

    # Invalidate any existing unused tokens for this user
    existing = await db.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used == False,  # noqa: E712
        )
    )
    for t in existing.scalars().all():
        t.used = True

    # Generate a fresh single-use token; store only its hash
    raw_token = secrets.token_urlsafe(48)
    db.add(PasswordResetToken(
        user_id=user.id,
        token_hash=_hash_token(raw_token),
        expires_at=datetime.utcnow() + timedelta(minutes=PASSWORD_RESET_TTL_MINUTES),
    ))
    await db.commit()

    # Build reset URL pointing at the frontend origin the request came from
    origin = (
        _extract_origin(request.headers.get("origin", ""))
        or _extract_origin(request.headers.get("referer", ""))
        or settings.FRONTEND_URL
        or "http://localhost:3000"
    )
    reset_url = f"{origin}/reset-password?token={raw_token}"

    subject, html = tmpl.password_reset(user.email, reset_url, PASSWORD_RESET_TTL_MINUTES, origin)
    asyncio.create_task(mailer.send_email(user.email, subject, html))

    log.info("Password reset requested", user_id=user.id, email=user.email)
    return generic


@router.post("/reset-password", response_model=TokenOut)
async def reset_password(
    payload: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    """Validate a reset token and set a new password (single-use, expiring)."""
    if not payload.new_password or len(payload.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    token_hash = _hash_token(payload.token)
    result = await db.execute(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash)
    )
    reset = result.scalar_one_or_none()

    if not reset or reset.used or reset.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="This reset link is invalid or has expired. Please request a new one.")

    user = await db.get(User, reset.user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=400, detail="Account not found or disabled")

    # Update password and consume the token
    user.hashed_password = _hash_password(payload.new_password)
    reset.used = True

    # Invalidate any other outstanding tokens for this user
    others = await db.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used == False,  # noqa: E712
        )
    )
    for t in others.scalars().all():
        t.used = True

    await db.commit()
    log.info("Password reset completed", user_id=user.id, email=user.email)

    # Log the user straight in
    return TokenOut(access_token=_create_access_token(user.id))


# ── Google OAuth ──────────────────────────────────────────────────────────────

def _extract_origin(url: str) -> str:
    """Extract scheme+host from a URL, e.g. https://foo.devtunnels.ms"""
    try:
        p = urlparse(url)
        if p.scheme and p.netloc:
            return f"{p.scheme}://{p.netloc}"
    except Exception:
        pass
    return ""


@router.get("/google")
async def google_login(request: Request, origin: str = ""):
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=501, detail="Google OAuth not configured")
    frontend_origin = (
        origin
        or _extract_origin(request.headers.get("referer", ""))
        or request.headers.get("origin", "")
        or settings.FRONTEND_URL
        or "http://localhost:3000"
    )
    # base64 encode so the state is safe alphanumeric chars — no URL encoding issues
    state = base64.urlsafe_b64encode(frontend_origin.encode()).decode().rstrip("=")
    log.info("Google OAuth initiated", frontend_origin=frontend_origin, state=state)
    url = get_google_auth_url(state=state)
    return RedirectResponse(url)


@router.get("/google/callback")
async def google_callback(code: str, state: str = "", db: AsyncSession = Depends(get_db)):
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=501, detail="Google OAuth not configured")

    # Decode base64 state → frontend origin
    if state:
        try:
            padded = state + "=" * (4 - len(state) % 4)
            frontend_url = base64.urlsafe_b64decode(padded).decode()
        except Exception:
            frontend_url = settings.FRONTEND_URL or "http://localhost:3000"
    else:
        frontend_url = settings.FRONTEND_URL or "http://localhost:3000"
    log.info("Google OAuth callback", state=state, frontend_url=frontend_url)

    try:
        info = await exchange_code_for_user(code)
    except Exception as exc:
        log.error("Google OAuth exchange failed", error=repr(exc))
        return RedirectResponse(f"{frontend_url}/login?error=oauth_failed")

    google_id = info.get("sub")
    email = info.get("email", "").lower().strip()
    name = info.get("name", email.split("@")[0])

    if not email:
        raise HTTPException(status_code=400, detail="Google did not return an email")

    # Try to find user by google_id first, then by email
    result = await db.execute(select(User).where(User.google_id == google_id))
    user = result.scalar_one_or_none()

    if not user:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

    if not user:
        # First-time Google sign-in — create workspace + user
        workspace = Workspace(id=str(uuid.uuid4()), name=f"{name}'s Workspace")
        db.add(workspace)
        await db.flush()

        user = User(
            id=str(uuid.uuid4()),
            workspace_id=workspace.id,
            email=email,
            google_id=google_id,
            role="owner",
        )
        db.add(user)
        await db.flush()
        is_new_user = True
    else:
        # Link google_id if not already set
        if not user.google_id:
            user.google_id = google_id
        is_new_user = False

    # Create notification preferences for new users
    if is_new_user:
        db.add(NotificationPreference(user_id=user.id))

    await db.commit()

    # Send welcome email to new Google OAuth users (fire-and-forget)
    if is_new_user:
        subject, html = tmpl.welcome(name, user.email, frontend_url)
        asyncio.create_task(mailer.send_email(user.email, subject, html))

    token = _create_access_token(user.id)
    return RedirectResponse(f"{frontend_url}/callback?token={token}")


# ── Current user / workspace ──────────────────────────────────────────────────

@router.get("/me", response_model=UserOut)
async def get_me(user: User = Depends(get_current_user)):
    admin_emails = [e.strip().lower() for e in settings.ADMIN_EMAILS.split(",") if e.strip()]
    data = UserOut.model_validate(user)
    data.is_superadmin = user.email.lower() in admin_emails
    data.has_password = bool(user.hashed_password)
    return data


# ── Change password (authenticated) ─────────────────────────────────────────────

@router.post("/change-password")
async def change_password(
    payload: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Change the current user's password.
    - If the account already has a password, the correct current password is required.
    - If the account is OAuth-only (no password yet), this sets one for the first time.
    """
    if not payload.new_password or len(payload.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")

    if user.hashed_password:
        if not payload.current_password:
            raise HTTPException(status_code=400, detail="Current password is required")
        if not _verify_password(payload.current_password, user.hashed_password):
            raise HTTPException(status_code=400, detail="Current password is incorrect")
        if _verify_password(payload.new_password, user.hashed_password):
            raise HTTPException(status_code=400, detail="New password must be different from the current one")

    user.hashed_password = _hash_password(payload.new_password)
    await db.commit()

    log.info("Password changed", user_id=user.id, email=user.email)
    return {"message": "Password updated successfully", "has_password": True}


@router.get("/workspace", response_model=WorkspaceOut)
async def get_workspace(workspace: Workspace = Depends(require_workspace)):
    return workspace


# ── API Keys ──────────────────────────────────────────────────────────────────

@router.post("/api-keys", response_model=ApiKeyCreated, status_code=201)
async def create_api_key(
    payload: ApiKeyCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    raw_key = f"trc_{secrets.token_urlsafe(32)}"
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()

    db_key = ApiKey(
        id=str(uuid.uuid4()),
        workspace_id=user.workspace_id,
        key_hash=key_hash,
        name=payload.name,
    )
    db.add(db_key)
    await db.flush()
    await db.commit()

    return ApiKeyCreated(
        id=db_key.id,
        name=db_key.name,
        key=raw_key,
        created_at=db_key.created_at,
    )


@router.get("/api-keys", response_model=list[ApiKeyOut])
async def list_api_keys(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ApiKey).where(ApiKey.workspace_id == user.workspace_id)
    )
    return result.scalars().all()


@router.delete("/api-keys/{key_id}", status_code=204)
async def revoke_api_key(
    key_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    db_key = await db.get(ApiKey, key_id)
    if not db_key or db_key.workspace_id != user.workspace_id:
        raise HTTPException(status_code=404, detail="API key not found")
    await db.delete(db_key)
    await db.commit()


# ── Workspace settings ────────────────────────────────────────────────────────

@router.put("/workspace", response_model=WorkspaceOut)
async def update_workspace(
    payload: UpdateWorkspaceRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.role != "owner":
        raise HTTPException(status_code=403, detail="Only owners can update workspace settings")
    workspace = await db.get(Workspace, user.workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    workspace.name = payload.name.strip()
    await db.commit()
    await db.refresh(workspace)
    return workspace


# ── Team management ───────────────────────────────────────────────────────────

@router.get("/members", response_model=list[UserOut])
async def list_members(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User).where(User.workspace_id == user.workspace_id)
    )
    return result.scalars().all()


@router.delete("/members/{member_id}", status_code=204)
async def remove_member(
    member_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.role != "owner":
        raise HTTPException(status_code=403, detail="Only owners can remove members")
    if member_id == user.id:
        raise HTTPException(status_code=400, detail="Cannot remove yourself")
    member = await db.get(User, member_id)
    if not member or member.workspace_id != user.workspace_id:
        raise HTTPException(status_code=404, detail="Member not found")
    await db.delete(member)
    await db.commit()


# ── Invites ───────────────────────────────────────────────────────────────────

@router.post("/invite")
async def create_invite(
    payload: InviteRequest,
    user: User = Depends(get_current_user),
):
    if user.role != "owner":
        raise HTTPException(status_code=403, detail="Only owners can invite members")

    expire = datetime.utcnow() + timedelta(days=7)
    token = jwt.encode(
        {
            "sub": "invite",
            "workspace_id": user.workspace_id,
            "email": payload.email.lower().strip(),
            "role": payload.role,
            "exp": expire,
        },
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )
    frontend_url = settings.FRONTEND_URL or "http://localhost:3000"
    invite_url = f"{frontend_url}/invite?token={token}"
    return {"invite_url": invite_url, "expires_in_days": 7}


@router.post("/accept-invite", response_model=TokenOut, status_code=201)
async def accept_invite(
    token: str,
    password: str,
    db: AsyncSession = Depends(get_db),
):
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid or expired invite link")

    if payload.get("sub") != "invite":
        raise HTTPException(status_code=400, detail="Invalid invite token")

    workspace_id = payload["workspace_id"]
    email = payload["email"]
    role = payload.get("role", "member")

    workspace = await db.get(Workspace, workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace no longer exists")

    result = await db.execute(select(User).where(User.email == email))
    existing_user = result.scalar_one_or_none()

    if existing_user:
        # User already has an account — move them into this workspace
        existing_user.workspace_id = workspace_id
        existing_user.role = role
        await db.commit()
        log.info("Invite accepted — existing user moved to workspace",
                 email=email, workspace_id=workspace_id)
        return TokenOut(access_token=_create_access_token(existing_user.id))

    # New user — create with the provided password
    if not password:
        raise HTTPException(status_code=400, detail="Password is required for new accounts")

    new_user = User(
        id=str(uuid.uuid4()),
        workspace_id=workspace_id,
        email=email,
        hashed_password=_hash_password(password),
        role=role,
    )
    db.add(new_user)
    await db.commit()

    log.info("Invite accepted — new user created", email=email, workspace_id=workspace_id)
    return TokenOut(access_token=_create_access_token(new_user.id))
