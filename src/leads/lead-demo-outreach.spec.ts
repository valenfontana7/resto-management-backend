import type { Lead } from '@prisma/client';

import {
  buildHeuristicDemoOutreach,
  ensureAdminLinkInOutreachBody,
  normalizeDemoOutreachOutput,
  pickLeadOutreachChannel,
} from './lead-demo-outreach';

describe('lead-demo-outreach', () => {
  const baseLead = {
    businessName: 'Arena Café',

    contactName: 'María',

    category: 'Café',

    city: 'Buenos Aires',

    whatsapp: '+5491112345678',

    instagram: null,

    email: null,

    hasWebsite: false,

    hasOnlineMenu: false,
  } as Lead;

  const demoUrl = 'https://bentoo.com.ar/demo/arena-cafe';

  const adminDemoUrl = 'https://bentoo.com.ar/demo/admin/arena-cafe';

  it('picks whatsapp when available', () => {
    expect(pickLeadOutreachChannel(baseLead)).toBe('whatsapp');
  });

  it('builds heuristic outreach with site and admin demo urls in body', () => {
    const result = buildHeuristicDemoOutreach(
      baseLead,

      demoUrl,

      adminDemoUrl,

      'Demo personalizada con menú y pedidos.',

      'whatsapp',
    );

    expect(result.body).toContain(demoUrl);

    expect(result.body).toContain(adminDemoUrl);

    expect(result.body).toContain('Arena Café');

    expect(result.body).toContain('desde el celular');

    expect(result.body).not.toContain('Demo personalizada con menú y pedidos.');

    expect(result.summary).toBe('Demo personalizada con menú y pedidos.');

    expect(result.adminDemoUrl).toBe(adminDemoUrl);

    expect(result.channel).toBe('whatsapp');
  });

  it('normalizes partial ai output and appends admin link when missing', () => {
    const result = normalizeDemoOutreachOutput(
      baseLead,
      demoUrl,
      adminDemoUrl,
      {
        summary: 'Resumen interno',

        body: `Hola! Mirá el sitio: ${demoUrl}`,

        channel: 'instagram',
      },
    );

    expect(result.body).toContain(demoUrl);

    expect(result.body).toContain(adminDemoUrl);

    expect(result.channel).toBe('instagram');

    expect(result.summary).toBe('Resumen interno');
  });

  it('does not duplicate admin link when already present', () => {
    const body = ensureAdminLinkInOutreachBody(
      `Sitio: ${demoUrl}\nAdmin: ${adminDemoUrl}`,

      adminDemoUrl,

      'whatsapp',
    );

    expect(body.split(adminDemoUrl)).toHaveLength(2);
  });

  it('offers operating system demo only when lead already has website', () => {
    const leadWithWebsite = {
      ...baseLead,
      hasWebsite: true,
      website: 'https://arenacafe.com',
      instagram: '@arenacafe',
      whatsapp: null,
    } as Lead;

    const result = buildHeuristicDemoOutreach(
      leadWithWebsite,
      demoUrl,
      adminDemoUrl,
      'Demo del sistema operativo.',
      'instagram',
    );

    expect(result.body).toContain(adminDemoUrl);
    expect(result.body).toContain('Sistema operativo');
    expect(result.body).not.toContain(demoUrl);
    expect(result.body).not.toMatch(/sitio\s*:/i);
  });

  it('strips public demo url from ai output when lead already has website', () => {
    const leadWithWebsite = {
      ...baseLead,
      hasWebsite: true,
      website: 'https://arenacafe.com',
    } as Lead;

    const result = normalizeDemoOutreachOutput(
      leadWithWebsite,
      demoUrl,
      adminDemoUrl,
      {
        summary: 'OS demo',
        body: `Hola! Mirá el sitio: ${demoUrl}`,
        channel: 'instagram',
      },
    );

    expect(result.body).not.toContain(demoUrl);
    expect(result.body).toContain(adminDemoUrl);
    expect(result.body).toContain('Sistema operativo');
  });
});
