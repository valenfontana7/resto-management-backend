process.env.E2E_GOLDEN_FLOWS = 'true';

import { Injector } from '@nestjs/core/injector/injector';

const injectorProto = Injector.prototype as {
  loadInstance: (...args: unknown[]) => Promise<unknown>;
};
const loadInstance = injectorProto.loadInstance;
injectorProto.loadInstance = async function (
  this: unknown,
  wrapper: {
    token?: unknown;
    name?: unknown;
    metatype?: { name?: string };
  },
  collection: { get: (token: unknown) => unknown },
  ...rest: unknown[]
) {
  const token = wrapper.token ?? wrapper.name;
  if (token === undefined || collection.get(token) === undefined) {
    console.error(
      '[golden-di]',
      JSON.stringify({
        token: typeof token === 'function' ? token.name : String(token),
        name: wrapper.name,
        metatype: wrapper.metatype?.name,
      }),
    );
  }
  return loadInstance.call(this, wrapper, collection, ...rest);
};