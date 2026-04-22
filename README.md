# CarniMarket - Sistema de Gestion para Carniceria

Sistema de gestion de inventario, ventas, clientes y caja para carnicerias. Con panel de administracion responsive optimizado para moviles.

## Caracteristicas

- **Dashboard** - Estadisticas de ventas y alertas de stock bajo
- **Inventario** - Gestion de productos con stock y precios
- **Ventas** - Registro de ventas con opcion de credito y fecha de vencimiento
- **Caja** - Estado de cuenta con filtros por fecha
- **Clientes** - Gestion de clientes con telefono y direccion
- **Gastos** - Registro de gastos por categoria
- **Deudas** - Reporte de cobros pendientes con enlace a WhatsApp
- **Usuarios** - Roles: Admin, Dueno, Empleado

## Roles

| Rol | Permisos |
|-----|---------|
| Admin | Todo incluyendo gestion de usuarios |
| Dueno | Todo excepto usuarios |
| Empleado | Ventas, clientes, gastos |

## Tecnologia

- **Backend**: FastAPI + SQLAlchemy
- **Base de datos**: PostgreSQL (compatible con Railway, Supabase, etc.)
- **Frontend**: HTML/CSS/JS vanilla responsive
- **Autenticacion**: JWT con tokens seguros

## Instalacion

```bash
# Clonar repositorio
git clone https://github.com/tu-usuario/carnimarket.git
cd carnimarket

# Crear entorno virtual
python -m venv venv
source venv/bin/activate  # Linux/Mac
venv\Scripts\activate   # Windows

# Instalar dependencias
pip install -r requirements.txt

# Configurar variables
cp .env.example .env
# Editar .env con tus credenciales

# Ejecutar
uvicorn main:app --reload
```

## Variables de Entorno

```env
DATABASE_URL=postgresql://user:password@localhost:5432/carnimarket
SECRET_KEY=tu-clave-secreta
DEBUG=false
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=
```

## Despliegue en Railway

1. Conectar repositorio GitHub
2. Agregar variable `DATABASE_URL`
3. Railway detectara FastAPI automaticamente
4. Deploy automatico en cada push

## Changelog

### v2.0.0 - Rebranding y Optimizacion Movil
- UI completamente rediseñada con tema moderno
- Modal tipo "sheet" desde abajo en moviles
- Navegacion horizontal con scroll suave
- Grid responsivo mejorado
- Botones con mejor contraste
- Meta tags para PWA movil
- Iconos de Font Awesome actualizados

### v1.5.0 - Funciones Adicionales
- Rol "Dueno" con permisos completos excepto usuarios
- Edicion de ventas en tiempo real
- Boton de Google Calendar en deudas
- Verificacion de autenticacion al recargar pagina
- Seguridad: CORS, sanitizacion, rate limiting

### v1.0.0 - Funcionalidades Base
- Dashboard con estadisticas
- Inventario completo
- Sistema de ventas
- Caja con filtros
- Gestion de clientes
- Gastos por categoria
- Deudas con WhatsApp
- Sistema de usuarios y roles

## Licencia

MIT