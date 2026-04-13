import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateModifierGroupDto,
  UpdateModifierGroupDto,
  CreateModifierDto,
  UpdateModifierDto,
} from './dto/modifier.dto';

@Injectable()
export class ModifiersService {
  constructor(private readonly prisma: PrismaService) {}

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

    // Create initial modifiers if provided
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

    return this.prisma.modifierGroup.findUnique({
      where: { id: group.id },
      include: { modifiers: { orderBy: { order: 'asc' } } },
    });
  }

  async updateGroup(groupId: string, dto: UpdateModifierGroupDto) {
    const group = await this.prisma.modifierGroup.findUnique({
      where: { id: groupId },
    });
    if (!group)
      throw new NotFoundException('Grupo de modificadores no encontrado');

    return this.prisma.modifierGroup.update({
      where: { id: groupId },
      data: dto,
      include: { modifiers: { orderBy: { order: 'asc' } } },
    });
  }

  async deleteGroup(groupId: string) {
    const group = await this.prisma.modifierGroup.findUnique({
      where: { id: groupId },
    });
    if (!group) throw new NotFoundException('Grupo no encontrado');

    await this.prisma.modifierGroup.delete({ where: { id: groupId } });
    return { deleted: true };
  }

  async addModifier(groupId: string, dto: CreateModifierDto) {
    return this.prisma.modifier.create({
      data: {
        groupId,
        name: dto.name,
        priceAdjustment: dto.priceAdjustment ?? 0,
        isDefault: dto.isDefault ?? false,
        order: dto.order ?? 0,
      },
    });
  }

  async updateModifier(modifierId: string, dto: UpdateModifierDto) {
    const mod = await this.prisma.modifier.findUnique({
      where: { id: modifierId },
    });
    if (!mod) throw new NotFoundException('Modificador no encontrado');

    return this.prisma.modifier.update({
      where: { id: modifierId },
      data: dto,
    });
  }

  async deleteModifier(modifierId: string) {
    const mod = await this.prisma.modifier.findUnique({
      where: { id: modifierId },
    });
    if (!mod) throw new NotFoundException('Modificador no encontrado');

    await this.prisma.modifier.delete({ where: { id: modifierId } });
    return { deleted: true };
  }
}
