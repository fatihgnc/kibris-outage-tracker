'use client';

import { useEffect, useState } from 'react';
import { fill } from '@/lib/i18n/dictionaries';
import { formatDuration } from '@/lib/time';

type Props = {
  targetIso: string;
  // Dictionary string containing {duration}; the "estimated" qualifier is part
  // of the pattern, so a countdown never implies precision the data lacks.
  pattern: string;
  units: { day: string; hour: string; minute: string };
  // Injected server time so the first client render matches the server render.
  initialNow: number;
};

export default function Countdown({ targetIso, pattern, units, initialNow }: Props) {
  const [now, setNow] = useState(initialNow);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);
  const text = fill(pattern, { duration: formatDuration(Date.parse(targetIso) - now, units) });
  // Reserve the initial width so a tick never shifts the layout around it.
  const [reservedCh] = useState(() => text.length);
  return (
    <span className="inline-block" style={{ minWidth: `${reservedCh}ch` }}>
      {text}
    </span>
  );
}
