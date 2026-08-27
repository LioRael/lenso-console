export function queryDataWithMockFallback<T>({
  apiMode,
  data,
  fallback,
}: {
  apiMode: boolean;
  data?: T[] | undefined;
  fallback: T[];
}): T[] {
  if (data) {
    return data;
  }
  return apiMode ? [] : fallback;
}
