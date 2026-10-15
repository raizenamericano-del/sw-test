import { BaileysProvider } from "./baileys-provider";

export type { ProviderCapabilities, ProviderStatus, StatusItem } from "./provider-types";

const globalForProvider = globalThis as typeof globalThis & { imhProvider?: BaileysProvider };

export function getProvider(): BaileysProvider {
  globalForProvider.imhProvider ??= new BaileysProvider();
  return globalForProvider.imhProvider;
}
