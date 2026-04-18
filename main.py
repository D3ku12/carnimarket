from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
import json, os, csv
from datetime import date

app = FastAPI()

def cargar_inventario():
    if not os.path.exists("stock.json"):
        return {}
    with open("stock.json", "r") as f:
        return json.load(f)

def guardar_inventario(inv):
    with open("stock.json", "w") as f:
        json.dump(inv, f, indent=2)

@app.get("/", response_class=HTMLResponse)
def inicio():
    with open("templates/index.html", "r", encoding="utf-8") as f:
        return f.read()

@app.get("/inventario")
def ver_inventario():
    return cargar_inventario()

class Venta(BaseModel):
    producto: str
    kilos: float

@app.post("/vender")
def vender(venta: Venta):
    inv = cargar_inventario()
    if venta.producto not in inv:
        return {"error": "Producto no encontrado"}
    if venta.kilos > inv[venta.producto]["stock"]:
        return {"error": f"Stock insuficiente. Solo hay {inv[venta.producto]['stock']}kg"}

    inv[venta.producto]["stock"] -= venta.kilos
    guardar_inventario(inv)

    subtotal = venta.kilos * inv[venta.producto]["precio_kilo"]
    archivo = "ventas.csv"
    existe = os.path.exists(archivo)
    with open(archivo, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["fecha","producto","kilos","precio_kilo","subtotal"])
        if not existe:
            writer.writeheader()
        writer.writerow({
            "fecha": date.today(),
            "producto": venta.producto,
            "kilos": venta.kilos,
            "precio_kilo": inv[venta.producto]["precio_kilo"],
            "subtotal": subtotal
        })

    return {"producto": venta.producto, "kilos": venta.kilos, "subtotal": subtotal}