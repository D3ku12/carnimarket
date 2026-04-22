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

app = FastAPI(title="CarniMarket API - Full Version")

# Configuración de archivos estáticos
app.mount("/static", StaticFiles(directory="static"), name="static")

# --- LÓGICA DE TIEMPO ---
def obtener_hora_colombia():
    """Retorna la hora actual ajustada a la zona horaria de Colombia (UTC-5)"""
    return datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=5)

@app.on_event("startup")
def startup():
    """Inicializa la base de datos al arrancar el servidor"""
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

class ClienteRequest(BaseModel):
    nombre: str
    telefono: str = ""
    direccion: str = ""

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
    fecha: Optional[str] = None

class UpdateStockRequest(BaseModel):
    nombre: str
    stock: float

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
        return RedirectResponse(url="/login", status_code=status.HTTP_302_FOUND)
    with open("templates/admin.html", "r", encoding="utf-8") as f:
        return f.read()

# --- ENDPOINTS DE AUTENTICACIÓN ---

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
        secure=False # Cambiar a True si usas HTTPS
    )
    return {"token": token}

@app.post("/auth/logout")
def logout(response: Response):
    response.delete_cookie("token")
    return {"mensaje": "Sesión cerrada"}

# --- ENDPOINTS DE PRODUCTOS ---

@app.get("/inventario")
def listar_inventario(db: Session = Depends(get_db)):
    productos = db.query(Producto).order_by(Producto.nombre).all()
    return {
        p.nombre: {
            "stock": p.stock,
            "minimo": p.minimo,
            "precio_kilo": p.precio_kilo
        } for p in productos
    }

@app.post("/admin/producto")
def crear_producto(p: ProductoRequest, db: Session = Depends(get_db)):
    existe = db.query(Producto).filter(Producto.nombre == p.nombre).first()
    if existe:
        raise HTTPException(status_code=400, detail="El producto ya existe")
    
    nuevo = Producto(
        nombre=p.nombre, 
        stock=p.stock, 
        minimo=p.minimo, 
        precio_kilo=p.precio_kilo
    )
    db.add(nuevo)
    db.commit()
    
    # Historial
    hist = Historial(
        producto=p.nombre, tipo="entrada", cantidad=p.stock,
        motivo="Creación de producto", fecha=obtener_hora_colombia()
    )
    db.add(hist)
    db.commit()
    return {"mensaje": f"Producto {p.nombre} creado exitosamente"}

@app.put("/admin/stock")
def actualizar_stock_manual(data: UpdateStockRequest, db: Session = Depends(get_db)):
    prod = db.query(Producto).filter(Producto.nombre == data.nombre).first()
    if not prod:
        return {"error": "Producto no encontrado"}
    
    dif = data.stock - prod.stock
    if dif == 0: return {"mensaje": "Sin cambios"}
    
    tipo = "entrada" if dif > 0 else "salida"
    prod.stock = data.stock
    
    mov = Historial(
        producto=prod.nombre, tipo=tipo, cantidad=abs(dif),
        motivo="Actualización manual", fecha=obtener_hora_colombia()
    )
    db.add(mov)
    db.commit()
    return {"mensaje": "Stock actualizado"}

@app.delete("/admin/producto/{nombre}")
def borrar_producto(nombre: str, db: Session = Depends(get_db)):
    p = db.query(Producto).filter(Producto.nombre == nombre).first()
    if p:
        db.delete(p)
        db.commit()
        return {"mensaje": "Eliminado"}
    return {"error": "No encontrado"}

# --- ENDPOINTS DE CLIENTES ---

@app.get("/admin/clientes")
def get_clientes(db: Session = Depends(get_db)):
    clientes = db.query(Cliente).order_by(Cliente.nombre).all()
    return [
        {
            "id": c.id, "nombre": c.nombre, 
            "telefono": c.telefono, "direccion": c.direccion,
            "fecha_registro": c.fecha_registro.strftime("%Y-%m-%d") if c.fecha_registro else "—"
        } for c in clientes
    ]

@app.post("/admin/cliente")
def post_cliente(c: ClienteRequest, db: Session = Depends(get_db)):
    nuevo = Cliente(
        nombre=c.nombre, telefono=c.telefono, 
        direccion=c.direccion, fecha_registro=obtener_hora_colombia()
    )
    db.add(nuevo)
    db.commit()
    return {"mensaje": "Cliente guardado", "id": nuevo.id}

@app.put("/admin/cliente/{id}")
def put_cliente(id: int, data: dict, db: Session = Depends(get_db)):
    c = db.query(Cliente).filter(Cliente.id == id).first()
    if not c: return {"error": "No existe"}
    c.nombre = data.get("nombre", c.nombre)
    c.telefono = data.get("telefono", c.telefono)
    c.direccion = data.get("direccion", c.direccion)
    db.commit()
    return {"mensaje": "Cliente actualizado"}

# --- ENDPOINTS DE VENTAS ---

@app.post("/vender")
def registrar_venta(v: VentaRequest, db: Session = Depends(get_db)):
    p = db.query(Producto).filter(Producto.nombre == v.producto).first()
    if not p: return {"error": "Producto no existe"}
    if v.kilos > p.stock: return {"error": f"Solo hay {p.stock}kg"}
    
    p.stock -= v.kilos
    total = v.kilos * p.precio_kilo
    fecha = obtener_hora_colombia()
    
    nueva = Venta(
        producto=v.producto, kilos=v.kilos, precio_kilo=p.precio_kilo,
        subtotal=total, fecha_venta=fecha, cliente_nombre=v.cliente_nombre,
        pagado=v.pagado, notas=v.notas
    )
    db.add(nueva)
    
    # Movimiento historial
    mov = Historial(
        producto=v.producto, tipo="salida", cantidad=v.kilos,
        motivo=f"Venta a {v.cliente_nombre}", fecha=fecha
    )
    db.add(mov)
    db.commit()
    return {"mensaje": "Venta exitosa", "total": total}

@app.get("/admin/ventas")
def get_ventas(db: Session = Depends(get_db)):
    ventas = db.query(Venta).order_by(Venta.fecha_venta.desc()).limit(150).all()
    return [
        {
            "id": v.id, "fecha_venta": v.fecha_venta.strftime("%Y-%m-%d %H:%M"),
            "cliente": v.cliente_nombre, "producto": v.producto,
            "kilos": v.kilos, "subtotal": v.subtotal, "pagado": v.pagado, "notas": v.notas
        } for v in ventas
    ]

@app.put("/admin/venta/{id}")
def update_venta(id: int, data: dict, db: Session = Depends(get_db)):
    v = db.query(Venta).filter(Venta.id == id).first()
    if not v: return {"error": "No existe"}
    if "pagado" in data: v.pagado = data["pagado"]
    if "notas" in data: v.notas = data["notas"]
    if "kilos" in data:
        diff = data["kilos"] - v.kilos
        p = db.query(Producto).filter(Producto.nombre == v.producto).first()
        if p: p.stock -= diff
        v.kilos = data["kilos"]
        v.subtotal = v.kilos * v.precio_kilo
    db.commit()
    return {"mensaje": "Venta corregida"}

# --- ENDPOINTS DE GASTOS ---

@app.post("/admin/gasto")
def post_gasto(g: GastoRequest, db: Session = Depends(get_db)):
    fecha = obtener_hora_colombia()
    if g.fecha:
        try: fecha = datetime.strptime(g.fecha, "%Y-%m-%d")
        except: pass
    
    nuevo = Gasto(
        descripcion=g.descripcion, categoria=g.categoria,
        monto=g.monto, fecha=fecha
    )
    db.add(nuevo)
    db.commit()
    return {"mensaje": "Gasto registrado"}

@app.get("/admin/gastos")
def get_gastos(db: Session = Depends(get_db)):
    gs = db.query(Gasto).order_by(Gasto.fecha.desc()).all()
    return [
        {
            "id": g.id, "fecha": g.fecha.strftime("%Y-%m-%d"),
            "descripcion": g.descripcion, "monto": g.monto, "categoria": g.categoria
        } for g in gs
    ]

# --- DASHBOARD Y REPORTES FINANCIEROS ---

@app.get("/admin/dashboard")
def get_dashboard_data(db: Session = Depends(get_db)):
    ahora = obtener_hora_colombia()
    inicio_dia = ahora.replace(hour=0, minute=0, second=0, microsecond=0)
    inicio_mes = ahora.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    v_hoy = db.query(Venta).filter(Venta.fecha_venta >= inicio_dia).all()
    v_mes = db.query(Venta).filter(Venta.fecha_venta >= inicio_mes).all()
    
    # Productos para gráfica
    conteo = {}
    for v in db.query(Venta).all():
        conteo[v.producto] = conteo.get(v.producto, 0) + v.kilos
    
    # Alertas
    alertas = db.query(Producto).filter(Producto.stock <= Producto.minimo).all()
    
    return {
        "total_hoy": sum(v.subtotal for v in v_hoy),
        "conteo_hoy": len(v_hoy),
        "total_mes": sum(v.subtotal for v in v_mes),
        "productos_ventas": dict(sorted(conteo.items(), key=lambda x: x[1], reverse=True)[:7]),
        "stock_bajo": [{"nombre": p.nombre, "stock": p.stock} for p in alertas]
    }

@app.get("/admin/deudas")
def get_reporte_deudas(db: Session = Depends(get_db)):
    pendientes = db.query(Venta).filter(Venta.pagado == "debe").all()
    deudores = {}
    for v in pendientes:
        if v.cliente_nombre not in deudores:
            c = db.query(Cliente).filter(Cliente.nombre == v.cliente_nombre).first()
            deudores[v.cliente_nombre] = {"total": 0, "tel": c.telefono if c else ""}
        deudores[v.cliente_nombre]["total"] += v.subtotal
    
    res = []
    for nombre, d in deudores.items():
        wa = ""
        if d["tel"]:
            m = urllib.parse.quote(f"Hola {nombre}, recordamos tu saldo de ${d['total']:,.0f} en CarniMarket.")
            wa = f"https://wa.me/57{d['tel']}?text={m}"
        res.append({"cliente": nombre, "total": d["total"], "whatsapp_link": wa})
    
    return {"deudas": res, "total_pendiente": sum(x["total"] for x in res)}

@app.get("/admin/caja")
def get_estado_caja(db: Session = Depends(get_db)):
    ingresos = db.query(func.sum(Venta.subtotal)).filter(Venta.pagado == "pagado").scalar() or 0
    egresos = db.query(func.sum(Gasto.monto)).scalar() or 0
    pendientes = db.query(func.sum(Venta.subtotal)).filter(Venta.pagado == "debe").scalar() or 0
    
    return {
        "efectivo_real": ingresos - egresos,
        "total_gastos": egresos,
        "por_cobrar": pendientes
    }

# --- HISTORIAL ---

@app.get("/admin/historial")
def get_historial(db: Session = Depends(get_db)):
    logs = db.query(Historial).order_by(Historial.fecha.desc()).limit(200).all()
    return [
        {
            "fecha": l.fecha.strftime("%Y-%m-%d %H:%M"),
            "producto": l.producto, "tipo": l.tipo,
            "cantidad": l.cantidad, "motivo": l.motivo
        } for l in logs
    ]

# --- EXPORTACIÓN EXCEL NATIVO ---

@app.get("/admin/exportar/ventas")
def download_excel(db: Session = Depends(get_db)):
    ventas = db.query(Venta).order_by(Venta.fecha_venta.desc()).all()
    
    wb = Workbook()
    ws = wb.active
    ws.title = "Reporte de Ventas"
    
    # Estilos
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="C0392B", end_color="C0392B", fill_type="solid")
    
    headers = ["ID", "Fecha/Hora", "Cliente", "Producto", "Kilos", "Precio/Kg", "Total", "Estado", "Notas"]
    ws.append(headers)
    
    for cell in ws[1]:
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center")

    for v in ventas:
        ws.append([
            v.id, v.fecha_venta.strftime("%Y-%m-%d %H:%M"),
            v.cliente_nombre, v.producto, v.kilos, 
            v.precio_kilo, v.subtotal, v.pagado, v.notas
        ])

    # Auto-ajustar columnas
    for col in ws.columns:
        max_length = 0
        column = col[0].column_letter
        for cell in col:
            try:
                if len(str(cell.value)) > max_length:
                    max_length = len(str(cell.value))
            except: pass
        ws.column_dimensions[column].width = max_length + 2

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=Reporte_Ventas_CarniMarket.xlsx"}
    )
