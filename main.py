from fastapi import FastAPI, Depends, Cookie, Response, Request
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import init_db, seed_db, get_db, Producto, Venta, Cliente
from datetime import datetime, timedelta
from auth import verificar_password, crear_token, verificar_token, ADMIN_USER, ADMIN_PASSWORD
from typing import Optional
from fastapi.staticfiles import StaticFiles
import io
import urllib.parse
from openpyxl import Workbook

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

class ClienteRequest(BaseModel):
    nombre: str
    telefono: str = ""
    direccion: str = ""

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
    if not producto:
        return {"error": "Producto no encontrado"}
    if venta.kilos > producto.stock:
        return {"error": f"Stock insuficiente. Solo hay {producto.stock}kg"}

    producto.stock -= venta.kilos
    subtotal = venta.kilos * producto.precio_kilo

    fecha = datetime.now()
    if venta.fecha_venta:
        try:
            fecha = datetime.strptime(venta.fecha_venta, "%Y-%m-%d")
        except:
            pass

    fecha_venc = None
    if venta.fecha_vencimiento:
        try:
            fecha_venc = datetime.strptime(venta.fecha_vencimiento, "%Y-%m-%d")
        except:
            pass

    nueva_venta = Venta(
        producto=venta.producto,
        kilos=venta.kilos,
        precio_kilo=producto.precio_kilo,
        subtotal=subtotal,
        fecha_venta=fecha,
        fecha_vencimiento=fecha_venc,
        cliente_nombre=venta.cliente_nombre,
        cliente_id=venta.cliente_id,
        pagado=venta.pagado,
        notas=venta.notas
    )
    db.add(nueva_venta)
    db.commit()

    from database import Historial
    historial = Historial(
        producto=venta.producto,
        tipo="salida",
        cantidad=venta.kilos,
        motivo=f"Venta a {venta.cliente_nombre}",
        fecha=datetime.now()
    )
    db.add(historial)
    db.commit()

    return {"producto": venta.producto, "kilos": venta.kilos, "subtotal": subtotal}

@app.get("/reportes")
def reportes(db: Session = Depends(get_db)):
    ventas = db.query(Venta).all()
    resumen = {}
    total = 0
    for v in ventas:
        resumen[v.producto] = resumen.get(v.producto, 0) + v.subtotal
        total += v.subtotal
    return {"resumen": resumen, "total": total}

class StockUpdate(BaseModel):
    nombre: str
    stock: float

@app.put("/admin/stock")
def actualizar_stock(data: StockUpdate, db: Session = Depends(get_db)):
    from database import Historial
    producto = db.query(Producto).filter(Producto.nombre == data.nombre).first()
    if not producto:
        return {"error": "Producto no encontrado"}
    diferencia = data.stock - producto.stock
    tipo = "entrada" if diferencia > 0 else "salida"
    producto.stock = data.stock
    historial = Historial(
        producto=data.nombre,
        tipo=tipo,
        cantidad=abs(diferencia),
        motivo="Actualización manual de stock",
        fecha=datetime.now()
    )
    db.add(historial)
    db.commit()
    return {"mensaje": f"Stock de {data.nombre} actualizado a {data.stock}kg"}

class ProductoNuevo(BaseModel):
    nombre: str
    stock: float
    minimo: float
    precio_kilo: float

@app.post("/admin/producto")
def agregar_producto(data: ProductoNuevo, db: Session = Depends(get_db)):
    existe = db.query(Producto).filter(Producto.nombre == data.nombre).first()
    if existe:
        return {"error": "El producto ya existe"}
    nuevo = Producto(
        nombre=data.nombre,
        stock=data.stock,
        minimo=data.minimo,
        precio_kilo=data.precio_kilo
    )
    db.add(nuevo)
    db.commit()
    return {"mensaje": f"Producto {data.nombre} agregado exitosamente"}

class ProductoEdit(BaseModel):
    stock: Optional[float] = None
    minimo: Optional[float] = None
    precio_kilo: Optional[float] = None
    nombre_nuevo: Optional[str] = None

@app.put("/admin/producto/{nombre}")
def editar_producto(nombre: str, data: ProductoEdit, db: Session = Depends(get_db)):
    producto = db.query(Producto).filter(Producto.nombre == nombre).first()
    if not producto:
        return {"error": "Producto no encontrado"}
    if data.stock is not None:
        producto.stock = data.stock
    if data.minimo is not None:
        producto.minimo = data.minimo
    if data.precio_kilo is not None:
        producto.precio_kilo = data.precio_kilo
    if data.nombre_nuevo:
        existe = db.query(Producto).filter(Producto.nombre == data.nombre_nuevo).first()
        if existe:
            return {"error": "Ya existe un producto con ese nombre"}
        producto.nombre = data.nombre_nuevo
    db.commit()
    return {"mensaje": "Producto actualizado correctamente"}

@app.delete("/admin/producto/{nombre}")
def eliminar_producto(nombre: str, db: Session = Depends(get_db)):
    producto = db.query(Producto).filter(Producto.nombre == nombre).first()
    if not producto:
        return {"error": "Producto no encontrado"}
    db.delete(producto)
    db.commit()
    return {"mensaje": f"{nombre} eliminado correctamente"}

@app.get("/admin/ventas")
def ver_ventas(
    fecha: str = None,
    cliente: str = None,
    pagado: str = None,
    db: Session = Depends(get_db)
):
    query = db.query(Venta)
    if fecha:
        fecha_dt = datetime.strptime(fecha, "%Y-%m-%d")
        query = query.filter(
            Venta.fecha_venta >= fecha_dt,
            Venta.fecha_venta < fecha_dt.replace(hour=23, minute=59)
        )
    if cliente:
        query = query.filter(Venta.cliente_nombre.ilike(f"%{cliente}%"))
    if pagado:
        query = query.filter(Venta.pagado == pagado)

    ventas = query.order_by(Venta.fecha_venta.desc()).all()
    return [
        {
            "id": v.id,
            "fecha_venta": v.fecha_venta.strftime("%Y-%m-%d %H:%M") if v.fecha_venta else "—",
            "fecha_pago": v.fecha_pago.strftime("%Y-%m-%d %H:%M") if v.fecha_pago else "—",
            "fecha_vencimiento": v.fecha_vencimiento.strftime("%Y-%m-%d") if v.fecha_vencimiento else "—",
            "producto": v.producto,
            "kilos": v.kilos,
            "precio_kilo": v.precio_kilo,
            "subtotal": v.subtotal,
            "cliente_nombre": v.cliente_nombre,
            "pagado": v.pagado,
            "notas": v.notas
        } for v in ventas
    ]

class PagoUpdate(BaseModel):
    pagado: str
    fecha_pago: Optional[str] = None

@app.put("/admin/venta/{venta_id}/pago")
def actualizar_pago(venta_id: int, data: PagoUpdate, db: Session = Depends(get_db)):
    venta = db.query(Venta).filter(Venta.id == venta_id).first()
    if not venta:
        return {"error": "Venta no encontrada"}
    venta.pagado = data.pagado
    if data.pagado == "pagado":
        venta.fecha_pago = datetime.now()
    else:
        venta.fecha_pago = None
    db.commit()
    return {"mensaje": "Estado de pago actualizado"}

class VentaEdit(BaseModel):
    kilos: Optional[float] = None
    pagado: Optional[str] = None
    cliente_nombre: Optional[str] = None
    notas: Optional[str] = None
    fecha_venta: Optional[str] = None
    fecha_vencimiento: Optional[str] = None

@app.put("/admin/venta/{venta_id}")
def editar_venta(venta_id: int, data: VentaEdit, db: Session = Depends(get_db)):
    venta = db.query(Venta).filter(Venta.id == venta_id).first()
    if not venta:
        return {"error": "Venta no encontrada"}
    if data.kilos is not None:
        venta.kilos = data.kilos
        venta.subtotal = data.kilos * venta.precio_kilo
    if data.pagado is not None:
        venta.pagado = data.pagado
        if data.pagado == "pagado" and not venta.fecha_pago:
            venta.fecha_pago = datetime.now()
        elif data.pagado == "debe":
            venta.fecha_pago = None
    if data.cliente_nombre is not None:
        venta.cliente_nombre = data.cliente_nombre
    if data.notas is not None:
        venta.notas = data.notas
    if data.fecha_venta is not None:
        try:
            venta.fecha_venta = datetime.strptime(data.fecha_venta, "%Y-%m-%d")
        except:
            pass
    if data.fecha_vencimiento is not None:
        try:
            venta.fecha_vencimiento = datetime.strptime(data.fecha_vencimiento, "%Y-%m-%d")
        except:
            venta.fecha_vencimiento = None
    db.commit()
    return {"mensaje": "Venta actualizada correctamente"}

@app.get("/admin/clientes")
def ver_clientes(db: Session = Depends(get_db)):
    clientes = db.query(Cliente).order_by(Cliente.nombre).all()
    return [
        {
            "id": c.id,
            "nombre": c.nombre,
            "telefono": c.telefono,
            "direccion": c.direccion,
            "fecha_registro": c.fecha_registro.strftime("%Y-%m-%d"),
        } for c in clientes
    ]

@app.post("/admin/cliente")
def agregar_cliente(data: ClienteRequest, db: Session = Depends(get_db)):
    existe = db.query(Cliente).filter(Cliente.nombre == data.nombre).first()
    if existe:
        return {"error": "El cliente ya existe"}
    nuevo = Cliente(nombre=data.nombre, telefono=data.telefono, direccion=data.direccion)
    db.add(nuevo)
    db.commit()
    return {"mensaje": f"Cliente {data.nombre} agregado", "id": nuevo.id}

class ClienteEdit(BaseModel):
    nombre: Optional[str] = None
    telefono: Optional[str] = None
    direccion: Optional[str] = None

@app.put("/admin/cliente/{cliente_id}")
def editar_cliente(cliente_id: int, data: ClienteEdit, db: Session = Depends(get_db)):
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cliente:
        return {"error": "Cliente no encontrado"}
    if data.nombre:
        cliente.nombre = data.nombre
    if data.telefono is not None:
        cliente.telefono = data.telefono
    if data.direccion is not None:
        cliente.direccion = data.direccion
    db.commit()
    return {"mensaje": "Cliente actualizado correctamente"}

@app.delete("/admin/cliente/{cliente_id}")
def eliminar_cliente(cliente_id: int, db: Session = Depends(get_db)):
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cliente:
        return {"error": "Cliente no encontrado"}
    db.delete(cliente)
    db.commit()
    return {"mensaje": "Cliente eliminado"}

class GastoRequest(BaseModel):
    descripcion: str
    categoria: str = "general"
    monto: float
    fecha: Optional[str] = None
    notas: str = ""

@app.post("/admin/gasto")
def agregar_gasto(data: GastoRequest, db: Session = Depends(get_db)):
    from database import Gasto
    fecha = datetime.now()
    if data.fecha:
        try:
            fecha = datetime.strptime(data.fecha, "%Y-%m-%d")
        except:
            pass
    nuevo = Gasto(
        descripcion=data.descripcion,
        categoria=data.categoria,
        monto=data.monto,
        fecha=fecha,
        notas=data.notas
    )
    db.add(nuevo)
    db.commit()
    return {"mensaje": f"Gasto registrado: ${data.monto:,.0f}"}

@app.get("/admin/gastos")
def ver_gastos(db: Session = Depends(get_db)):
    from database import Gasto
    gastos = db.query(Gasto).order_by(Gasto.fecha.desc()).all()
    return [
        {
            "id": g.id,
            "fecha": g.fecha.strftime("%Y-%m-%d"),
            "descripcion": g.descripcion,
            "categoria": g.categoria,
            "monto": g.monto,
            "notas": g.notas
        } for g in gastos
    ]

@app.delete("/admin/gasto/{gasto_id}")
def eliminar_gasto(gasto_id: int, db: Session = Depends(get_db)):
    from database import Gasto
    gasto = db.query(Gasto).filter(Gasto.id == gasto_id).first()
    if not gasto:
        return {"error": "Gasto no encontrado"}
    db.delete(gasto)
    db.commit()
    return {"mensaje": "Gasto eliminado"}

@app.get("/admin/caja")
def ver_caja(db: Session = Depends(get_db)):
    from database import Gasto
    ventas_cobradas = db.query(Venta).filter(Venta.pagado == "pagado").all()
    total_ingresos = sum(v.subtotal for v in ventas_cobradas)
    ventas_pendientes = db.query(Venta).filter(Venta.pagado == "debe").all()
    total_pendiente = sum(v.subtotal for v in ventas_pendientes)
    gastos = db.query(Gasto).all()
    total_gastos = sum(g.monto for g in gastos)
    saldo_real = total_ingresos - total_gastos
    categorias = {}
    for g in gastos:
        categorias[g.categoria] = categorias.get(g.categoria, 0) + g.monto
    return {
        "total_ingresos": total_ingresos,
        "total_gastos": total_gastos,
        "saldo_real": saldo_real,
        "total_pendiente": total_pendiente,
        "categorias": categorias
    }

class HistorialRequest(BaseModel):
    producto: str
    tipo: str
    cantidad: float
    motivo: str = ""

@app.post("/admin/historial")
def registrar_historial(data: HistorialRequest, db: Session = Depends(get_db)):
    from database import Historial
    nuevo = Historial(
        producto=data.producto,
        tipo=data.tipo,
        cantidad=data.cantidad,
        motivo=data.motivo,
        fecha=datetime.now()
    )
    db.add(nuevo)
    db.commit()
    return {"mensaje": "Movimiento registrado"}

@app.get("/admin/historial")
def ver_historial(db: Session = Depends(get_db)):
    from database import Historial
    movimientos = db.query(Historial).order_by(Historial.fecha.desc()).limit(100).all()
    return [
        {
            "id": m.id,
            "fecha": m.fecha.strftime("%Y-%m-%d %H:%M"),
            "producto": m.producto,
            "tipo": m.tipo,
            "cantidad": m.cantidad,
            "motivo": m.motivo
        } for m in movimientos
    ]

@app.get("/admin/dashboard")
def ver_dashboard(db: Session = Depends(get_db)):
    from database import Gasto, Historial
    
    hoy = datetime.now().date()
    hoy_inicio = datetime(hoy.year, hoy.month, hoy.day, 0, 0, 0)
    hoy_fin = datetime(hoy.year, hoy.month, hoy.day, 23, 59, 59)

    ventas_hoy = db.query(Venta).filter(
        Venta.fecha_venta >= hoy_inicio,
        Venta.fecha_venta <= hoy_fin
    ).all()
    total_hoy = sum(v.subtotal for v in ventas_hoy)

    mes_inicio = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    ventas_mes = db.query(Venta).filter(Venta.fecha_venta >= mes_inicio).all()
    total_mes = sum(v.subtotal for v in ventas_mes)

    ventas_cobradas = db.query(Venta).filter(Venta.pagado == "pagado").all()
    total_ingresos = sum(v.subtotal for v in ventas_cobradas)
    gastos = db.query(Gasto).all()
    total_gastos = sum(g.monto for g in gastos)

    ventas_pendientes = db.query(Venta).filter(Venta.pagado == "debe").all()
    total_pendiente = sum(v.subtotal for v in ventas_pendientes)

    todos_ventas = db.query(Venta).all()
    productos_ventas = {}
    for v in todos_ventas:
        productos_ventas[v.producto] = productos_ventas.get(v.producto, 0) + v.kilos

    ventas_7dias = {}
    for i in range(6, -1, -1):
        dia = (datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d")
        ventas_7dias[dia] = 0
    for v in todos_ventas:
        if v.fecha_venta:
            dia = v.fecha_venta.strftime("%Y-%m-%d")
            if dia in ventas_7dias:
                ventas_7dias[dia] += v.subtotal

    deudas_vencidas = db.query(Venta).filter(
        Venta.pagado == "debe",
        Venta.fecha_vencimiento <= datetime.now()
    ).all()

    productos_bajo = db.query(Producto).filter(Producto.stock <= Producto.minimo).all()
    stock_bajo = [
        {"nombre": p.nombre, "stock": p.stock, "minimo": p.minimo}
        for p in productos_bajo
    ]

    return {
        "total_hoy": total_hoy,
        "ventas_hoy": len(ventas_hoy),
        "total_mes": total_mes,
        "ventas_mes": len(ventas_mes),
        "saldo_real": total_ingresos - total_gastos,
        "total_pendiente": total_pendiente,
        "productos_ventas": dict(sorted(productos_ventas.items(), key=lambda x: x[1], reverse=True)[:5]),
        "ventas_7dias": ventas_7dias,
        "deudas_vencidas": [
            {
                "cliente": v.cliente_nombre,
                "subtotal": v.subtotal,
                "fecha_vencimiento": v.fecha_vencimiento.strftime("%Y-%m-%d") if v.fecha_vencimiento else "—"
            } for v in deudas_vencidas
        ],
        "stock_bajo": stock_bajo
    }

# EXPORTACIÓN EXCEL
@app.get("/admin/exportar/ventas")
def exportar_ventas(db: Session = Depends(get_db)):
    ventas = db.query(Venta).order_by(Venta.fecha_venta.desc()).all()
    
    wb = Workbook()
    ws = wb.active
    ws.title = "Reporte de Ventas"
    ws.append(["Fecha", "Cliente", "Producto", "Kilos", "Total", "Estado", "Notas"])
    
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
    
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    
    return StreamingResponse(
        output, 
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 
        headers={"Content-Disposition": "attachment; filename=reporte_ventas.xlsx"}
    )

# DEUDAS WHATSAPP
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

    total_pendiente = sum(d["total"] for d in deudas.values())
    
    resultado = []
    for nombre, datos in deudas.items():
        monto = datos["total"]
        telefono = datos["telefono"].replace(" ", "").replace("+", "") if datos["telefono"] else ""
        whatsapp_link = ""
        
        if telefono:
            mensaje = f"Hola {nombre}, te escribimos de CarniMarket. Te recordamos amablemente que tienes un saldo pendiente de ${monto:,.0f}. ¡Gracias por tu preferencia!"
            mensaje_url = urllib.parse.quote(mensaje)
            whatsapp_link = f"https://wa.me/57{telefono}?text={mensaje_url}"
            
        resultado.append({
            "cliente": nombre,
            "total": monto,
            "telefono": telefono,
            "whatsapp_link": whatsapp_link
        })

    return {"deudas": resultado, "total_pendiente": total_pendiente}