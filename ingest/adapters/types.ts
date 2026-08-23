import type { RawAnnouncement } from '../parse';
import type { ConditionalCache } from '../http';

export type { RawAnnouncement };

export type SourceAdapter = {
  id: string;
  fetch(cache: ConditionalCache): Promise<RawAnnouncement[]>;
};
