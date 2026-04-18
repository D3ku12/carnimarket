import os
from sqlalchemy import create_engine, Column, String, Float, Integer, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./carnimarket.db")

# SQLAlchemy necesita este formato para PostgreSQL
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()

# Tabla de productos/inventario
class Producto(Base):
    __tablename__ = "productos"
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, unique=True, index=True)
    stock = Column(Float, default=0)
    minimo = Column(Float, default=2)
    precio_kilo = Column(Float, default=0)

# Tabla de ventas
class Venta(Base):
    __tablename__ = "ventas"
    id = Column(Integer, primary_key=True, index=True)
    fecha = Column(DateTime, default=datetime.now)
    producto = Column(String)
    kilos = Column(Float)
    precio_kilo = Column(Float)
    subtotal = Column(Float)

# Crear tablas
def init_db():
    Base.metadata.create_all(bind=engine)

# Datos iniciales
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