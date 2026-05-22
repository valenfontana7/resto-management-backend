import { Injectable, Logger } from '@nestjs/common';

/**
 * Envío de mensajes WhatsApp al dueño usando CallMeBot.
 * El dueño debe haber obtenido su apikey enviando "I allow callmebot to send me messages"
 * al número de soporte de CallMeBot. Este servicio NO gestiona el cobro: solo dispara
 * la API una vez el dueño confirma que su canal está activo.
 */
@Injectable()
export class CallMeBotService {
  private readonly logger = new Logger(CallMeBotService.name);
  private readonly baseUrl = 'https://api.callmebot.com/whatsapp.php';

  async sendMessage(
    phone: string,
    apiKey: string,
    text: string,
  ): Promise<boolean> {
    if (!phone || !apiKey || !text) return false;

    const url = `${this.baseUrl}?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(apiKey)}`;

    try {
      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        this.logger.warn(
          `CallMeBot respondió ${res.status} para ${phone}: ${body.slice(0, 200)}`,
        );
        return false;
      }
      return true;
    } catch (err: any) {
      this.logger.error(
        `Error enviando WhatsApp a ${phone}: ${err?.message ?? err}`,
      );
      return false;
    }
  }
}
