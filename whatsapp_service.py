"""
Servicio de WhatsApp para envío automático de recordatorios
"""
import os
from datetime import datetime, timedelta, timezone
import logging

logger = logging.getLogger(__name__)

class WhatsAppService:
    def __init__(self):
        self.account_sid = os.getenv("TWILIO_ACCOUNT_SID", "")
        self.auth_token = os.getenv("TWILIO_AUTH_TOKEN", "")
        self.from_number = os.getenv("TWILIO_WHATSAPP_FROM", "")
        self.client = None
        
        if all([self.account_sid, self.auth_token, self.from_number]):
            try:
                from twilio.rest import Client
                self.client = Client(self.account_sid, self.auth_token)
                logger.info("WhatsApp configurado correctamente")
            except ImportError:
                logger.warning("Twilio no instalado. Recordatorios deshabilitados.")
        else:
            logger.info("WhatsApp no configurado. Recordatorios deshabilitados.")
    
    def enviar_recordatorio(self, numero_cliente: str, nombre_cliente: str, monto: float, fecha_vencimiento: str) -> bool:
        if not self.client:
            return False
        
        if not numero_cliente.startswith("+"):
            numero_cliente = f"+{numero_cliente}"
        
        mensaje = f"Hola {nombre_cliente}, te recuerdo que tu pago de ${monto:,.0f} vence el {fecha_vencimiento}. Gracias por tu pago a la brevedad. CarniMarket"
        
        try:
            message = self.client.messages.create(
                from_=f"whatsapp:{self.from_number}",
                body=mensaje,
                to=f"whatsapp:{numero_cliente}"
            )
            logger.info(f"Mensaje enviado a {numero_cliente}")
            return True
        except Exception as e:
            logger.error(f"Error al enviar mensaje: {str(e)}")
            return False
    
    def enviar_mensaje_personalizado(self, numero_cliente: str, mensaje: str) -> bool:
        if not self.client:
            return False
        
        if not numero_cliente.startswith("+"):
            numero_cliente = f"+{numero_cliente}"
        
        try:
            self.client.messages.create(
                from_=f"whatsapp:{self.from_number}",
                body=mensaje,
                to=f"whatsapp:{numero_cliente}"
            )
            return True
        except Exception as e:
            logger.error(f"Error: {str(e)}")
            return False

whatsapp_service = WhatsAppService()
