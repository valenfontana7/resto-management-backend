import {
  buildLocalServerAdvertisedUrl,
  getPrimaryLanIPv4,
} from './lan-ip.util';

describe('lan-ip.util', () => {
  it('buildLocalServerAdvertisedUrl uses explicit host when provided', () => {
    expect(buildLocalServerAdvertisedUrl(4000, '192.168.1.50')).toBe(
      'http://192.168.1.50:4000',
    );
  });

  it('buildLocalServerAdvertisedUrl falls back to localhost', () => {
    expect(buildLocalServerAdvertisedUrl(4000, '127.0.0.1')).toBe(
      'http://127.0.0.1:4000',
    );
  });

  it('getPrimaryLanIPv4 returns string or null without throwing', () => {
    const ip = getPrimaryLanIPv4();
    expect(ip === null || /^\d+\.\d+\.\d+\.\d+$/.test(ip)).toBe(true);
  });
});
