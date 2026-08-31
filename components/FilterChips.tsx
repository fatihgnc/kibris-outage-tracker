import Link from 'next/link';

export type Chip = {
  key: string;
  name: string;
  href: string;
  active: boolean;
};

type Props = {
  ariaLabel: string;
  chips: Chip[];
  // When present, a click is handled in place instead of navigating — the
  // home page filters client-side so the cached HTML can stay one page for
  // everyone. The href remains real either way: without JavaScript the link
  // still goes somewhere sensible.
  onSelect?: (key: string) => void;
};

// The row of district chips, and nothing else: no data imports, no locale
// logic. Both the server-filtered archive and the client-filtered home render
// their chips through here, so the two cannot drift apart visually.
export default function FilterChips({ ariaLabel, chips, onSelect }: Props) {
  return (
    <nav aria-label={ariaLabel}>
      <ul className="no-scrollbar m-0 flex list-none gap-2 overflow-x-auto p-0 pb-1">
        {chips.map((chip) => (
          <li key={chip.key} className="flex-none">
            <Link
              href={chip.href}
              scroll={false}
              aria-current={chip.active ? 'true' : undefined}
              onClick={
                onSelect
                  ? (event) => {
                      event.preventDefault();
                      onSelect(chip.key);
                    }
                  : undefined
              }
              className={`inline-flex min-h-11 items-center rounded-[2px] border px-4 text-small no-underline ${
                chip.active ? 'border-lamp text-lamp' : 'border-dark text-text hover:border-lamp'
              }`}
            >
              {chip.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
