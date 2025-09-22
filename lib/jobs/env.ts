const globalRef = globalThis as unknown as {
  process?: { env?: Record<string, string | undefined> };
  Deno?: { env: { get?: (key: string) => string | undefined; toObject?: () => Record<string, string | undefined> } };
};

export function readEnv(name: string): string | undefined {
  const fromProcess = globalRef?.process?.env?.[name];
  if (fromProcess !== undefined) return fromProcess;

  const denoGet = globalRef?.Deno?.env?.get?.bind(globalRef?.Deno?.env);
  if (typeof denoGet === 'function') {
    const val = denoGet(name);
    if (val !== undefined) return val;
  }

  const denoToObject = globalRef?.Deno?.env?.toObject?.bind(globalRef?.Deno?.env);
  if (typeof denoToObject === 'function') {
    try {
      return denoToObject()[name];
    } catch (error) {
      console.warn(`Unable to read Deno.env for ${name}`, error);
    }
  }

  return undefined;
}
