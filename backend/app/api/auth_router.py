from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.db_models import User
from app.schemas.schemas import UserCreate, UserResponse, Token, LoginRequest
from app.auth.security import hash_password, verify_password, create_access_token, get_current_user, require_role, rate_limiter

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register_user(request: Request, user_in: UserCreate, db: Session = Depends(get_db)):
    """
    Registers a new platform user.
    M-8: Always defaults role to 'user' server-side regardless of client input,
    blocking privilege escalation to 'admin'.
    """
    rate_limiter.check(request.client.host)
    existing = db.query(User).filter(User.email == user_in.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="User with this email already exists")
    
    hashed_pwd = hash_password(user_in.password)
    user = User(
        email=user_in.email,
        hashed_password=hashed_pwd,
        full_name=user_in.full_name,
        role="user"  # Server-side enforced default role (M-8)
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@router.post("/login", response_model=Token)
def login(request: Request, login_in: LoginRequest, db: Session = Depends(get_db)):
    rate_limiter.check(request.client.host)
    user = db.query(User).filter(User.email == login_in.email).first()
    if not user or not verify_password(login_in.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    
    token = create_access_token({"sub": user.id, "email": user.email, "role": user.role})
    return Token(access_token=token, token_type="bearer", user=UserResponse.model_validate(user))

@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user

@router.patch("/users/{user_id}/role", response_model=UserResponse)
def update_user_role(
    user_id: str,
    new_role: str,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_role(["admin"]))
):
    """
    Privileged path: Only authenticated admin users can modify user roles (M-8).
    """
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail=f"User '{user_id}' not found")
    target_user.role = new_role
    db.commit()
    db.refresh(target_user)
    return target_user
