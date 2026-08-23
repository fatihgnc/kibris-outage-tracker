import { kibtek } from './kibtek';
import type { SourceAdapter } from './types';

// Adapters are added one at a time; after each one the run is repeated and the
// record count checked, because a growing count means dedupe is failing and
// another adapter would only compound it (SPEC §13 step 15).
export const adapters: SourceAdapter[] = [kibtek];
