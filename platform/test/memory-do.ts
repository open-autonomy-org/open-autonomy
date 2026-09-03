export class MemoryDurableObjectNamespace implements DurableObjectNamespace {
  private readonly instances = new Map<string, DurableObjectStub>();

  constructor(private readonly create: (state: DurableObjectState) => DurableObject) {}

  idFromName(name: string): DurableObjectId {
    return name as unknown as DurableObjectId;
  }

  get(id: DurableObjectId): DurableObjectStub {
    const key = id as unknown as string;
    let stub = this.instances.get(key);
    if (!stub) {
      const storage = new MemoryStorage();
      const instance = this.create({ storage } as DurableObjectState);
      stub = { fetch: (input, init) => instance.fetch(new Request(input, init)) };
      this.instances.set(key, stub);
    }
    return stub;
  }
}

class MemoryStorage {
  private readonly values = new Map<string, unknown>();
  private alarm: number | null = null;

  async get<T = unknown>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async put<T>(key: string, value: T): Promise<void> {
    this.values.set(key, value);
  }

  async delete(key: string): Promise<boolean> {
    return this.values.delete(key);
  }

  // The subset of DurableObjectStorage.list the ledger uses: prefix, reverse, limit, and an exclusive
  // `end` bound (in reverse mode, keys strictly below `end`).
  async list<T = unknown>(options: { prefix?: string; reverse?: boolean; limit?: number; end?: string } = {}): Promise<Map<string, T>> {
    let keys = [...this.values.keys()].filter((k) => !options.prefix || k.startsWith(options.prefix)).sort();
    if (options.end !== undefined) keys = keys.filter((k) => k < (options.end as string));
    if (options.reverse) keys.reverse();
    if (options.limit !== undefined) keys = keys.slice(0, options.limit);
    return new Map(keys.map((k) => [k, this.values.get(k) as T]));
  }

  async getAlarm(): Promise<number | null> {
    return this.alarm;
  }

  async setAlarm(time: number): Promise<void> {
    this.alarm = time;
  }
}
