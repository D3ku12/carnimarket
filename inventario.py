# Inventario de CarniMarket
inventario = {
    "Lomo":     {"stock": 10.0, "minimo": 3.0, "precio_kilo": 30000},
    "Costilla": {"stock": 5.0,  "minimo": 2.0, "precio_kilo": 18000},
    "Molida":   {"stock": 2.0,  "minimo": 3.0, "precio_kilo": 15000},
    "Pierna":   {"stock": 20.0, "minimo": 5.0, "precio_kilo": 18000},
    "Brazo":    {"stock": 1.0,  "minimo": 4.0, "precio_kilo": 18000},
}

print("=== Inventario CarniMarket ===")
print(f"{'Producto':<12} {'Stock':>8} {'Mínimo':>8} {'Estado':>12}")
print("-" * 44)

alertas = []

for producto, datos in inventario.items():
    stock = datos["stock"]
    minimo = datos["minimo"]

    if stock == 0:
        estado = "⛔ AGOTADO"
        alertas.append((producto, stock, "AGOTADO"))
    elif stock <= minimo:
        estado = "⚠️  BAJO"
        alertas.append((producto, stock, "BAJO"))
    else:
        estado = "✅ OK"

    print(f"{producto:<12} {stock:>7.1f}kg {minimo:>7.1f}kg {estado:>12}")

print("-" * 44)

if alertas:
    print("\n🚨 ALERTAS:")
    for producto, stock, tipo in alertas:
        if tipo == "AGOTADO":
            print(f"   ⛔ {producto} está AGOTADO — reponer urgente")
        else:
            print(f"   ⚠️  {producto} tiene solo {stock}kg — reponer pronto")
else:
    print("\n✅ Todo el inventario está bien.")