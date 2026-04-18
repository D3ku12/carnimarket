import csv
import os
import json
from datetime import date

# Cargar inventario
def cargar_inventario():
    if not os.path.exists("stock.json"):
        return {
            "Lomo":     {"stock": 10.0, "minimo": 3.0, "precio_kilo": 30000},
            "Costilla": {"stock": 5.0,  "minimo": 2.0, "precio_kilo": 18000},
            "Molida":   {"stock": 2.0,  "minimo": 3.0, "precio_kilo": 15000},
            "Pierna":   {"stock": 20.0, "minimo": 5.0, "precio_kilo": 18000},
            "Brazo":    {"stock": 1.0,  "minimo": 4.0, "precio_kilo": 18000},
        }
    with open("stock.json", "r") as f:
        return json.load(f)

# Guardar inventario
def guardar_inventario(inventario):
    with open("stock.json", "w") as f:
        json.dump(inventario, f, indent=2)

# Registrar venta
def registrar_venta(inventario):
    print("\n=== Nueva Venta ===")
    print("Productos disponibles:")
    for i, (producto, datos) in enumerate(inventario.items(), 1):
        print(f"  {i}. {producto} — Stock: {datos['stock']}kg — ${datos['precio_kilo']:,}/kg")

    producto = input("\n¿Qué producto? (escribe el nombre): ").strip().capitalize()

    if producto not in inventario:
        print("❌ Producto no encontrado.")
        return

    kilos = float(input(f"¿Cuántos kilos de {producto}?: "))

    if kilos > inventario[producto]["stock"]:
        print(f"❌ No hay suficiente stock. Solo hay {inventario[producto]['stock']}kg.")
        return

    # Descontar stock
    inventario[producto]["stock"] -= kilos
    guardar_inventario(inventario)

    # Guardar en CSV
    subtotal = kilos * inventario[producto]["precio_kilo"]
    archivo = "ventas.csv"
    existe = os.path.exists(archivo)
    with open(archivo, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["fecha","producto","kilos","precio_kilo","subtotal"])
        if not existe:
            writer.writeheader()
        writer.writerow({
            "fecha": date.today(),
            "producto": producto,
            "kilos": kilos,
            "precio_kilo": inventario[producto]["precio_kilo"],
            "subtotal": subtotal
        })

    print(f"\n✅ Venta registrada:")
    print(f"   {producto}: {kilos}kg x ${inventario[producto]['precio_kilo']:,} = ${subtotal:,}")
    print(f"   Stock restante: {inventario[producto]['stock']}kg")

    # Alerta si stock bajo
    if inventario[producto]["stock"] <= inventario[producto]["minimo"]:
        print(f"   ⚠️  ALERTA: Stock de {producto} está bajo, reponer pronto!")

# Main
inventario = cargar_inventario()
while True:
    print("\n¿Qué deseas hacer?")
    print("  1. Registrar venta")
    print("  2. Ver inventario")
    print("  3. Salir")
    opcion = input("Opción: ").strip()

    if opcion == "1":
        registrar_venta(inventario)
    elif opcion == "2":
        print("\n=== Inventario actual ===")
        for producto, datos in inventario.items():
            estado = "✅ OK" if datos["stock"] > datos["minimo"] else "⚠️ BAJO"
            print(f"  {producto}: {datos['stock']}kg {estado}")
    elif opcion == "3":
        print("👋 Hasta luego!")
        break
    else:
        print("❌ Opción inválida.")