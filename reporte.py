import csv
from collections import defaultdict

archivo = "ventas.csv"

resumen = defaultdict(float)
total_general = 0

with open(archivo, "r", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for fila in reader:
        resumen[fila["producto"]] += float(fila["subtotal"])
        total_general += float(fila["subtotal"])

print("=== Reporte de ventas ===")
print(f"{'Producto':<12} {'Total vendido':>15}")
print("-" * 28)
for producto, total in sorted(resumen.items(), key=lambda x: x[1], reverse=True):
    print(f"{producto:<12} ${total:>14,.0f}")
print("-" * 28)
print(f"{'TOTAL':<12} ${total_general:>14,.0f}")