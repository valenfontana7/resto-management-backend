import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RestaurantRefResolverService {
  constructor(private readonly prisma: PrismaService) {}

  /** Acepta id (cuid) o slug del restaurante. */
  async resolveRestaurantId(ref: string): Promise<string> {
    const trimmed = ref.trim();
    if (!trimmed) {
      throw new NotFoundException('Indicá el slug o id del restaurante');
    }

    const byId = await this.prisma.restaurant.findUnique({
      where: { id: trimmed },
      select: { id: true },
    });
    if (byId) return byId.id;

    const bySlug = await this.prisma.restaurant.findUnique({
      where: { slug: trimmed.toLowerCase() },
      select: { id: true },
    });
    if (bySlug) return bySlug.id;

    throw new NotFoundException(
      `Restaurante no encontrado: "${trimmed}" (probá con el slug, ej. la-parrilla)`,
    );
  }
}
