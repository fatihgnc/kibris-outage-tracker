import type { OutageKind } from '@/lib/types';
import type { Dictionary } from '@/lib/i18n/dictionaries';

// Every badge contains its own text, so color is never the sole carrier of
// meaning. Rotating sits between planned and fault in visual weight: fault
// text inside a quiet border.
const KIND_CLASSES: Record<OutageKind, string> = {
  planned: 'border-lamp text-lamp',
  rotating: 'border-dark text-fault',
  fault: 'border-fault text-fault',
};

export default function KindBadge({ kind, dict }: { kind: OutageKind; dict: Dictionary }) {
  return (
    <span
      className={`inline-block rounded-[2px] border bg-transparent px-2 py-0.5 font-mono text-meta uppercase tracking-[0.09em] ${KIND_CLASSES[kind]}`}
    >
      {dict.kind[kind]}
    </span>
  );
}
