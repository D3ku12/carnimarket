import csv
from collections import defaultdict
from datetime import date

archivo = "ventas.csv"

# Pedir fecha al usuario
print("=== Reporte por Fechas ===")
print("1. Reporte de hoy")
print("2. Reporte de una fecha específica")
print("3. Reporte total histórico")
opcion = input("Opción: ").strip()

if opcion == "1":
    fecha_filtro = str(date.today())
    titulo = f"Reporte del {fecha_filtro}"
elif opcion == "2":
    fecha_filtro = input("Escribe la fecha (YYYY-MM-DD): ").strip()
    titulo = f"Reporte del {fecha_filtro}"
elif opcion == "3":
    fecha_filtro = None
    titulo = "Reporte histórico completo"
else:
    print("❌ Opción inválida.")
    exit()

# Leer CSV y filtrar
resumen = defaultdict(float)
total_general = 0
ventas_encontradas = 0

with open(archivo, "r", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for fila in reader:
        if fecha_filtro is None or fila["fecha"] == fecha_filtro:
            resumen[fila["producto"]] += float(fila["subtotal"])
            total_general += float(fila["subtotal"])
            ventas_encontradas += 1

# Mostrar reporte
print(f"\n=== {titulo} ===")
if ventas_encontradas == 0:
    print("No hay ventas registradas para esta fecha.")
else:
    print(f"{'Producto':<12} {'Total vendido':>15}")
    print("-" * 28)
    for producto, total in sorted(resumen.items(), key=lambda x: x[1], reverse=True):
        print(f"{producto:<12} ${total:>14,.0f}")
    print("-" * 28)
    print(f"{'TOTAL':<12} ${total_general:>14,.0f}")
    print(f"\nVentas registradas: {ventas_encontradas}")