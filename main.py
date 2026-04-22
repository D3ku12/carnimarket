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
    # UTC-5 para Colombia
    return datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=5)

@app.on_event("startup")
def startup():
    # Inicia las tablas si no existen, NO borra datos existentes
    init_db()

# --- MODELOS DE DATOS PARA PETICIONES ---
class LoginRequest(BaseModel):
    usuario: str
    password: str

class ProductoRequest(BaseModel):
    nombre: str
    stock: float
    minimo: float
    precio_kilo: float

class VentaRequest(BaseModel):
    producto: str
    kilos: float
    cliente_nombre: str = "Cliente general"
    pagado: str = "pagado"
    notas: str = ""
    fecha_venta: Optional[str] = None

class GastoRequest(BaseModel):
    descripcion: str
    categoria: str
    monto: float
    notas: str = ""

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

@app.post("/admin/producto")
def agregar_producto(p: ProductoRequest, db: Session = Depends(get_db)):
    existente = db.query(Producto).filter(Producto.nombre == p.nombre).first()
    if existente:
        return {"error": "El producto ya existe"}
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
    mov = Historial(
        producto=prod.nombre, 
        tipo="entrada" if diferencia > 0 else "salida", 
        cantidad=abs(diferencia), 
        motivo="Ajuste manual", 
        fecha=obtener_hora_colombia()
    )
    db.add(mov)
    db.commit()
    return {"mensaje": "Stock actualizado"}

@app.delete("/admin/producto/{nombre}")
def eliminar_producto(nombre: str, db: Session = Depends(get_db)):
    prod = db.query(Producto).filter(Producto.nombre == nombre).first()
    if not prod: return {"error": "No encontrado"}
    db.delete(prod)
    db.commit()
    return {"mensaje": "Producto eliminado"}

# --- GESTIÓN DE VENTAS ---

@app.post("/vender")
def registrar_venta(v: VentaRequest, db: Session = Depends(get_db)):
    prod = db.query(Producto).filter(Producto.nombre == v.producto).first()
    if not prod: return {"error": "Producto no existe"}
    if v.kilos > prod.stock: return {"error": f"Stock insuficiente ({prod.stock}kg)"}
    
    prod.stock -= v.kilos
    subtotal = v.kilos * prod.precio_kilo
    
    fecha = obtener_hora_colombia()
    if v.fecha_venta:
        try: fecha = datetime.strptime(v.fecha_venta, "%Y-%m-%d")
        except: pass

    nueva_venta = Venta(
        producto=v.producto, kilos=v.kilos, precio_kilo=prod.precio_kilo,
        subtotal=subtotal, fecha_venta=fecha,
        cliente_nombre=v.cliente_nombre, pagado=v.pagado, notas=v.notas
    )
    db.add(nueva_venta)
    db.commit()
    return {"mensaje": "Venta registrada", "subtotal": subtotal}

@app.get("/admin/ventas")
def listar_ventas(db: Session = Depends(get_db)):
    ventas = db.query(Venta).order_by(Venta.fecha_venta.desc()).limit(100).all()
    return [{
        "id": v.id,
        "fecha_venta": v.fecha_venta.strftime("%Y-%m-%d %H:%M") if v.fecha_venta else "—",
        "cliente_nombre": v.cliente_nombre,
        "producto": v.producto,
        "kilos": v.kilos,
        "subtotal": v.subtotal,
        "pagado": v.pagado,
        "notas": v.notas
    } for v in ventas]

@app.put("/admin/venta/{venta_id}/pago")
def cambiar_estado_pago(venta_id: int, data: dict, db: Session = Depends(get_db)):
    venta = db.query(Venta).filter(Venta.id == venta_id).first()
    if not venta: return {"error": "No encontrada"}
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

@app.delete("/admin/cliente/{id}")
def eliminar_cliente(id: int, db: Session = Depends(get_db)):
    cliente = db.query(Cliente).filter(Cliente.id == id).first()
    if not cliente: return {"error": "No encontrado"}
    db.delete(cliente)
    db.commit()
    return {"mensaje": "Cliente eliminado"}

# --- GESTIÓN DE GASTOS Y CAJA ---

@app.get("/admin/gastos")
def listar_gastos(db: Session = Depends(get_db)):
    gastos = db.query(Gasto).order_by(Gasto.fecha.desc()).all()
    return [{
        "id": g.id, "fecha": g.fecha.strftime("%Y-%m-%d"),
        "descripcion": g.descripcion, "categoria": g.categoria,
        "monto": g.monto, "notas": g.notas
    } for g in gastos]

@app.post("/admin/gasto")
def registrar_gasto(g: GastoRequest, db: Session = Depends(get_db)):
    nuevo = Gasto(descripcion=g.descripcion, categoria=g.categoria, monto=g.monto, notas=g.notas, fecha=obtener_hora_colombia())
    db.add(nuevo)
    db.commit()
    return {"mensaje": "Gasto registrado"}

@app.get("/admin/caja")
def ver_caja(db: Session = Depends(get_db)):
    ventas_pagadas = db.query(Venta).filter(Venta.pagado == "pagado").all()
    total_ingresos = sum(v.subtotal for v in ventas_pagadas)
    gastos = db.query(Gasto).all()
    total_gastos = sum(g.monto for g in gastos)
    
    ventas_debe = db.query(Venta).filter(Venta.pagado == "debe").all()
    total_pendiente = sum(v.subtotal for v in ventas_debe)

    # Agrupar por categoría
    categorias = {}
    for g in gastos:
        categorias[g.categoria] = categorias.get(g.categoria, 0) + g.monto

    return {
        "total_ingresos": total_ingresos,
        "total_gastos": total_gastos,
        "saldo_real": total_ingresos - total_gastos,
        "total_pendiente": total_pendiente,
        "categorias": categorias
    }

# --- DASHBOARD Y REPORTES ---

@app.get("/admin/dashboard")
def get_dashboard(db: Session = Depends(get_db)):
    ahora = obtener_hora_colombia()
    hoy_inicio = datetime(ahora.year, ahora.month, ahora.day)
    
    ventas_hoy = db.query(Venta).filter(Venta.fecha_venta >= hoy_inicio).all()
    
    conteo_prod = {}
    ventas_7dias = {}
    
    # Lógica de 7 días
    for i in range(7):
        dia = (ahora - timedelta(days=i)).strftime("%Y-%m-%d")
        ventas_7dias[dia] = 0

    todas = db.query(Venta).all()
    for v in todas:
        conteo_prod[v.producto] = conteo_prod.get(v.producto, 0) + v.kilos
        d_str = v.fecha_venta.strftime("%Y-%m-%d")
        if d_str in ventas_7dias:
            ventas_7dias[d_str] += v.subtotal

    alertas = db.query(Producto).filter(Producto.stock <= Producto.minimo).all()
    
    return {
        "total_hoy": sum(v.subtotal for v in ventas_hoy),
        "ventas_mes": len(todas),
        "total_mes": sum(v.subtotal for v in todas),
        "productos_ventas": dict(sorted(conteo_prod.items(), key=lambda x: x[1], reverse=True)[:5]),
        "ventas_7dias": ventas_7dias,
        "stock_bajo": [{"nombre": p.nombre, "stock": p.stock, "minimo": p.minimo} for p in alertas],
        "saldo_real": sum(v.subtotal for v in todas if v.pagado == "pagado") - sum(g.monto for g in db.query(Gasto).all()),
        "total_pendiente": sum(v.subtotal for v in todas if v.pagado == "debe")
    }

@app.get("/admin/deudas")
def get_deudas(db: Session = Depends(get_db)):
    ventas_debe = db.query(Venta).filter(Venta.pagado == "debe").all()
    deudores = {}
    for v in ventas_debe:
        nombre = v.cliente_nombre or "Cliente general"
        if nombre not in deudores:
            c = db.query(Cliente).filter(Cliente.nombre == nombre).first()
            deudores[nombre] = {"total": 0, "telefono": c.telefono if c else ""}
        deudores[nombre]["total"] += v.subtotal
    
    res = []
    for nombre, d in deudores.items():
        wa = ""
        if d["telefono"]:
            msg = urllib.parse.quote(f"Hola {nombre}, recordamos tu deuda en CarniMarket de ${d['total']:,.0f}. ¡Gracias!")
            wa = f"https://wa.me/57{d['telefono']}?text={msg}"
        res.append({"cliente": nombre, "total": d["total"], "whatsapp_link": wa})
    return {"deudas": res, "total_pendiente": sum(x["total"] for x in res)}

@app.get("/admin/exportar/ventas")
def export_excel(db: Session = Depends(get_db)):
    ventas = db.query(Venta).order_by(Venta.fecha_venta.desc()).all()
    wb = Workbook()
    ws = wb.active
    ws.title = "Reporte de Ventas"
    ws.append(["Fecha", "Cliente", "Producto", "Kilos", "Precio/Kg", "Total", "Estado", "Notas"])
    for v in ventas:
        ws.append([
            v.fecha_venta.strftime("%Y-%m-%d %H:%M") if v.fecha_venta else "—",
            v.cliente_nombre, v.producto, v.kilos, v.precio_kilo, v.subtotal, v.pagado, v.notas
        ])
    
    stream = io.BytesIO()
    wb.save(stream)
    stream.seek(0)
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=reporte_ventas_carnimarket.xlsx"}
    )

@app.get("/admin/historial")
def ver_historial(db: Session = Depends(get_db)):
    movs = db.query(Historial).order_by(Historial.fecha.desc()).limit(100).all()
    return [{
        "fecha": m.fecha.strftime("%Y-%m-%d %H:%M"),
        "producto": m.producto, "tipo": m.tipo,
        "cantidad": m.cantidad, "motivo": m.motivo
    } for m in movs]