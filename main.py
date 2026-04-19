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

class VentaRequest(BaseModel):
    producto: str
    kilos: float

@app.post("/vender")
def vender(venta: VentaRequest, db: Session = Depends(get_db)):
    producto = db.query(Producto).filter(Producto.nombre == venta.producto).first()
    if not producto:
        return {"error": "Producto no encontrado"}
    if venta.kilos > producto.stock:
        return {"error": f"Stock insuficiente. Solo hay {producto.stock}kg"}

    producto.stock -= venta.kilos
    subtotal = venta.kilos * producto.precio_kilo

    nueva_venta = Venta(
        producto=venta.producto,
        kilos=venta.kilos,
        precio_kilo=producto.precio_kilo,
        subtotal=subtotal,
        fecha=datetime.now()
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