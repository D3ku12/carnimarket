from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
import secrets
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

SECRET_KEY = "carnimarket2026secretkey"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 8  # 8 horas

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ADMIN_USER = "admin"
ADMIN_PASSWORD = "$2b$12$TXMu/gX1qmmTgn4RIhXTcO7NzJ0Y5ayupmQVgkj2UedKFmfRG3o.y"
ADMIN_EMAIL = "stevenhm03@gmail.com"
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587
SMTP_USER = "stevenhm03@gmail.com"
SMTP_PASSWORD = "C@rniMarket"

reset_tokens = {}

def verificar_password(plain, hashed):
    return pwd_context.verify(plain, hashed)

def crear_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def verificar_token(token: str):
    if not token or not token.strip():
        return None
    try:
        token = token.strip()
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("sub")
    except Exception:
        return None

def generar_reset_token():
    token = secrets.token_urlsafe(32)
    reset_tokens[token] = datetime.utcnow()
    return token

def enviar_correo(destino, asunto, cuerpo):
    try:
        msg = MIMEMultipart()
        msg["From"] = SMTP_USER
        msg["To"] = destino
        msg["Subject"] = asunto
        msg.attach(MIMEText(cuerpo, "html"))
        
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.sendmail(SMTP_USER, destino, msg.as_string())
        server.quit()
        return True
    except Exception as e:
        print(f"Error enviando correo: {e}")
        return False