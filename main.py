from fastapi import FastAPI, Depends, Cookie, Response, Request, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import init_db, get_db, Producto, Venta, Cliente, Gasto, Historial
from datetime import datetime, timedelta, timezone
from auth import verificar_password, crear_token, verificar_token, ADMIN_USER, ADMIN_PASSWORD
from typing import Optional, List
from fastapi.staticfiles import StaticFiles
import io
import urllib.parse
from openpyxl import Workbook

app = FastAPI()

# Configuración de archivos estáticos
app.mount("/static", StaticFiles(directory="static"), name="static")

# --- UTILIDADES ---
def obtener_hora_colombia():
    return datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=5)

@app.on_event("startup")
def startup():
    init_db() # Crea las tablas en Railway si no existen. NO borra datos.

# --- RUTAS DE NAVEGACIÓN ---

@app.get("/", response_class=HTMLResponse)
def inicio():
    with open("templates/index.html", "r", encoding="utf-8") as f:
        return f.read()

@app.get("/login", response_class=HTMLResponse)
def login_page():
    with open("templates/login.html", "r", encoding="utf-8") as f:
        return f.read()

@app.get("/admin", response_class=HTMLResponse)
def admin(token: str = Cookie(default=None)):
    if not token or not verificar_token(token):
        return RedirectResponse(url="/login", status_code=302)
    with open("templates/admin.html", "r", encoding="utf-8") as f:
        return f.read()

# --- AUTENTICACIÓN ---

class LoginRequest(BaseModel):
    usuario: str
    password: str

@app.post("/auth/login")
def auth_login(data: LoginRequest, response: Response):
    if data.usuario != ADMIN_USER or not verificar_password(data.password, ADMIN_PASSWORD):
        return {"error": "Credenciales incorrectas"}
    token = crear_token({"sub": data.usuario})
    response.set_cookie(key="token", value=token, httponly=True, max_age=28800, samesite="lax", secure=False)
    return {"token": token}

# --- GESTIÓN DE INVENTARIO ---

@app.get("/inventario")
def ver_inventario(db: Session = Depends(get_db)):
    productos = db.query(Producto).order_by(Producto.nombre).all()
    return {p.nombre: {"stock": p.stock, "minimo": p.minimo, "precio_kilo": p.precio_kilo} for p in productos}

class ProductoRequest(BaseModel):
    nombre: str
    stock: float
    minimo: float
    precio_kilo: float

@app.post("/admin/producto")
def agregar_producto(p: ProductoRequest, db: Session = Depends(get_db)):
    existente = db.query(Producto).filter(Producto.nombre == p.nombre).first()
    if existente: return {"error": "El producto ya existe"}
    nuevo = Producto(nombre=p.nombre, stock=p.stock, minimo=p.minimo, precio_kilo=p.precio_kilo)
    db.add(nuevo)
    db.commit()
    return {"mensaje": f"Producto {p.nombre} creado"}

@app.put("/admin/stock")
def actualizar_stock_rapido(data: dict, db: Session = Depends(get_db)):
    prod = db.query(Producto).filter(Producto.nombre == data["nombre"]).first()
    if not prod: return {"error": "No encontrado"}
    diferencia = data["stock"] - prod.stock
    prod.stock = data["stock"]
    # Registrar en historial
    mov = Historial(producto=prod.nombre, tipo="entrada" if diferencia > 0 else "salida", 
                    cantidad=abs(diferencia), motivo="Ajuste manual", fecha=obtener_hora_colombia())
    db.add(mov)
    db.commit()
    return {"mensaje": "Stock actualizado e historial registrado"}

# --- GESTIÓN DE VENTAS ---

class VentaRequest(BaseModel):
    producto: str
    kilos: float
    cliente_nombre: str = "Cliente general"
    pagado: str = "pagado"
    notas: str = ""

@app.post("/vender")
def registrar_venta(v: VentaRequest, db: Session = Depends(get_db)):
    prod = db.query(Producto).filter(Producto.nombre == v.producto).first()
    if not prod: return {"error": "Producto no existe"}
    if v.kilos > prod.stock: return {"error": f"Solo quedan {prod.stock}kg"}
    
    prod.stock -= v.kilos
    subtotal = v.kilos * prod.precio_kilo
    
    nueva_venta = Venta(producto=v.producto, kilos=v.kilos, precio_kilo=prod.precio_kilo,
                        subtotal=subtotal, fecha_venta=obtener_hora_colombia(),
                        cliente_nombre=v.cliente_nombre, pagado=v.pagado, notas=v.notas)
    db.add(nueva_venta)
    db.commit()
    return {"mensaje": "Venta exitosa", "subtotal": subtotal}

@app.get("/admin/ventas")
def listar_ventas(db: Session = Depends(get_db)):
    ventas = db.query(Venta).order_by(Venta.id.desc()).limit(100).all()
    return [{
        "id": v.id, "fecha_venta": v.fecha_venta.strftime("%Y-%m-%d %H:%M"),
        "cliente_nombre": v.cliente_nombre, "producto": v.producto,
        "kilos": v.kilos, "subtotal": v.subtotal, "pagado": v.pagado
    } for v in ventas]

@app.put("/admin/venta/{venta_id}/pago")
def cambiar_estado_pago(venta_id: int, data: dict, db: Session = Depends(get_db)):
    venta = db.query(Venta).filter(Venta.id == venta_id).first()
    if not venta: return {"error": "Venta no encontrada"}
    venta.pagado = data["pagado"]
    db.commit()
    return {"mensaje": "Estado actualizado"}

# --- GESTIÓN DE CLIENTES ---

@app.get("/admin/clientes")
def ver_clientes(db: Session = Depends(get_db)):
    clientes = db.query(Cliente).order_by(Cliente.nombre).all()
    return [{"id": c.id, "nombre": c.nombre, "telefono": c.telefono, "direccion": c.direccion} for c in clientes]

@app.post("/admin/cliente")
def agregar_cliente(c: dict, db: Session = Depends(get_db)):
    nuevo = Cliente(nombre=c["nombre"], telefono=c.get("telefono", ""), direccion=c.get("direccion", ""))
    db.add(nuevo)
    db.commit()
    return {"mensaje": "Cliente agregado"}

# --- GESTIÓN DE GASTOS Y CAJA ---

@app.post("/admin/gasto")
def registrar_gasto(g: dict, db: Session = Depends(get_db)):
    nuevo = Gasto(descripcion=g["descripcion"], categoria=g["categoria"], 
                  monto=g["monto"], fecha=obtener_hora_colombia())
    db.add(nuevo)
    db.commit()
    return {"mensaje": "Gasto registrado"}

@app.get("/admin/caja")
def ver_caja(db: Session = Depends(get_db)):
    ventas_pagadas = db.query(Venta).filter(Venta.pagado == "pagado").all()
    total_ingresos = sum(v.subtotal for v in ventas_pagadas)
    gastos = db.query(Gasto).all()
    total_gastos = sum(g.monto for g in gastos)
    return {
        "total_ingresos": total_ingresos,
        "total_gastos": total_gastos,
        "saldo_real": total_ingresos - total_gastos
    }

# --- DASHBOARD, DEUDAS Y EXCEL ---

@app.get("/admin/dashboard")
def get_dashboard(db: Session = Depends(get_db)):
    hoy = obtener_hora_colombia().date()
    ventas_hoy = db.query(Venta).filter(Venta.fecha_venta >= datetime(hoy.year, hoy.month, hoy.day)).all()
    
    conteo = {}
    for v in db.query(Venta).all():
        conteo[v.producto] = conteo.get(v.producto, 0) + v.kilos
    
    alertas = db.query(Producto).filter(Producto.stock <= Producto.minimo).all()
    
    return {
        "total_hoy": sum(v.subtotal for v in ventas_hoy),
        "ventas_mes": len(db.query(Venta).all()), # Simplificado para performance
        "productos_ventas": conteo,
        "stock_bajo": [{"nombre": p.nombre, "stock": p.stock} for p in alertas]
    }

@app.get("/admin/deudas")
def get_deudas(db: Session = Depends(get_db)):
    ventas_debe = db.query(Venta).filter(Venta.pagado == "debe").all()
    deudores = {}
    for v in ventas_debe:
        if v.cliente_nombre not in deudores:
            c = db.query(Cliente).filter(Cliente.nombre == v.cliente_nombre).first()
            deudores[v.cliente_nombre] = {"total": 0, "telefono": c.telefono if c else ""}
        deudores[v.cliente_nombre]["total"] += v.subtotal
    
    res = []
    for nombre, d in deudores.items():
        wa = ""
        if d["telefono"]:
            msg = urllib.parse.quote(f"Hola {nombre}, recordamos tu saldo pendiente en CarniMarket: ${d['total']:,.0f}")
            wa = f"https://wa.me/57{d['telefono']}?text={msg}"
        res.append({"cliente": nombre, "total": d["total"], "whatsapp_link": wa})
    return {"deudas": res}

@app.get("/admin/exportar/ventas")
def export_excel(db: Session = Depends(get_db)):
    ventas = db.query(Venta).all()
    wb = Workbook()
    ws = wb.active
    ws.append(["Fecha", "Cliente", "Producto", "Kilos", "Total", "Estado"])
    for v in ventas:
        ws.append([v.fecha_venta.strftime("%Y-%m-%d"), v.cliente_nombre, v.producto, v.kilos, v.subtotal, v.pagado])
    
    stream = io.BytesIO()
    wb.save(stream)
    stream.seek(0)
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=ventas_carnimarket.xlsx"}
    )