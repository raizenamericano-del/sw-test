const active = new Set<string>();

export function acquireDownloadLock(key: string): boolean {
  if (active.has(key)) return false;
  active.add(key);
  return true;
}

export function releaseDownloadLock(key: string): void {
  active.delete(key);
}

export function resetDownloadLocksForTests(): void {
  active.clear();
}
