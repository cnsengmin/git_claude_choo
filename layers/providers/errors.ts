// Bad input to a provider: /api/layers/<provider> answers 400 instead of 500.
export class LayerRequestError extends Error {}

export const numberParam = (params: URLSearchParams, key: string) => {
  const value = params.get(key);
  if (value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
