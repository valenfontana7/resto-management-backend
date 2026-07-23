import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { DemoWorld } from '../types';
import { DEMO_FLAGSHIP_TAG, FLAGSHIP_DEMO_SLUGS } from '../types';
import { buildShowcasePayload } from './showcase-payload';

export async function upsertDemoExample(
  prisma: PrismaClient,
  world: DemoWorld,
): Promise<{ id: string; slug: string }> {
  const payload = buildShowcasePayload(world);
  const { profile } = world;

  const data = {
    name: profile.name,
    type: profile.type,
    cuisine: profile.cuisine,
    city: profile.city,
    neighborhood: profile.neighborhood,
    isPublic: true,
    leadId: null as string | null,
    isActive: true,
    isFeatured: true,
    sortOrder: profile.sortOrder,
    payload: payload as unknown as Prisma.InputJsonValue,
    updatedBy: 'seed:demo-flagships',
  };

  const example = await prisma.demoExample.upsert({
    where: { slug: profile.slug },
    create: {
      slug: profile.slug,
      ...data,
    },
    update: data,
  });

  // Demote non-flagship public demos from featured
  await prisma.demoExample.updateMany({
    where: {
      slug: { notIn: [...FLAGSHIP_DEMO_SLUGS] },
      isFeatured: true,
      isPublic: true,
    },
    data: { isFeatured: false },
  });

  return { id: example.id, slug: example.slug };
}

export { DEMO_FLAGSHIP_TAG };
