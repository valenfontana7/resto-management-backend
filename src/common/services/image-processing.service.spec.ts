import { ImageProcessingService } from './image-processing.service';
import { S3Service } from '../../storage/s3.service';

describe('ImageProcessingService.toEmailAssetUrl', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      FRONTEND_URL: 'https://www.bentoo.com.ar',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function createService() {
    const buildProxyUrl = jest.fn((key: string) => `/api/uploads/${key}`);
    const tryExtractLogicalKey = jest.fn().mockReturnValue(null);
    const s3 = {
      buildProxyUrl,
      tryExtractLogicalKey,
    } as unknown as S3Service;

    return {
      service: new ImageProcessingService(s3),
      s3,
      buildProxyUrl,
      tryExtractLogicalKey,
    };
  }

  it('convierte una key de S3 a URL absoluta del proxy público', () => {
    const { service, buildProxyUrl } = createService();

    expect(service.toEmailAssetUrl('restaurants/logo.png')).toBe(
      'https://www.bentoo.com.ar/api/uploads/restaurants/logo.png',
    );
    expect(buildProxyUrl).toHaveBeenCalledWith('restaurants/logo.png');
  });

  it('normaliza rutas /api/uploads relativas al dominio público', () => {
    const { service } = createService();

    expect(service.toEmailAssetUrl('/api/uploads/restaurants/logo.png')).toBe(
      'https://www.bentoo.com.ar/api/uploads/restaurants/logo.png',
    );
  });

  it('reescribe URLs del backend al dominio público del frontend', () => {
    const { service } = createService();

    expect(
      service.toEmailAssetUrl(
        'https://api.bentoo.com.ar/api/uploads/restaurants/logo.png',
      ),
    ).toBe('https://www.bentoo.com.ar/api/uploads/restaurants/logo.png');
  });

  it('conserva URLs externas públicas', () => {
    const { service } = createService();

    expect(
      service.toEmailAssetUrl('https://images.unsplash.com/photo-123'),
    ).toBe('https://images.unsplash.com/photo-123');
  });

  it('convierte URLs del CDN propio al proxy accesible por correo', () => {
    const { service, tryExtractLogicalKey } = createService();
    tryExtractLogicalKey.mockReturnValue('restaurants/logo.png');

    expect(
      service.toEmailAssetUrl(
        'https://bucket.nyc3.digitaloceanspaces.com/restaurants/logo.png',
      ),
    ).toBe('https://www.bentoo.com.ar/api/uploads/restaurants/logo.png');
  });
});
