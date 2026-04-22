"""
Scheduler para automatizar envío de recordatorios de WhatsApp
"""
import os
import logging
from datetime import datetime, timezone, timedelta
from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.orm import Session
from database import SessionLocal, Venta, Cliente
from whatsapp_service import whatsapp_service

logger = logging.getLogger(__name__)
scheduler = BackgroundScheduler()

def obtener_hora_colombia():
    """Obtener hora actual en Colombia (UTC-5)"""
    return datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=5)

def enviar_recordatorios_vencidos():
    """Tarea programada que envía recordatorios de deudas vencidas hoy"""
    db = SessionLocal()
    try:
        ahora = obtener_hora_colombia()
        hoy = ahora.date()
        
        logger.info(f"🔍 Buscando deudas vencidas para hoy ({hoy})...")
        
        # Buscar ventas con deuda que vencen hoy
        ventas_vencidas = db.query(Venta).filter(
            Venta.pagado == "debe",
            Venta.fecha_vencimiento.isnot(None)
        ).all()
        
        recordatorios_enviados = 0
        
        for venta in ventas_vencidas:
            if venta.fecha_vencimiento.date() == hoy:
                # Obtener datos del cliente
                cliente = db.query(Cliente).filter(
                    Cliente.nombre == venta.cliente_nombre
                ).first()
                
                if cliente and cliente.telefono:
                    numero = f"+57{cliente.telefono}" if not cliente.telefono.startswith("+") else cliente.telefono
                    
                    # Enviar recordatorio
                    if whatsapp_service.enviar_recordatorio(
                        numero_cliente=numero,
                        nombre_cliente=cliente.nombre,
                        monto=venta.subtotal,
                        fecha_vencimiento=venta.fecha_vencimiento.strftime("%d/%m/%Y")
                    ):
                        recordatorios_enviados += 1
                else:
                    logger.warning(f"⚠️ Cliente '{venta.cliente_nombre}' no tiene teléfono registrado")
        
        if recordatorios_enviados > 0:
            logger.info(f"✅ Se enviaron {recordatorios_enviados} recordatorios de deudas vencidas")
        else:
            logger.info("📭 No hay deudas vencidas para hoy")
            
    except Exception as e:
        logger.error(f"❌ Error al enviar recordatorios: {str(e)}")
    finally:
        db.close()

def iniciar_scheduler():
    """Inicia el scheduler de tareas automáticas"""
    if scheduler.running:
        return
    
    # Obtener horario del .env o usar default (08:00)
    hora_str = os.getenv("RECORDATORIO_HORA", "08:00")
    try:
        hora, minuto = map(int, hora_str.split(":"))
    except:
        hora, minuto = 8, 0
    
    # Agregar tarea diaria
    scheduler.add_job(
        enviar_recordatorios_vencidos,
        'cron',
        hour=hora,
        minute=minuto,
        id='enviar_recordatorios',
        name='Enviar recordatorios de deudas vencidas',
        replace_existing=True
    )
    
    scheduler.start()
    logger.info(f"✅ Scheduler iniciado - Recordatorios a las {hora:02d}:{minuto:02d} UTC-5 (Colombia)")

def detener_scheduler():
    """Detiene el scheduler"""
    if scheduler.running:
        scheduler.shutdown()
        logger.info("⛔ Scheduler detenido")
