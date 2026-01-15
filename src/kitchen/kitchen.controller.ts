import { Controller, Get, Param, Sse } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { MessageEvent } from '@nestjs/common';

@ApiTags('kitchen')
@Controller('api/restaurants/:restaurantId/kitchen')
export class KitchenController {
  @Get('notifications')
  @Sse()
  async notifications(
    @Param('restaurantId') restaurantId: string,
  ): Promise<Observable<MessageEvent>> {
    return new Observable<MessageEvent>((observer) => {
      // Escuchar cambios en pedidos del restaurante
      // Enviar eventos cuando se creen/actualicen pedidos
      const interval = setInterval(() => {
        observer.next({
          data: JSON.stringify({
            type: 'order_created',
            orderId: '123',
            restaurantId,
            data: { orderNumber: '001' },
          }),
        });
      }, 10000); // Temporal para testing

      return () => clearInterval(interval);
    });
  }
}
