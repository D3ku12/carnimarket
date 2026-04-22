"""
Scheduler para automatizar envío de recordatorios de WhatsApp
"""
import os
import logging
from datetime import datetime, timezone, timedelta
from apscheduler.schedulers.background import BackgroundScheduler

logger = logging.getLogger(__name__)
scheduler = BackgroundScheduler()

def obtener_hora_colombia():
    return datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=5)

def enviar_recordatorios_vencidos():
    try:
        from database import SessionLocal, Venta, Cliente
        from whatsapp_service import whatsapp_service
        
        db = SessionLocal()
        try:
            ahora = obtener_hora_colombia()
            hoy = ahora.date()
            
            logger.info(f"Buscando deudas vencidas para hoy ({hoy})")
            
            ventas_vencidas = db.query(Venta).filter(
                Venta.pagado == "debe",
                Venta.fecha_vencimiento.isnot(None)
            ).all()
            
            recordatorios_enviados = 0
            
            for venta in ventas_vencidas:
                if venta.fecha_vencimiento.date() == hoy:
                    cliente = db.query(Cliente).filter(
                        Cliente.nombre == venta.cliente_nombre
                    ).first()
                    
                    if cliente and cliente.telefono:
                        numero = cliente.telefono
                        if not numero.startswith("+"):
                            numero = f"+57{numero}"
                        
                        if whatsapp_service.enviar_recordatorio(
                            numero_cliente=numero,
                            nombre_cliente=cliente.nombre,
                            monto=venta.subtotal,
                            fecha_vencimiento=venta.fecha_vencimiento.strftime("%d/%m/%Y")
                        ):
                            recordatorios_enviados += 1
            
            if recordatorios_enviados > 0:
                logger.info(f"Recordatorios enviados: {recordatorios_enviados}")
            else:
                logger.info("No hay deudas vencidas para hoy")
                
        finally:
            db.close()
            
    except Exception as e:
        logger.error(f"Error en scheduler: {str(e)}")

def iniciar_scheduler():
    if scheduler.running:
        return
    
    hora_str = os.getenv("RECORDATORIO_HORA", "08:00")
    try:
        hora, minuto = map(int, hora_str.split(":"))
    except:
        hora, minuto = 8, 0
    
    scheduler.add_job(
        enviar_recordatorios_vencidos,
        'cron',
        hour=hora,
        minute=minuto,
        id='enviar_recordatorios',
        name='Enviar recordatorios',
        replace_existing=True
    )
    
    scheduler.start()
    logger.info(f"Scheduler iniciado - Recordatorios a las {hora:02d}:{minuto:02d}")

def detener_scheduler():
    """Detiene el scheduler"""
    if scheduler.running:
        scheduler.shutdown()
        logger.info("⛔ Scheduler detenido")
