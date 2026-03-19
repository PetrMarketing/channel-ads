from typing import Optional, Dict, Any

from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
import bcrypt as _bcrypt

from ..config import settings
from ..database import fetch_one, execute

admin_security = HTTPBearer(auto_error=False)


async def get_current_admin(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(admin_security),
) -> Dict[str, Any]:
    if not credentials:
        raise HTTPException(status_code=401, detail="Требуется авторизация")
    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.ADMIN_JWT_SECRET, algorithms=["HS256"])
    except JWTError:
        raise HTTPException(status_code=401, detail="Невалидный токен")
    admin_id = payload.get("adminId")
    if not admin_id:
        raise HTTPException(status_code=401, detail="Невалидный токен")
    admin = await fetch_one(
        "SELECT * FROM admin_users WHERE id = $1 AND is_active = 1", admin_id
    )
    if not admin:
        raise HTTPException(status_code=401, detail="Администратор не найден")
    return admin


async def require_superadmin(
    admin: Dict[str, Any] = Depends(get_current_admin),
) -> Dict[str, Any]:
    if admin.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="Только для суперадмина")
    return admin


def create_admin_jwt(admin_id: int) -> str:
    return jwt.encode({"adminId": admin_id}, settings.ADMIN_JWT_SECRET, algorithm="HS256")


def verify_password(plain: str, hashed: str) -> bool:
    return _bcrypt.checkpw(plain.encode('utf-8'), hashed.encode('utf-8'))


def hash_password(plain: str) -> str:
    return _bcrypt.hashpw(plain.encode('utf-8'), _bcrypt.gensalt()).decode('utf-8')
