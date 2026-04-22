"""
Servicio de WhatsApp para envío automático de recordatorios
"""
import os
from twilio.rest import Client
from datetime import datetime, timedelta, timezone
import logging

logger = logging.getLogger(__name__)

class WhatsAppService:
    def __init__(self):
        self.account_sid = os.getenv("TWILIO_ACCOUNT_SID", "")
        self.auth_token = os.getenv("TWILIO_AUTH_TOKEN", "")
        self.from_number = os.getenv("TWILIO_WHATSAPP_FROM", "")
        
        if not all([self.account_sid, self.auth_token, self.from_number]):
            logger.warning("⚠️ Credenciales de Twilio no configuradas. Los recordatorios no se enviarán.")
            self.client = None
        else:
            self.client = Client(self.account_sid, self.auth_token)
    
    def enviar_recordatorio(self, numero_cliente: str, nombre_cliente: str, monto: float, fecha_vencimiento: str) -> bool:
        """
        Envía un recordatorio de pago por WhatsApp
        
        Args:
            numero_cliente: Número en formato +57XXXXXXXXXX
            nombre_cliente: Nombre del cliente
            monto: Monto a pagar
            fecha_vencimiento: Fecha de vencimiento formateada
            
        Returns:
            True si se envió correctamente, False si hubo error
        """
        if not self.client:
            logger.warning(f"Cliente no configurado. No se puede enviar a {numero_cliente}")
            return False
        
        # Validar que el número tenga formato correcto
        if not numero_cliente.startswith("+"):
            numero_cliente = f"+{numero_cliente}"
        
        # Mensaje personalizado
        mensaje = f"""
🔔 *Recordatorio de Pago* 

¡Hola {nombre_cliente}! 👋

Este es un recordatorio de que tu pago vence hoy.

📋 *Detalles:*
💵 Monto: ${monto:,.0f}
📅 Vencimiento: {fecha_vencimiento}

Por favor, realiza el pago a la brevedad posible.

Gracias por tu pronto pago 🙏
CarniMarket
        """.strip()
        
        try:
            message = self.client.messages.create(
                from_=f"whatsapp:{self.from_number}",
                body=mensaje,
                to=f"whatsapp:{numero_cliente}"
            )
            logger.info(f"✅ Mensaje enviado a {numero_cliente}. SID: {message.sid}")
            return True
        except Exception as e:
            logger.error(f"❌ Error al enviar mensaje a {numero_cliente}: {str(e)}")
            return False
    
    def enviar_mensaje_personalizado(self, numero_cliente: str, mensaje: str) -> bool:
        """Envía un mensaje personalizado"""
        if not self.client:
            return False
        
        if not numero_cliente.startswith("+"):
            numero_cliente = f"+{numero_cliente}"
        
        try:
            message = self.client.messages.create(
                from_=f"whatsapp:{self.from_number}",
                body=mensaje,
                to=f"whatsapp:{numero_cliente}"
            )
            logger.info(f"✅ Mensaje personalizado enviado a {numero_cliente}")
            return True
        except Exception as e:
            logger.error(f"❌ Error al enviar mensaje personalizado: {str(e)}")
            return False

whatsapp_service = WhatsAppService()
