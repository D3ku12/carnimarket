from fastapi import FastAPI, Depends, Cookie, Response, Request
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import init_db, seed_db, get_db, Producto, Venta, Cliente
from datetime import datetime, timedelta
from auth import verificar_password, crear_token, verificar_token, ADMIN_USER, ADMIN_PASSWORD
from typing import Optional
from fastapi.staticfiles import StaticFiles
from openpyxl import Workbook
import csv
import io
import urllib.parse

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")

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
    return {
        p.nombre: {
            "stock": p.stock,
            "minimo": p.minimo,
            "precio_kilo": p.precio_kilo
        } for p in productos
    }

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
    fecha = datetime.now()
    if venta.fecha_venta:
        try: fecha = datetime.strptime(venta.fecha_venta, "%Y-%m-%d")
        except: pass

    fecha_venc = None
    if venta.fecha_vencimiento:
        try: fecha_venc = datetime.strptime(venta.fecha_vencimiento, "%Y-%m-%d")
        except: pass

    nueva_venta = Venta(
        producto=venta.producto, kilos=venta.kilos, precio_kilo=producto.precio_kilo,
        subtotal=subtotal, fecha_venta=fecha, fecha_vencimiento=fecha_venc,
        cliente_nombre=venta.cliente_nombre, cliente_id=venta.cliente_id,
        pagado=venta.pagado, notas=venta.notas
    )
    db.add(nueva_venta)
    db.commit()

    from database import Historial
    historial = Historial(
        producto=venta.producto, tipo="salida", cantidad=venta.kilos,
        motivo=f"Venta a {venta.cliente_nombre}", fecha=datetime.now()
    )
    db.add(historial)
    db.commit()
    return {"producto": venta.producto, "kilos": venta.kilos, "subtotal": subtotal}

# --- NUEVO: RUTA PARA EXPORTAR EXCEL ---
@app.get("/admin/exportar/ventas")
def exportar_ventas(db: Session = Depends(get_db)):
    ventas = db.query(Venta).order_by(Venta.fecha_venta.desc()).all()
    
    # Creamos un libro de Excel en blanco
    wb = Workbook()
    ws = wb.active
    ws.title = "Reporte de Ventas"
    
    # Escribimos los encabezados en la primera fila
    ws.append(["Fecha", "Cliente", "Producto", "Kilos", "Total", "Estado", "Notas"])
    
    # Escribimos los datos de cada venta
    for v in ventas:
        fecha_str = v.fecha_venta.strftime("%Y-%m-%d %H:%M") if v.fecha_venta else "—"
        ws.append([
            fecha_str,
            v.cliente_nombre, 
            v.producto, 
            v.kilos, 
            v.subtotal, 
            v.pagado, 
            v.notas
        ])
    
    # Guardamos el archivo Excel en la memoria (BytesIO porque es un archivo binario)
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    
    # Retornamos el archivo con el tipo de dato oficial de Microsoft Excel (.xlsx)
    return StreamingResponse(
        output, 
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 
        headers={"Content-Disposition": "attachment; filename=reporte_ventas.xlsx"}
    )

# --- NUEVO: RUTA DE DEUDAS CON WHATSAPP ---
@app.get("/admin/deudas")
def ver_deudas(db: Session = Depends(get_db)):
    ventas = db.query(Venta).filter(Venta.pagado == "debe").all()
    deudas = {}
    for v in ventas:
        nombre = v.cliente_nombre or "Cliente general"
        if nombre not in deudas:
            cliente = db.query(Cliente).filter(Cliente.nombre == nombre).first()
            telefono = cliente.telefono if cliente else ""
            deudas[nombre] = {"total": 0, "telefono": telefono}
        deudas[nombre]["total"] += v.subtotal

    resultado = []
    for nombre, datos in deudas.items():
        monto = datos["total"]
        telefono = datos["telefono"].replace(" ", "").replace("+", "")
        wa_link = ""
        if telefono:
            msg = f"Hola {nombre}, te recordamos tu saldo pendiente en CarniMarket de ${monto:,.0f}."
            wa_link = f"https://wa.me/57{telefono}?text={urllib.parse.quote(msg)}"
        resultado.append({"cliente": nombre, "total": monto, "whatsapp_link": wa_link})
    return {"deudas": resultado, "total_pendiente": sum(d["total"] for d in deudas.values())}

# (Demás endpoints omitidos por brevedad, pero se mantienen igual que en tu versión original)
@app.get("/admin/dashboard")
def ver_dashboard(db: Session = Depends(get_db)):
    # ... (Misma lógica de dashboard que ya tienes)
    return {"total_hoy": 0} # Ejemplo