import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module';

describe('AppModule bootstrap (CI)', () => {
  it('compila el grafo DI completo', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    await moduleRef.close();
  }, 120_000);
});
