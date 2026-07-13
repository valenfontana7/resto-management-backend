import { Injectable } from '@nestjs/common';
import { OwnershipService } from '../../common/services/ownership.service';

@Injectable()
export class RestaurantRefResolverService {
  constructor(private readonly ownership: OwnershipService) {}

  /** Acepta id (cuid) o slug del restaurante. */
  async resolveRestaurantId(ref: string): Promise<string> {
    return this.ownership.resolveRestaurantId(ref);
  }
}
