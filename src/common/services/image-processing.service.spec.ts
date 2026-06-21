import { ImageProcessingService } from './image-processing.service';
import { S3Service } from '../../storage/s3.service';

describe('ImageProcessingService.toEmailAssetUrl', () => {
  const originalEnv = process.env;
  const presignedUrl =
    'https://resto-uploads.sfo2.digitaloceanspaces.com/uploads/restaurants/logo.png?X-Amz-Signature=abc';

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
    const createPresignedGetUrl = jest.fn().mockResolvedValue(presignedUrl);
    const tryExtractLogicalKey = jest.fn().mockReturnValue(null);
    const s3 = {
      buildProxyUrl,
      createPresignedGetUrl,
      tryExtractLogicalKey,
    } as unknown as S3Service;

    return {
      service: new ImageProcessingService(s3),
      createPresignedGetUrl,
      buildProxyUrl,
    };
  }

  it('genera presigned GET para keys de S3', async () => {
    const { service, createPresignedGetUrl } = createService();

    await expect(service.toEmailAssetUrl('restaurants/logo.png')).resolves.toBe(
      presignedUrl,
    );
    expect(createPresignedGetUrl).toHaveBeenCalledWith({
      key: 'restaurants/logo.png',
      expiresInSeconds: 60 * 60 * 24 * 7,
    });
  });

  it('genera presigned GET para rutas /api/uploads', async () => {
    const { service, createPresignedGetUrl } = createService();

    await expect(
      service.toEmailAssetUrl('/api/uploads/restaurants/logo.png'),
    ).resolves.toBe(presignedUrl);
    expect(createPresignedGetUrl).toHaveBeenCalledWith({
      key: 'restaurants/logo.png',
      expiresInSeconds: 60 * 60 * 24 * 7,
    });
  });

  it('genera presigned GET para URLs localhost guardadas en DB', async () => {
    const { service, createPresignedGetUrl } = createService();

    await expect(
      service.toEmailAssetUrl(
        'http://localhost:3000/api/uploads/restaurants/logo.png',
      ),
    ).resolves.toBe(presignedUrl);
    expect(createPresignedGetUrl).toHaveBeenCalledWith({
      key: 'restaurants/logo.png',
      expiresInSeconds: 60 * 60 * 24 * 7,
    });
  });

  it('conserva URLs externas públicas', async () => {
    const { service, createPresignedGetUrl } = createService();

    await expect(
      service.toEmailAssetUrl('https://images.unsplash.com/photo-123'),
    ).resolves.toBe('https://images.unsplash.com/photo-123');
    expect(createPresignedGetUrl).not.toHaveBeenCalled();
  });

  it('cae al proxy público si falla el presign', async () => {
    const { service, createPresignedGetUrl, buildProxyUrl } = createService();
    createPresignedGetUrl.mockRejectedValueOnce(new Error('S3 unavailable'));

    await expect(service.toEmailAssetUrl('restaurants/logo.png')).resolves.toBe(
      'https://www.bentoo.com.ar/api/uploads/restaurants/logo.png',
    );
    expect(buildProxyUrl).toHaveBeenCalledWith('restaurants/logo.png');
  });
});
