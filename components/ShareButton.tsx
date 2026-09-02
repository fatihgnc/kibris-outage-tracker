'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  title: string;
  url: string;
  labels: { button: string; copied: string };
  className?: string;
};

// The native share sheet where the browser has one — on a phone, which is
// where most readers are and where a link gets pasted into a message — and
// the clipboard everywhere else, with a two-second receipt in place of the
// label. Rendered on the server like any other control, so it cannot appear
// after hydration and move the row it sits in.
export default function ShareButton({ title, url, labels, className = '' }: Props) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const share = async () => {
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // A dismissed share sheet is not an error, and a clipboard that refuses
      // has nothing useful to say here.
    }
  };

  return (
    <button
      type="button"
      onClick={share}
      aria-live="polite"
      className={`tap-target relative border-0 bg-transparent p-0 font-mono text-meta text-muted underline decoration-muted underline-offset-[3px] hover:text-lamp hover:decoration-lamp ${className}`}
    >
      {copied ? labels.copied : labels.button}
    </button>
  );
}
