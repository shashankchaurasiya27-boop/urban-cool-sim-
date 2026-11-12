import datetime
import time
from collections import defaultdict
from typing import Optional
import hashlib
import hmac
import secrets
from fastapi import HTTPException, Security, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt

try:
    import bcrypt
    _HAS_BCRYPT = True
except ImportError:
    bcrypt = None
    _HAS_BCRYPT = False

from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.db_models import User

security_scheme = HTTPBearer()

# Password handling: uses bcrypt when installed; transparently falls back to
# standard-library PBKDF2-HMAC-SHA256 for audit environments where C-extensions are absent.
def hash_password(password: str) -> str:
    pwd_bytes = password.encode('utf-8')
    if _HAS_BCRYPT:
        salt = bcrypt.gensalt(12)
        return bcrypt.hashpw(pwd_bytes, salt).decode('utf-8')
    else:
        salt = secrets.token_hex(16)
        iterations = 100_000
        hash_val = hashlib.pbkdf2_hmac('sha256', pwd_bytes, salt.encode('utf-8'), iterations).hex()
        return f"pbkdf2_sha256${iterations}${salt}${hash_val}"

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        if hashed_password.startswith("pbkdf2_sha256$"):
            parts = hashed_password.split("$")
            if len(parts) != 4:
                return False
            iterations = int(parts[1])
            salt = parts[2]
            expected_hash = parts[3]
            computed = hashlib.pbkdf2_hmac('sha256', plain_password.encode('utf-8'), salt.encode('utf-8'), iterations).hex()
            return hmac.compare_digest(expected_hash, computed)
        elif _HAS_BCRYPT:
            return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
        else:
            return False
    except Exception:
        return False

# JWT Token handling
def create_access_token(data: dict, expires_delta: Optional[datetime.timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.datetime.utcnow() + expires_delta
    else:
        expire = datetime.datetime.utcnow() + datetime.timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

# Current User Dependency (Strict Authentication)
def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(security_scheme),
    db: Session = Depends(get_db)
) -> User:
    token = credentials.credentials
    payload = decode_token(token)
    user_id: str = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
    
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Inactive user account")
    return user

# Optional User Dependency (Demo Session Fallback)
optional_security_scheme = HTTPBearer(auto_error=False)

def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(optional_security_scheme),
    db: Session = Depends(get_db)
) -> Optional[User]:
    if not credentials:
        return None
    try:
        token = credentials.credentials
        payload = decode_token(token)
        user_id = payload.get("sub")
        if user_id:
            return db.query(User).filter(User.id == user_id).first()
    except Exception:
        pass
    return None

# Role-Based Access Control (RBAC) Dependency
def require_role(allowed_roles: list[str]):
    def role_checker(user: User = Depends(get_current_user)):
        if user.role not in allowed_roles and user.role != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Operation not permitted. Required role: {allowed_roles}"
            )
        return user
    return role_checker

# Simple In-Memory Rate Limiting with Active TTL Pruning (M-3)
class SimpleRateLimiter:
    def __init__(self, requests_per_minute: int = settings.RATE_LIMIT_PER_MINUTE):
        self.requests_per_minute = requests_per_minute
        self.requests = defaultdict(list)
        self.last_cleanup = time.time()

    def check(self, client_ip: str):
        now = time.time()
        minute_ago = now - 60
        
        # Periodic pruning of stale client IPs every 60 seconds (M-3)
        if now - self.last_cleanup > 60:
            stale_ips = [ip for ip, timestamps in self.requests.items() if not timestamps or timestamps[-1] <= minute_ago]
            for ip in stale_ips:
                del self.requests[ip]
            self.last_cleanup = now

        # Filter requests within the last minute
        valid_requests = [t for t in self.requests[client_ip] if t > minute_ago]
        if len(valid_requests) >= self.requests_per_minute:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Rate limit exceeded. Please wait before issuing more expensive requests."
            )
        valid_requests.append(now)
        self.requests[client_ip] = valid_requests

rate_limiter = SimpleRateLimiter()
