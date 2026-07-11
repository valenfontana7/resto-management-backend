import { Injector } from '@nestjs/core/injector/injector';
import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module';

function patchInjectorForDiDebug(): void {
  const proto = Injector.prototype as {
    loadInstance: (...args: unknown[]) => Promise<unknown>;
  };
  const original = proto.loadInstance;
  proto.loadInstance = async function (
    this: unknown,
    wrapper: {
      token?: unknown;
      name?: unknown;
      metatype?: { name?: string };
      inject?: unknown[];
    },
    collection: { get: (token: unknown) => unknown },
    ...rest: unknown[]
  ) {
    const token = wrapper.token ?? wrapper.name;
    if (token === undefined || collection.get(token) === undefined) {
      // Visible en logs de GitHub Actions cuando el bootstrap falla en Linux.
      console.error('[DI-DEBUG] provider missing in module collection', {
        token,
        name: wrapper.name,
        metatype: wrapper.metatype?.name,
        inject: wrapper.inject?.map((entry) =>
          typeof entry === 'function'
            ? entry.name || String(entry)
            : String(entry),
        ),
      });
    }
    return original.call(this, wrapper, collection, ...rest);
  };
}

describe('AppModule bootstrap (CI)', () => {
  beforeAll(() => {
    patchInjectorForDiDebug();
  });

  it('compila el grafo DI completo', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    await moduleRef.close();
  }, 120_000);
});
