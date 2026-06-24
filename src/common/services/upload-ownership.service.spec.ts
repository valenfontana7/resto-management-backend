import { ForbiddenException } from '@nestjs/common';
import { UploadOwnershipService } from './upload-ownership.service';

describe('UploadOwnershipService', () => {
  const service = new UploadOwnershipService({} as any);

  describe('assertPublicProxyKeyAllowed', () => {
    it('allows legacy menu/branding prefixes', () => {
      expect(() =>
        service.assertPublicProxyKeyAllowed('images/dish-1.webp'),
      ).not.toThrow();
      expect(() =>
        service.assertPublicProxyKeyAllowed('categories/cat-1.webp'),
      ).not.toThrow();
    });

    it('allows restaurant-scoped logo and cover keys', () => {
      expect(() =>
        service.assertPublicProxyKeyAllowed(
          'restaurants/cmqsgcsdy002701nwxx055aze/logo/1782328526932-pouvbn.png',
        ),
      ).not.toThrow();
      expect(() =>
        service.assertPublicProxyKeyAllowed(
          'restaurants/abc123/cover/1782328616430-lcpd4g.png',
        ),
      ).not.toThrow();
      expect(() =>
        service.assertPublicProxyKeyAllowed(
          'restaurants/abc123/logo-1234567890.png',
        ),
      ).not.toThrow();
    });

    it('rejects keys outside public namespaces', () => {
      expect(() =>
        service.assertPublicProxyKeyAllowed('private/secrets/file.png'),
      ).toThrow(ForbiddenException);
      expect(() =>
        service.assertPublicProxyKeyAllowed('1782328616430-lcpd4g.png'),
      ).toThrow(ForbiddenException);
    });
  });
});
