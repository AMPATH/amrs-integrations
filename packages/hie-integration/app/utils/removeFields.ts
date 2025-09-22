export function removeFields<T extends Record<string, any>>(resource: T, fieldsToRemove: string[]): T {
  for (const field of fieldsToRemove) {
    delete resource[field];
  }
  return resource;
}
