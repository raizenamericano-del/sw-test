import type { SessionState } from "./types";

export interface ProviderCapabilities {
  accountPairing: boolean;
  receivesStatuses: boolean;
  downloadsStatusMedia: boolean;
  persistentSessions: boolean;
  statusFeedExperimental: boolean;
  official: boolean;
}

export interface StatusItem {
  id: string;
  contact: string;
  mediaType: "image" | "video" | "text";
  available: boolean;
  createdAt: string;
  text: string | null;
}

export interface ProviderStatus {
  supported: boolean;
  provider: string;
  connected: boolean;
  items: StatusItem[];
  message: string;
  capabilities: ProviderCapabilities;
  connectionState?: SessionState;
}
