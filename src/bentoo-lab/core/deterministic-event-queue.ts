export interface DeterministicQueueEvent {
  id: string;
  atMs: number;
  priority: number;
}

export class DeterministicEventQueue<TEvent extends DeterministicQueueEvent> {
  private events: TEvent[];

  constructor(initialEvents: readonly TEvent[] = []) {
    this.events = [...initialEvents];
    this.sort();
    this.assertUniqueIds();
  }

  enqueue(event: TEvent): void {
    if (this.events.some((candidate) => candidate.id === event.id)) {
      throw new Error(`Evento duplicado en cola determinística: ${event.id}`);
    }
    this.events.push(event);
    this.sort();
  }

  drainReady(nowMs: number): TEvent[] {
    let readyCount = 0;
    while (
      readyCount < this.events.length &&
      this.events[readyCount].atMs <= nowMs
    ) {
      readyCount += 1;
    }
    return this.events.splice(0, readyCount);
  }

  peek(): TEvent | undefined {
    return this.events[0];
  }

  get size(): number {
    return this.events.length;
  }

  snapshot(): TEvent[] {
    return this.events.map((event) => ({ ...event }));
  }

  private sort(): void {
    this.events.sort(
      (left, right) =>
        left.atMs - right.atMs ||
        left.priority - right.priority ||
        left.id.localeCompare(right.id),
    );
  }

  private assertUniqueIds(): void {
    const ids = new Set<string>();
    for (const event of this.events) {
      if (ids.has(event.id)) {
        throw new Error(`Evento duplicado en cola determinística: ${event.id}`);
      }
      ids.add(event.id);
    }
  }
}
