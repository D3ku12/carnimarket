from fastapi import FastAPI, Depends
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import init_db, seed_db, get_db, Producto, Venta
from datetime import datetime
from fastapi import Cookie, Response
from fastapi.responses import RedirectResponse
from auth import verificar_password, crear_token, verificar_token, ADMIN_USER, ADMIN_PASSWORD

app = FastAPI()

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
    response.set_cookie(key="token", value=token, httponly=True, max_age=28800)
    return {"token": token}

@app.get("/admin", response_class=HTMLResponse)
def admin(token: str = Cookie(default=None)):
    if not token or not verificar_token(token):
        return RedirectResponse(url="/login")
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
    cliente_id: int = None
    pagado: str = "pagado"
    fecha_venta: str = None
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

    nueva_venta = Venta(
        producto=venta.producto,
        kilos=venta.kilos,
        precio_kilo=producto.precio_kilo,
        subtotal=subtotal,
        fecha_venta=fecha,
        cliente_nombre=venta.cliente_nombre,
        cliente_id=venta.cliente_id,
        pagado=venta.pagado,
        notas=venta.notas
    )
    db.add(nueva_venta)
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

# Panel admin - ver productos
@app.get("/admin/productos")
def admin_productos(db: Session = Depends(get_db)):
    return db.query(Producto).all()

# Panel admin - actualizar stock
class StockUpdate(BaseModel):
    nombre: str
    stock: float

@app.put("/admin/stock")
def actualizar_stock(data: StockUpdate, db: Session = Depends(get_db)):
    producto = db.query(Producto).filter(Producto.nombre == data.nombre).first()
    if not producto:
        return {"error": "Producto no encontrado"}
    producto.stock = data.stock
    db.commit()
    return {"mensaje": f"Stock de {data.nombre} actualizado a {data.stock}kg"}

# Panel admin - agregar producto
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

# Eliminar producto
@app.delete("/admin/producto/{nombre}")
def eliminar_producto(nombre: str, db: Session = Depends(get_db)):
    producto = db.query(Producto).filter(Producto.nombre == nombre).first()
    if not producto:
        return {"error": "Producto no encontrado"}
    db.delete(producto)
    db.commit()
    return {"mensaje": f"{nombre} eliminado correctamente"}

# Ver ventas con filtros
@app.get("/admin/ventas")
def ver_ventas(
    fecha: str = None,
    cliente: str = None,
    pagado: str = None,
    db: Session = Depends(get_db)
):
    query = db.query(Venta)
    if fecha:
        from datetime import datetime as dt
        fecha_dt = dt.strptime(fecha, "%Y-%m-%d")
        query = query.filter(
            Venta.fecha >= fecha_dt,
            Venta.fecha < fecha_dt.replace(hour=23, minute=59)
        )
    if cliente:
        query = query.filter(Venta.cliente.ilike(f"%{cliente}%"))
    if pagado:
        query = query.filter(Venta.pagado == pagado)

    ventas = query.order_by(Venta.fecha.desc()).all()
    return [
        {
            "id": v.id,
            "fecha": v.fecha.strftime("%Y-%m-%d %H:%M"),
            "producto": v.producto,
            "kilos": v.kilos,
            "subtotal": v.subtotal,
            "cliente": v.cliente,
            "pagado": v.pagado,
            "notas": v.notas
        } for v in ventas
    ]

# Actualizar estado de pago
class PagoUpdate(BaseModel):
    pagado: str

@app.put("/admin/venta/{venta_id}/pago")
def actualizar_pago(venta_id: int, data: PagoUpdate, db: Session = Depends(get_db)):
    venta = db.query(Venta).filter(Venta.id == venta_id).first()
    if not venta:
        return {"error": "Venta no encontrada"}
    venta.pagado = data.pagado
    db.commit()
    return {"mensaje": "Estado de pago actualizado"}

# Resumen de deudas
@app.get("/admin/deudas")
def ver_deudas(db: Session = Depends(get_db)):
    ventas = db.query(Venta).filter(Venta.pagado == "debe").all()
    deudas = {}
    for v in ventas:
        if v.cliente not in deudas:
            deudas[v.cliente] = 0
        deudas[v.cliente] += v.subtotal
    total = sum(deudas.values())
    return {"deudas": deudas, "total_pendiente": total}
# Listar clientes
@app.get("/admin/clientes")
def ver_clientes(db: Session = Depends(get_db)):
    from database import Cliente
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

# Agregar cliente
@app.post("/admin/cliente")
def agregar_cliente(data: ClienteRequest, db: Session = Depends(get_db)):
    from database import Cliente
    existe = db.query(Cliente).filter(Cliente.nombre == data.nombre).first()
    if existe:
        return {"error": "El cliente ya existe"}
    nuevo = Cliente(nombre=data.nombre, telefono=data.telefono, direccion=data.direccion)
    db.add(nuevo)
    db.commit()
    return {"mensaje": f"Cliente {data.nombre} agregado", "id": nuevo.id}

# Eliminar cliente
@app.delete("/admin/cliente/{cliente_id}")
def eliminar_cliente(cliente_id: int, db: Session = Depends(get_db)):
    from database import Cliente
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cliente:
        return {"error": "Cliente no encontrado"}
    db.delete(cliente)
    db.commit()
    return {"mensaje": "Cliente eliminado"}

# Marcar fecha de pago
class PagoUpdate(BaseModel):
    pagado: str
    fecha_pago: str = None

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