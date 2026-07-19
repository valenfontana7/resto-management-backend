export interface XorShift32Snapshot {
  algorithm: 'xorshift32';
  state: number;
}

export class XorShift32 {
  private state: number;

  constructor(seed: string | number) {
    const numericSeed =
      typeof seed === 'number' ? seed >>> 0 : XorShift32.hash(seed);
    this.state = numericSeed === 0 ? 0x9e3779b9 : numericSeed;
  }

  static restore(snapshot: XorShift32Snapshot): XorShift32 {
    if (snapshot.algorithm === 'xorshift32') {
      return new XorShift32(snapshot.state);
    }
    throw new Error('Algoritmo PRNG no soportado');
  }

  nextUint32(): number {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state;
  }

  nextFloat(): number {
    return this.nextUint32() / 0x1_0000_0000;
  }

  nextInt(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new Error(`Rango inválido para PRNG: ${min}..${max}`);
    }
    return min + Math.floor(this.nextFloat() * (max - min + 1));
  }

  pick<T>(values: readonly T[]): T {
    if (values.length === 0) {
      throw new Error('No se puede elegir sobre una colección vacía');
    }
    return values[this.nextInt(0, values.length - 1)];
  }

  snapshot(): XorShift32Snapshot {
    return { algorithm: 'xorshift32', state: this.state };
  }

  private static hash(value: string): number {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
  }
}
