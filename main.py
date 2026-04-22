from fastapi import FastAPI, Depends, Cookie, Response, Request, HTTPException, status
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import init_db, get_db, Producto, Venta, Cliente, Gasto, Historial
from datetime import datetime, timedelta, timezone
from auth import verificar_password, crear_token, verificar_token, ADMIN_USER, ADMIN_PASSWORD
from typing import Optional, List
from fastapi.staticfiles import StaticFiles
import io
import urllib.parse
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill

app = FastAPI(title="CarniMarket API - Versión Profesional")

# Configuración de archivos estáticos para CSS, JS e Imágenes
app.mount("/static", StaticFiles(directory="static"), name="static")

# --- UTILIDADES DE TIEMPO (ZONA HORARIA COLOMBIA UTC-5) ---
def obtener_hora_colombia():
    return datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=5)

@app.on_event("startup")
def startup():
    init_db()

# --- MODELOS DE ENTRADA (PYDANTIC) ---
class LoginRequest(BaseModel):
    usuario: str
    password: str

class ProductoRequest(BaseModel):
    nombre: str
    stock: float
    minimo: float
    precio_kilo: float

class ProductoUpdate(BaseModel):
    nombre: Optional[str] = None
    stock: Optional[float] = None
    minimo: Optional[float] = None
    precio_kilo: Optional[float] = None

class VentaRequest(BaseModel):
    producto: str
    kilos: float
    cliente_nombre: str = "Cliente general"
    pagado: str = "pagado"
    notas: str = ""

class ClienteRequest(BaseModel):
    nombre: str
    telefono: str = ""
    direccion: str = ""

class ClienteUpdate(BaseModel):
    nombre: Optional[str] = None
    telefono: Optional[str] = None
    direccion: Optional[str] = None

class GastoRequest(BaseModel):
    descripcion: str
    categoria: str
    monto: float

# --- RUTAS DE NAVEGACIÓN HTML ---

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
    response.set_cookie(
        key="token", 
        value=token, 
        httponly=True, 
        max_age=28800, 
        samesite="lax", 
        secure=False
    )
    return {"token": token}

@app.post("/auth/logout")
def logout(response: Response):
    response.delete_cookie("token")
    return {"mensaje": "Sesión cerrada"}

# --- GESTIÓN DE PRODUCTOS (INVENTARIO) ---

@app.get("/inventario")
def listar_inventario(db: Session = Depends(get_db)):
    productos = db.query(Producto).order_by(Producto.nombre).all()
    return {
        p.nombre: {
            "id": p.id,
            "stock": p.stock,
            "minimo": p.minimo,
            "precio_kilo": p.precio_kilo
        } for p in productos
    }

@app.post("/admin/producto")
def crear_producto(p: ProductoRequest, db: Session = Depends(get_db)):
    existe = db.query(Producto).filter(Producto.nombre == p.nombre).first()
    if existe:
        return {"error": "El producto ya existe"}
    nuevo = Producto(nombre=p.nombre, stock=p.stock, minimo=p.minimo, precio_kilo=p.precio_kilo)
    db.add(nuevo)
    db.commit()
    ahora = obtener_hora_colombia()
    db.add(Historial(producto=p.nombre, tipo="entrada", cantidad=p.stock, motivo="Carga Inicial", fecha=ahora))
    db.commit()
    return {"mensaje": "Producto creado con éxito"}

@app.put("/admin/producto/{id}")
def editar_producto_completo(id: int, data: ProductoUpdate, db: Session = Depends(get_db)):
    p = db.query(Producto).filter(Producto.id == id).first()
    if not p: return {"error": "No existe"}
    
    if data.precio_kilo is not None: p.precio_kilo = data.precio_kilo
    if data.minimo is not None: p.minimo = data.minimo
    if data.nombre is not None: p.nombre = data.nombre
    
    if data.stock is not None:
        dif = data.stock - p.stock
        if dif != 0:
            db.add(Historial(producto=p.nombre, tipo="ajuste", cantidad=abs(dif), motivo="Corrección manual", fecha=obtener_hora_colombia()))
        p.stock = data.stock
        
    db.commit()
    return {"mensaje": "Producto actualizado"}

@app.delete("/admin/producto/{id}")
def eliminar_producto_por_id(id: int, db: Session = Depends(get_db)):
    p = db.query(Producto).filter(Producto.id == id).first()
    if p:
        db.delete(p)
        db.commit()
        return {"mensaje": "Producto eliminado"}
    return {"error": "No encontrado"}

# --- GESTIÓN DE CLIENTES ---

@app.get("/admin/clientes")
def get_clientes(db: Session = Depends(get_db)):
    clientes = db.query(Cliente).order_by(Cliente.nombre).all()
    return [{"id": c.id, "nombre": c.nombre, "telefono": c.telefono, "direccion": c.direccion, "fecha_registro": c.fecha_registro.strftime("%Y-%m-%d") if c.fecha_registro else "—"} for c in clientes]

@app.post("/admin/cliente")
def crear_cliente(c: ClienteRequest, db: Session = Depends(get_db)):
    nuevo = Cliente(nombre=c.nombre, telefono=c.telefono, direccion=c.direccion, fecha_registro=obtener_hora_colombia())
    db.add(nuevo)
    db.commit()
    return {"mensaje": "Cliente guardado"}

@app.put("/admin/cliente/{id}")
def editar_cliente_completo(id: int, data: ClienteUpdate, db: Session = Depends(get_db)):
    c = db.query(Cliente).filter(Cliente.id == id).first()
    if not c: return {"error": "No encontrado"}
    if data.nombre: c.nombre = data.nombre
    if data.telefono: c.telefono = data.telefono
    if data.direccion: c.direccion = data.direccion
    db.commit()
    return {"mensaje": "Cliente actualizado"}

@app.delete("/admin/cliente/{id}")
def eliminar_cliente(id: int, db: Session = Depends(get_db)):
    c = db.query(Cliente).filter(Cliente.id == id).first()
    if c:
        db.delete(c)
        db.commit()
        return {"mensaje": "Cliente eliminado"}
    return {"error": "No existe"}

# --- GESTIÓN DE VENTAS ---

@app.post("/vender")
def registrar_venta(v: VentaRequest, db: Session = Depends(get_db)):
    p = db.query(Producto).filter(Producto.nombre == v.producto).first()
    if not p: return {"error": "El producto no existe"}
    if v.kilos > p.stock: return {"error": f"Stock insuficiente ({p.stock}kg)"}
    
    p.stock -= v.kilos
    total = v.kilos * p.precio_kilo
    ahora = obtener_hora_colombia()
    nueva_venta = Venta(producto=v.producto, kilos=v.kilos, precio_kilo=p.precio_kilo, subtotal=total, fecha_venta=ahora, cliente_nombre=v.cliente_nombre, pagado=v.pagado, notas=v.notas)
    db.add(nueva_venta)
    db.add(Historial(producto=v.producto, tipo="salida", cantidad=v.kilos, motivo=f"Venta a {v.cliente_nombre}", fecha=ahora))
    db.commit()
    return {"mensaje": "Venta exitosa", "total": total}

@app.get("/admin/ventas")
def listar_ventas(db: Session = Depends(get_db)):
    ventas = db.query(Venta).order_by(Venta.fecha_venta.desc()).limit(150).all()
    return [{"id": v.id, "fecha_venta": v.fecha_venta.strftime("%Y-%m-%d %H:%M"), "cliente": v.cliente_nombre, "producto": v.producto, "kilos": v.kilos, "subtotal": v.subtotal, "pagado": v.pagado, "notas": v.notas} for v in ventas]

@app.put("/admin/venta/{id}")
def corregir_venta(id: int, data: dict, db: Session = Depends(get_db)):
    v = db.query(Venta).filter(Venta.id == id).first()
    if not v: return {"error": "No existe"}
    if "pagado" in data: v.pagado = data["pagado"]
    if "notas" in data: v.notas = data["notas"]
    if "kilos" in data:
        dif = data["kilos"] - v.kilos
        p = db.query(Producto).filter(Producto.nombre == v.producto).first()
        if p: p.stock -= dif
        v.kilos = data["kilos"]
        v.subtotal = v.kilos * v.precio_kilo
    db.commit()
    return {"mensaje": "Venta corregida"}

# --- GESTIÓN DE GASTOS ---

@app.post("/admin/gasto")
def registrar_gasto(g: GastoRequest, db: Session = Depends(get_db)):
    nuevo = Gasto(descripcion=g.descripcion, categoria=g.categoria, monto=g.monto, fecha=obtener_hora_colombia())
    db.add(nuevo)
    db.commit()
    return {"mensaje": "Gasto registrado"}

@app.get("/admin/gastos")
def listar_gastos(db: Session = Depends(get_db)):
    gs = db.query(Gasto).order_by(Gasto.fecha.desc()).all()
    return [{"id": g.id, "fecha": g.fecha.strftime("%Y-%m-%d"), "descripcion": g.descripcion, "monto": g.monto, "categoria": g.categoria} for g in gs]

# --- REPORTES Y CAJA ---

@app.get("/admin/caja")
def estado_caja(db: Session = Depends(get_db)):
    ingresos = db.query(func.sum(Venta.subtotal)).filter(Venta.pagado == "pagado").scalar() or 0
    egresos = db.query(func.sum(Gasto.monto)).scalar() or 0
    return {"saldo_real": ingresos - egresos, "ingresos": ingresos, "egresos": egresos}

@app.get("/admin/dashboard")
def get_dashboard_data(db: Session = Depends(get_db)):
    ahora = obtener_hora_colombia()
    inicio_dia = ahora.replace(hour=0, minute=0, second=0)
    v_hoy = db.query(Venta).filter(Venta.fecha_venta >= inicio_dia).all()
    conteo = {}
    for v in db.query(Venta).all():
        conteo[v.producto] = conteo.get(v.producto, 0) + v.kilos
    alertas = db.query(Producto).filter(Producto.stock <= Producto.minimo).all()
    return {
        "total_hoy": sum(v.subtotal for v in v_hoy),
        "total_mes": sum(v.subtotal for v in db.query(Venta).filter(Venta.fecha_venta >= ahora.replace(day=1)).all()),
        "productos_ventas": dict(sorted(conteo.items(), key=lambda x: x[1], reverse=True)[:7]),
        "stock_bajo": [{"nombre": p.nombre, "stock": p.stock} for p in alertas]
    }

@app.get("/admin/deudas")
def get_reporte_deudas(db: Session = Depends(get_db)):
    pendientes = db.query(Venta).filter(Venta.pagado == "debe").all()
    resumen = {}
    for v in pendientes:
        if v.cliente_nombre not in resumen:
            cli = db.query(Cliente).filter(Cliente.nombre == v.cliente_nombre).first()
            resumen[v.cliente_nombre] = {"total": 0, "tel": cli.telefono if cli else ""}
        resumen[v.cliente_nombre]["total"] += v.subtotal
    res = [{"cliente": n, "total": d["total"], "whatsapp_link": f"https://wa.me/57{d['tel']}?text="+urllib.parse.quote(f"Hola {n}, saldo pendiente: ${d['total']:,.0f}") if d['tel'] else ""} for n, d in resumen.items()]
    return {"deudas": res, "total_pendiente": sum(x["total"] for x in res)}

@app.get("/admin/historial")
def ver_historial_movimientos(db: Session = Depends(get_db)):
    logs = db.query(Historial).order_by(Historial.fecha.desc()).limit(100).all()
    return [{"fecha": l.fecha.strftime("%Y-%m-%d %H:%M"), "producto": l.producto, "tipo": l.tipo, "cantidad": l.cantidad, "motivo": l.motivo} for l in logs]

@app.get("/admin/exportar/ventas")
def generar_excel_ventas(db: Session = Depends(get_db)):
    ventas = db.query(Venta).order_by(Venta.fecha_venta.desc()).all()
    wb = Workbook(); ws = wb.active; ws.title = "Reporte"
    headers = ["ID", "Fecha", "Cliente", "Producto", "Kilos", "Precio/Kg", "Total", "Estado"]
    ws.append(headers)
    for v in ventas:
        ws.append([v.id, v.fecha_venta.strftime("%Y-%m-%d %H:%M"), v.cliente_nombre, v.producto, v.kilos, v.precio_kilo, v.subtotal, v.pagado])
    stream = io.BytesIO(); wb.save(stream); stream.seek(0)
    return StreamingResponse(stream, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": "attachment; filename=Ventas.xlsx"})