import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateModifierGroupDto,
  UpdateModifierGroupDto,
  CreateModifierDto,
  UpdateModifierDto,
} from './dto/modifier.dto';
import { MenuBusinessEventsService } from '../business-events/publishers/menu-business-events.service';

@Injectable()
export class ModifiersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly menuEvents: MenuBusinessEventsService,
  ) {}

  async getGroupsByDish(dishId: string) {
    return this.prisma.modifierGroup.findMany({
      where: { dishId },
      orderBy: { order: 'asc' },
      include: {
        modifiers: {
          orderBy: { order: 'asc' },
        },
      },
    });
  }

  async createGroup(dishId: string, dto: CreateModifierGroupDto) {
    const group = await this.prisma.modifierGroup.create({
      data: {
        dishId,
        name: dto.name,
        required: dto.required ?? false,
        minSelect: dto.minSelect ?? 0,
        maxSelect: dto.maxSelect ?? 1,
        order: dto.order ?? 0,
      },
    });

    if (dto.modifiers?.length) {
      await this.prisma.modifier.createMany({
        data: dto.modifiers.map((m, i) => ({
          groupId: group.id,
          name: m.name,
          priceAdjustment: m.priceAdjustment ?? 0,
          isDefault: m.isDefault ?? false,
          order: m.order ?? i,
        })),
      });
    }

    const result = await this.prisma.modifierGroup.findUnique({
      where: { id: group.id },
      include: { modifiers: { orderBy: { order: 'asc' } } },
    });

    await this.publishModifierMenuEvent(dishId, group.id, group.name);
    return result;
  }

  async updateGroup(groupId: string, dto: UpdateModifierGroupDto) {
    const group = await this.prisma.modifierGroup.findUnique({
      where: { id: groupId },
    });
    if (!group)
      throw new NotFoundException('Grupo de modificadores no encontrado');

    const updated = await this.prisma.modifierGroup.update({
      where: { id: groupId },
      data: dto,
      include: { modifiers: { orderBy: { order: 'asc' } } },
    });

    await this.publishModifierMenuEvent(group.dishId, updated.id, updated.name);
    return updated;
  }

  async deleteGroup(groupId: string) {
    const group = await this.prisma.modifierGroup.findUnique({
      where: { id: groupId },
    });
    if (!group) throw new NotFoundException('Grupo no encontrado');

    await this.prisma.modifierGroup.delete({ where: { id: groupId } });
    await this.publishModifierMenuEvent(group.dishId, group.id, group.name);
    return { deleted: true };
  }

  async addModifier(groupId: string, dto: CreateModifierDto) {
    const group = await this.prisma.modifierGroup.findUnique({
      where: { id: groupId },
    });
    if (!group) throw new NotFoundException('Grupo no encontrado');

    const modifier = await this.prisma.modifier.create({
      data: {
        groupId,
        name: dto.name,
        priceAdjustment: dto.priceAdjustment ?? 0,
        isDefault: dto.isDefault ?? false,
        order: dto.order ?? 0,
      },
    });

    await this.publishModifierMenuEvent(
      group.dishId,
      modifier.id,
      modifier.name,
    );
    return modifier;
  }

  async updateModifier(modifierId: string, dto: UpdateModifierDto) {
    const mod = await this.prisma.modifier.findUnique({
      where: { id: modifierId },
      include: { group: true },
    });
    if (!mod) throw new NotFoundException('Modificador no encontrado');

    const updated = await this.prisma.modifier.update({
      where: { id: modifierId },
      data: dto,
    });

    await this.publishModifierMenuEvent(
      mod.group.dishId,
      updated.id,
      updated.name,
    );
    return updated;
  }

  async deleteModifier(modifierId: string) {
    const mod = await this.prisma.modifier.findUnique({
      where: { id: modifierId },
      include: { group: true },
    });
    if (!mod) throw new NotFoundException('Modificador no encontrado');

    await this.prisma.modifier.delete({ where: { id: modifierId } });
    await this.publishModifierMenuEvent(mod.group.dishId, mod.id, mod.name);
    return { deleted: true };
  }

  private async publishModifierMenuEvent(
    dishId: string,
    entityId: string,
    entityName: string,
  ): Promise<void> {
    const dish = await this.prisma.dish.findUnique({
      where: { id: dishId },
      select: { restaurantId: true },
    });
    if (!dish) return;

    this.menuEvents.publishMenuUpdated(
      dish.restaurantId,
      'modifier',
      entityId,
      entityName,
      'menu.modifiers',
    );
  }
}
