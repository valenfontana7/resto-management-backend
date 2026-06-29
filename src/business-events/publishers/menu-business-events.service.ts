import { Injectable } from '@nestjs/common';
import { BusinessEventPublisherService } from '../business-event-publisher.service';
import { BentooBusinessEventType } from '../types/event-type.enum';

export type MenuChangeType = 'category' | 'dish' | 'modifier';

@Injectable()
export class MenuBusinessEventsService {
  constructor(private readonly publisher: BusinessEventPublisherService) {}

  publishMenuUpdated(
    restaurantId: string,
    changeType: MenuChangeType,
    entityId: string,
    entityName: string,
    source = 'menu',
  ): void {
    void this.publisher
      .publish({
        eventType: BentooBusinessEventType.MenuUpdated,
        restaurantId,
        source,
        correlationId: `${changeType}:${entityId}`,
        payload: {
          changeType,
          entityId,
          entityName,
        },
      })
      .catch(() => undefined);
  }

  publishPriceChanged(
    restaurantId: string,
    dish: {
      id: string;
      name: string;
      previousPrice: number;
      newPrice: number;
    },
    source = 'menu.dishes',
  ): void {
    void this.publisher
      .publish({
        eventType: BentooBusinessEventType.PriceChanged,
        restaurantId,
        source,
        correlationId: dish.id,
        payload: {
          dishId: dish.id,
          dishName: dish.name,
          previousPrice: dish.previousPrice,
          newPrice: dish.newPrice,
        },
      })
      .catch(() => undefined);
  }
}
