import csv
import os
from datetime import date

# Ventas del día
ventas = [
    {"producto": "Lomo", "kilos": 2.5, "precio_kilo": 30000},
    {"producto": "Costilla", "kilos": 1.0, "precio_kilo": 18000},
    {"producto": "Molida", "kilos": 3.0, "precio_kilo": 15000},
    {"producto": "Pierna", "kilos": 15.0, "precio_kilo": 18000},
    {"producto": "Brazo", "kilos": 10.0, "precio_kilo": 18000},
]

# Archivo donde se guardan
archivo = "ventas.csv"
hoy = date.today()

# Si el archivo no existe, crea el encabezado
existe = os.path.exists(archivo)

with open(archivo, "a", newline="", encoding="utf-8") as f:
    campos = ["fecha", "producto", "kilos", "precio_kilo", "subtotal"]
    writer = csv.DictWriter(f, fieldnames=campos)

    if not existe:
        writer.writeheader()

    total = 0
    print(f"=== Ventas del {hoy} ===")
    for venta in ventas:
        subtotal = venta["kilos"] * venta["precio_kilo"]
        total += subtotal
        writer.writerow({
            "fecha": hoy,
            "producto": venta["producto"],
            "kilos": venta["kilos"],
            "precio_kilo": venta["precio_kilo"],
            "subtotal": subtotal
        })
        print(f"{venta['producto']}: {venta['kilos']}kg x ${venta['precio_kilo']:,} = ${subtotal:,}")

print(f"\nTotal del día: ${total:,}")

print(f"Ventas guardadas en '{archivo}' ✅")
