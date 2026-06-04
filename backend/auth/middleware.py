"""
WorkspaceScopeMiddleware — fast early-rejection of unauthenticated requests.
Auth validation (JWT decode + DB lookup) still happens in Depends(require_workspace).
This middleware only ensures the header is present before spending DB resources.
"""
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

# Routes that don't require any auth header.
# Payment webhooks authenticate via their own signature (HMAC), not a JWT.
_PUBLIC_PREFIXES = (
    "/auth/",
    "/health",
    "/telephony/",
    "/ws/",
    "/docs",
    "/openapi.json",
    "/redoc",
    "/billing/razorpay/webhook",
)


class WorkspaceScopeMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Allow public paths through without checking auth
        if any(path.startswith(prefix) for prefix in _PUBLIC_PREFIXES):
            return await call_next(request)

        # Let CORS preflight through — it carries no auth headers by design
        if request.method == "OPTIONS":
            return await call_next(request)

        # Require at least one auth credential to be present.
        # ?token= is accepted for endpoints like /recording where <audio src> can't send headers.
        has_bearer = "authorization" in request.headers
        has_api_key = "x-api-key" in request.headers
        has_query_token = bool(request.query_params.get("token"))

        if not has_bearer and not has_api_key and not has_query_token:
            return JSONResponse(
                status_code=401,
                content={"detail": "Not authenticated"},
                headers={"WWW-Authenticate": "Bearer"},
            )

        return await call_next(request)
