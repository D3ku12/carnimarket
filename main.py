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
    # Inicializa las tablas en la base de datos de Railway
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
    
    nuevo = Producto(
        nombre=p.nombre, 
        stock=p.stock, 
        minimo=p.minimo, 
        precio_kilo=p.precio_kilo
    )
    db.add(nuevo)
    db.commit()
    
    # Registrar en Historial
    ahora = obtener_hora_colombia()
    db.add(Historial(
        producto=p.nombre, tipo="entrada", cantidad=p.stock,
        motivo="Carga Inicial de Producto", fecha=ahora
    ))
    db.commit()
    return {"mensaje": "Producto creado con éxito"}

@app.put("/admin/stock")
def actualizar_stock_manual(data: dict, db: Session = Depends(get_db)):
    prod = db.query(Producto).filter(Producto.nombre == data["nombre"]).first()
    if not prod: return {"error": "No encontrado"}
    
    diferencia = data["stock"] - prod.stock
    tipo = "entrada" if diferencia > 0 else "salida"
    prod.stock = data["stock"]
    
    db.add(Historial(
        producto=prod.nombre, tipo=tipo, cantidad=abs(diferencia),
        motivo="Ajuste manual de inventario", fecha=obtener_hora_colombia()
    ))
    db.commit()
    return {"mensaje": "Stock actualizado"}

@app.delete("/admin/producto/{nombre}")
def eliminar_producto(nombre: str, db: Session = Depends(get_db)):
    p = db.query(Producto).filter(Producto.nombre == nombre).first()
    if p:
        db.delete(p)
        db.commit()
        return {"mensaje": "Producto eliminado"}
    return {"error": "No encontrado"}

# --- GESTIÓN DE CLIENTES ---

@app.get("/admin/clientes")
def get_clientes(db: Session = Depends(get_db)):
    clientes = db.query(Cliente).order_by(Cliente.nombre).all()
    return [
        {
            "id": c.id,
            "nombre": c.nombre,
            "telefono": c.telefono,
            "direccion": c.direccion,
            "fecha_registro": c.fecha_registro.strftime("%Y-%m-%d") if c.fecha_registro else "—"
        } for c in clientes
    ]

@app.post("/admin/cliente")
def crear_cliente(c: ClienteRequest, db: Session = Depends(get_db)):
    nuevo = Cliente(
        nombre=c.nombre, 
        telefono=c.telefono, 
        direccion=c.direccion, 
        fecha_registro=obtener_hora_colombia()
    )
    db.add(nuevo)
    db.commit()
    return {"mensaje": "Cliente guardado exitosamente"}

@app.put("/admin/cliente/{id}")
def editar_cliente(id: int, data: dict, db: Session = Depends(get_db)):
    c = db.query(Cliente).filter(Cliente.id == id).first()
    if not c: return {"error": "Cliente no encontrado"}
    c.nombre = data.get("nombre", c.nombre)
    c.telefono = data.get("telefono", c.telefono)
    c.direccion = data.get("direccion", c.direccion)
    db.commit()
    return {"mensaje": "Datos de cliente actualizados"}

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
    if not p: return {"error": "El producto no existe en inventario"}
    if v.kilos > p.stock: return {"error": f"Stock insuficiente. Solo quedan {p.stock}kg"}
    
    # Descontar del inventario
    p.stock -= v.kilos
    total_venta = v.kilos * p.precio_kilo
    ahora = obtener_hora_colombia()
    
    nueva_venta = Venta(
        producto=v.producto,
        kilos=v.kilos,
        precio_kilo=p.precio_kilo,
        subtotal=total_venta,
        fecha_venta=ahora,
        cliente_nombre=v.cliente_nombre,
        pagado=v.pagado,
        notas=v.notas
    )
    db.add(nueva_venta)
    
    # Registrar salida en el Historial
    db.add(Historial(
        producto=v.producto, tipo="salida", cantidad=v.kilos,
        motivo=f"Venta registrada a {v.cliente_nombre}", fecha=ahora
    ))
    
    db.commit()
    return {"mensaje": "Venta registrada con éxito", "total": total_venta}

@app.get("/admin/ventas")
def listar_ventas(db: Session = Depends(get_db)):
    ventas = db.query(Venta).order_by(Venta.fecha_venta.desc()).limit(150).all()
    return [
        {
            "id": v.id,
            "fecha_venta": v.fecha_venta.strftime("%Y-%m-%d %H:%M"),
            "cliente": v.cliente_nombre,
            "producto": v.producto,
            "kilos": v.kilos,
            "subtotal": v.subtotal,
            "pagado": v.pagado,
            "notas": v.notas
        } for v in ventas
    ]

@app.put("/admin/venta/{id}/pago")
def cambiar_estado_pago(id: int, db: Session = Depends(get_db)):
    v = db.query(Venta).filter(Venta.id == id).first()
    if not v: return {"error": "Venta no encontrada"}
    v.pagado = "pagado" if v.pagado == "debe" else "debe"
    db.commit()
    return {"mensaje": "Estado de pago actualizado"}

# --- DASHBOARD Y REPORTES ---

@app.get("/admin/dashboard")
def get_dashboard_data(db: Session = Depends(get_db)):
    ahora = obtener_hora_colombia()
    inicio_dia = ahora.replace(hour=0, minute=0, second=0)
    
    # Ventas Hoy
    v_hoy = db.query(Venta).filter(Venta.fecha_venta >= inicio_dia).all()
    total_hoy = sum(v.subtotal for v in v_hoy)
    
    # Ventas Mes
    inicio_mes = ahora.replace(day=1, hour=0, minute=0, second=0)
    v_mes = db.query(Venta).filter(Venta.fecha_venta >= inicio_mes).all()
    total_mes = sum(v.subtotal for v in v_mes)
    
    # Conteo para Gráfica de Barras
    conteo_productos = {}
    todas_ventas = db.query(Venta).all()
    for v in todas_ventas:
        conteo_productos[v.producto] = conteo_productos.get(v.producto, 0) + v.kilos
    
    # Alertas Stock Bajo
    alertas = db.query(Producto).filter(Producto.stock <= Producto.minimo).all()
    
    return {
        "total_hoy": total_hoy,
        "ventas_hoy_conteo": len(v_hoy),
        "total_mes": total_mes,
        "productos_ventas": dict(sorted(conteo_productos.items(), key=lambda x: x[1], reverse=True)[:7]),
        "stock_bajo": [{"nombre": p.nombre, "stock": p.stock} for p in alertas]
    }

@app.get("/admin/deudas")
def get_reporte_deudas(db: Session = Depends(get_db)):
    ventas_deuda = db.query(Venta).filter(Venta.pagado == "debe").all()
    resumen = {}
    
    for v in ventas_deuda:
        nombre = v.cliente_nombre or "Cliente general"
        if nombre not in resumen:
            cli = db.query(Cliente).filter(Cliente.nombre == nombre).first()
            resumen[nombre] = {"total": 0, "tel": cli.telefono if cli else ""}
        resumen[nombre]["total"] += v.subtotal
    
    lista_deudas = []
    for nombre, datos in resumen.items():
        wa_link = ""
        if datos["tel"]:
            mensaje = urllib.parse.quote(f"Hola {nombre}, recordamos tu saldo de ${datos['total']:,.0f} en CarniMarket.")
            wa_link = f"https://wa.me/57{datos['tel']}?text={mensaje}"
        
        lista_deudas.append({
            "cliente": nombre,
            "total": datos["total"],
            "whatsapp_link": wa_link
        })
    
    return {"deudas": lista_deudas, "total_pendiente": sum(x["total"] for x in lista_deudas)}

@app.get("/admin/historial")
def ver_historial_movimientos(db: Session = Depends(get_db)):
    logs = db.query(Historial).order_by(Historial.fecha.desc()).limit(100).all()
    return [
        {
            "fecha": l.fecha.strftime("%Y-%m-%d %H:%M"),
            "producto": l.producto,
            "tipo": l.tipo,
            "cantidad": l.cantidad,
            "motivo": l.motivo
        } for l in logs
    ]

# --- EXPORTACIÓN EXCEL NATIVO ---

@app.get("/admin/exportar/ventas")
def generar_excel_ventas(db: Session = Depends(get_db)):
    ventas = db.query(Venta).order_by(Venta.fecha_venta.desc()).all()
    
    wb = Workbook()
    ws = wb.active
    ws.title = "Reporte de Ventas"
    
    # Encabezados con estilo
    headers = ["ID", "Fecha/Hora", "Cliente", "Producto", "Kilos", "Precio/Kg", "Total", "Estado"]
    ws.append(headers)
    
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="C0392B", end_color="C0392B", fill_type="solid")
    
    for cell in ws[1]:
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center")

    for v in ventas:
        ws.append([
            v.id,
            v.fecha_venta.strftime("%Y-%m-%d %H:%M"),
            v.cliente_nombre,
            v.producto,
            v.kilos,
            v.precio_kilo,
            v.subtotal,
            v.pagado
        ])

    # Auto-ajustar ancho de columnas
    for col in ws.columns:
        max_length = 0
        column = col[0].column_letter
        for cell in col:
            try:
                if len(str(cell.value)) > max_length:
                    max_length = len(str(cell.value))
            except: pass
        ws.column_dimensions[column].width = max_length + 2

    stream = io.BytesIO()
    wb.save(stream)
    stream.seek(0)
    
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=Ventas_CarniMarket.xlsx"}
    )