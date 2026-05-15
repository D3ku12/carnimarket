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
    acceso_carniceria = Column(Boolean, default=True)
    acceso_asadero = Column(Boolean, default=True)

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
    tipo = Column(String, default="kilo")
    negocio = Column(String, default="carniceria")

# Tabla de ventas
class Venta(Base):
    __tablename__ = "ventas"
    id = Column(Integer, primary_key=True, index=True)
    negocio = Column(String, default="carniceria")
    fecha_venta = Column(DateTime, default=datetime.now)
    fecha_pago = Column(DateTime, nullable=True)
    fecha_vencimiento = Column(DateTime, nullable=True)
    producto = Column(String)
    kilos = Column(Float)
    cantidad = Column(Float)  # cantidad original
    unidad = Column(String)   # kilo, gramos o plato
    precio_kilo = Column(Float)
    subtotal = Column(Float)
    monto_pagado = Column(Float, default=0)
    cliente_id = Column(Integer, default=None)
    cliente_nombre = Column(String, default="Cliente general")
    direccion = Column(String, default="")
    pagado = Column(String, default="pagado")
    notas = Column(String, default="")

# Tabla de gastos
class Gasto(Base):
    __tablename__ = "gastos"
    id = Column(Integer, primary_key=True, index=True)
    negocio = Column(String, default="carniceria")
    fecha = Column(DateTime, default=datetime.now)
    descripcion = Column(String)
    categoria = Column(String, default="general")
    monto = Column(Float)
    notas = Column(String, default="")

# Tabla de historial
class Historial(Base):
    __tablename__ = "historial"
    id = Column(Integer, primary_key=True, index=True)
    negocio = Column(String, default="carniceria")
    fecha = Column(DateTime, default=datetime.now)
    producto = Column(String)
    tipo = Column(String)
    cantidad = Column(Float)
    motivo = Column(String, default="")

def init_db():
    Base.metadata.create_all(bind=engine)
    from sqlalchemy import text, inspect
    try:
        with engine.connect() as conn:
            inspector = inspect(engine)
            
            # Migration: agregar columna tipo a productos
            columnas_productos = [c['name'] for c in inspector.get_columns('productos')]
            if 'tipo' not in columnas_productos:
                conn.execute(text("ALTER TABLE productos ADD COLUMN tipo VARCHAR DEFAULT 'kilo'"))
                conn.commit()
            
            # Migration: agregar columna direccion a ventas
            columnas_ventas = [c['name'] for c in inspector.get_columns('ventas')]
            if 'direccion' not in columnas_ventas:
                conn.execute(text("ALTER TABLE ventas ADD COLUMN direccion VARCHAR DEFAULT ''"))
                conn.commit()
            
            # Migration: agregar columna monto_pagado a ventas
            if 'monto_pagado' not in columnas_ventas:
                conn.execute(text("ALTER TABLE ventas ADD COLUMN monto_pagado FLOAT DEFAULT 0"))
                conn.commit()
            
            # Migration: agregar cantidad y unidad a ventas
            if 'cantidad' not in columnas_ventas:
                conn.execute(text("ALTER TABLE ventas ADD COLUMN cantidad FLOAT DEFAULT 0"))
                conn.commit()
            if 'unidad' not in columnas_ventas:
                conn.execute(text("ALTER TABLE ventas ADD COLUMN unidad VARCHAR DEFAULT 'kilo'"))
                conn.commit()
                
            # Migration: agregar negocio a todas las tablas
            if 'negocio' not in columnas_productos:
                conn.execute(text("ALTER TABLE productos ADD COLUMN negocio VARCHAR DEFAULT 'carniceria'"))
                conn.commit()
            if 'negocio' not in columnas_ventas:
                conn.execute(text("ALTER TABLE ventas ADD COLUMN negocio VARCHAR DEFAULT 'carniceria'"))
                conn.commit()
            
            columnas_gastos = [c['name'] for c in inspector.get_columns('gastos')]
            if 'negocio' not in columnas_gastos:
                conn.execute(text("ALTER TABLE gastos ADD COLUMN negocio VARCHAR DEFAULT 'carniceria'"))
                conn.commit()
                
            columnas_historial = [c['name'] for c in inspector.get_columns('historial')]
            if 'negocio' not in columnas_historial:
                conn.execute(text("ALTER TABLE historial ADD COLUMN negocio VARCHAR DEFAULT 'carniceria'"))
                conn.commit()
            columnas_usuarios = [c['name'] for c in inspector.get_columns('usuarios')]
            if 'acceso_carniceria' not in columnas_usuarios:
                conn.execute(text("ALTER TABLE usuarios ADD COLUMN acceso_carniceria BOOLEAN DEFAULT 1"))
                conn.commit()
            if 'acceso_asadero' not in columnas_usuarios:
                conn.execute(text("ALTER TABLE usuarios ADD COLUMN acceso_asadero BOOLEAN DEFAULT 1"))
                conn.commit()
    except Exception as e:
        print(f"Migration error: {e}")

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