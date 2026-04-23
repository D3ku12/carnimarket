import os
from sqlalchemy import create_engine, Column, String, Float, Integer, DateTime, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./carnimarket.db")

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()

# Tabla de usuarios del sistema
class Usuario(Base):
    __tablename__ = "usuarios"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    password_hash = Column(String)
    nombre = Column(String)
    rol = Column(String, default="empleado")
    activo = Column(Boolean, default=True)
    fecha_registro = Column(DateTime, default=datetime.now)
    ultimo_login = Column(DateTime, nullable=True)

# Tabla de clientes
class Cliente(Base):
    __tablename__ = "clientes"
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, unique=True, index=True)
    telefono = Column(String, default="")
    direccion = Column(String, default="")
    fecha_registro = Column(DateTime, default=datetime.now)

# Tabla de productos
class Producto(Base):
    __tablename__ = "productos"
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, unique=True, index=True)
    stock = Column(Float, default=0)
    minimo = Column(Float, default=2)
    precio_kilo = Column(Float, default=0)
    tipo = Column(String, default="kilo")  # "kilo" o "plato"

# Tabla de ventas
class Venta(Base):
    __tablename__ = "ventas"
    id = Column(Integer, primary_key=True, index=True)
    fecha_venta = Column(DateTime, default=datetime.now)
    fecha_pago = Column(DateTime, nullable=True)
    fecha_vencimiento = Column(DateTime, nullable=True)
    producto = Column(String)
    kilos = Column(Float)
    precio_kilo = Column(Float)
    subtotal = Column(Float)
    cliente_id = Column(Integer, default=None)
    cliente_nombre = Column(String, default="Cliente general")
    pagado = Column(String, default="pagado")
    notas = Column(String, default="")

# Tabla de gastos
class Gasto(Base):
    __tablename__ = "gastos"
    id = Column(Integer, primary_key=True, index=True)
    fecha = Column(DateTime, default=datetime.now)
    descripcion = Column(String)
    categoria = Column(String, default="general")
    monto = Column(Float)
    notas = Column(String, default="")

# Tabla de historial
class Historial(Base):
    __tablename__ = "historial"
    id = Column(Integer, primary_key=True, index=True)
    fecha = Column(DateTime, default=datetime.now)
    producto = Column(String)
    tipo = Column(String)
    cantidad = Column(Float)
    motivo = Column(String, default="")

def init_db():
    Base.metadata.create_all(bind=engine)

def seed_db():
    db = SessionLocal()
    if db.query(Producto).count() == 0:
        productos = [
            Producto(nombre="Lomo",     stock=10, minimo=3, precio_kilo=30000),
            Producto(nombre="Costilla", stock=5,  minimo=2, precio_kilo=18000),
            Producto(nombre="Molida",   stock=2,  minimo=3, precio_kilo=15000),
            Producto(nombre="Pierna",   stock=20, minimo=5, precio_kilo=18000),
            Producto(nombre="Brazo",    stock=1,  minimo=4, precio_kilo=18000),
        ]
        db.add_all(productos)
        db.commit()
    db.close()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()