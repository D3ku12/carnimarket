ventas = [
    {"producto": "Lomo", "kilos": 2.5, "precio_kilo": 30000},
    {"producto": "Costilla", "kilos": 1.0, "precio_kilo": 18000},
    {"producto": "Molida", "kilos": 3.0, "precio_kilo": 15000},
    {"producto": "pierna", "kilos": 15.0, "precio_kilo": 18000},
    {"producto": "brazo", "kilos": 10.0, "precio_kilo": 18000},
]

total = 0
print("=== Ventas del día ===")
for venta in ventas:
    subtotal = venta["kilos"] * venta["precio_kilo"]
    total += subtotal
    print(f"{venta['producto']}: {venta['kilos']}kg x ${venta['precio_kilo']:,} = ${subtotal:,}")

print(f"\nTotal del día: ${total:,}")
