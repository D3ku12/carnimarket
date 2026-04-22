from fastapi import FastAPI, Depends, Cookie, Response, Request
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import init_db, seed_db, get_db, Producto, Venta, Cliente
from datetime import datetime, timedelta, timezone
from auth import verificar_password, crear_token, verificar_token, ADMIN_USER, ADMIN_PASSWORD
from typing import Optional
from fastapi.staticfiles import StaticFiles
import io
import urllib.parse
from openpyxl import Workbook

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")

def obtener_hora_colombia():
    return datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=5)

@app.on_event("startup")
def startup():
    init_db()
    seed_db()

@app.get("/", response_class=HTMLResponse)
def inicio():
    with open("templates/index.html", "r", encoding="utf-8") as f:
        return f.read()

@app.get("/login", response_class=HTMLResponse)
def login_page():
    with open("templates/login.html", "r", encoding="utf-8") as f:
        return f.read()

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

@app.get("/admin", response_class=HTMLResponse)
def admin(token: str = Cookie(default=None)):
    if not token or not verificar_token(token):
        return RedirectResponse(url="/login", status_code=302)
    with open("templates/admin.html", "r", encoding="utf-8") as f:
        return f.read()

@app.get("/inventario")
def ver_inventario(db: Session = Depends(get_db)):
    productos = db.query(Producto).all()
    return {p.nombre: {"stock": p.stock, "minimo": p.minimo, "precio_kilo": p.precio_kilo} for p in productos}

class VentaRequest(BaseModel):
    producto: str
    kilos: float
    cliente_nombre: str = "Cliente general"
    cliente_id: Optional[int] = None
    pagado: str = "pagado"
    fecha_venta: Optional[str] = None
    fecha_vencimiento: Optional[str] = None
    notas: str = ""

@app.post("/vender")
def vender(venta: VentaRequest, db: Session = Depends(get_db)):
    producto = db.query(Producto).filter(Producto.nombre == venta.producto).first()
    if not producto: return {"error": "Producto no encontrado"}
    if venta.kilos > producto.stock: return {"error": f"Stock insuficiente. Solo hay {producto.stock}kg"}
    producto.stock -= venta.kilos
    subtotal = venta.kilos * producto.precio_kilo
    fecha = obtener_hora_colombia()
    if venta.fecha_venta:
        try: fecha = datetime.strptime(venta.fecha_venta, "%Y-%m-%d")
        except: pass
    nueva_venta = Venta(producto=venta.producto, kilos=venta.kilos, precio_kilo=producto.precio_kilo, subtotal=subtotal, fecha_venta=fecha, cliente_nombre=venta.cliente_nombre, pagado=venta.pagado, notas=venta.notas)
    db.add(nueva_venta)
    db.commit()
    return {"producto": venta.producto, "kilos": venta.kilos, "subtotal": subtotal}

@app.get("/admin/exportar/ventas")
def exportar_ventas(db: Session = Depends(get_db)):
    ventas = db.query(Venta).order_by(Venta.fecha_venta.desc()).all()
    wb = Workbook()
    ws = wb.active
    ws.title = "Reporte"
    ws.append(["Fecha", "Cliente", "Producto", "Kilos", "Total", "Estado"])
    for v in ventas:
        ws.append([v.fecha_venta.strftime("%Y-%m-%d") if v.fecha_venta else "—", v.cliente_nombre, v.producto, v.kilos, v.subtotal, v.pagado])
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": "attachment; filename=ventas.xlsx"})

@app.get("/admin/deudas")
def ver_deudas(db: Session = Depends(get_db)):
    ventas = db.query(Venta).filter(Venta.pagado == "debe").all()
    deudas = {}
    for v in ventas:
        nombre = v.cliente_nombre or "Cliente general"
        if nombre not in deudas:
            cliente = db.query(Cliente).filter(Cliente.nombre == nombre).first()
            deudas[nombre] = {"total": 0, "telefono": cliente.telefono if cliente else ""}
        deudas[nombre]["total"] += v.subtotal
    res = []
    for n, d in deudas.items():
        wa = ""
        if d["telefono"]:
            msg = urllib.parse.quote(f"Hola {n}, saldo pendiente en CarniMarket: ${d['total']:,.0f}")
            wa = f"https://wa.me/57{d['telefono']}?text={msg}"
        res.append({"cliente": n, "total": d["total"], "whatsapp_link": wa})
    return {"deudas": res, "total_pendiente": sum(x["total"] for x in res)}

# Endpoints adicionales necesarios para el admin.js
@app.get("/admin/dashboard")
def ver_dashboard(db: Session = Depends(get_db)):
    hoy = obtener_hora_colombia().date()
    ventas_hoy = db.query(Venta).filter(Venta.fecha_venta >= datetime(hoy.year, hoy.month, hoy.day)).all()
    return {"total_hoy": sum(v.subtotal for v in ventas_hoy), "ventas_mes": 0, "total_mes": 0, "saldo_real": 0, "total_pendiente": 0, "productos_ventas": {}, "ventas_7dias": {}, "deudas_vencidas": [], "stock_bajo": []}

@app.get("/admin/clientes")
def ver_clientes(db: Session = Depends(get_db)):
    return [{"id": c.id, "nombre": c.nombre, "telefono": c.telefono, "direccion": c.direccion, "fecha_registro": c.fecha_registro.strftime("%Y-%m-%d")} for c in db.query(Cliente).all()]

@app.get("/admin/gastos")
def ver_gastos(db: Session = Depends(get_db)): return []
@app.get("/admin/caja")
def ver_caja(db: Session = Depends(get_db)): return {"total_ingresos": 0, "total_gastos": 0, "saldo_real": 0, "total_pendiente": 0, "categorias": {}}
@app.get("/admin/historial")
def ver_historial(db: Session = Depends(get_db)): return []