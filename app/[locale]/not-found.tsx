import Link from 'next/link';

// Minimal bilingual not-found: the layout above it already carries the status
// bar, navigation, and footer in the active locale.
export default function NotFound() {
  return (
    <section className="pt-8">
      <h1 className="opsz-120 m-0 font-display text-display font-semibold tracking-[-0.02em] text-text">404</h1>
      <p className="mb-0 mt-2 max-w-[52ch] text-small text-muted">
        Bu sayfa yok. Ana sayfadan devam edebilirsin. · This page does not exist. Continue from the
        home page.
      </p>
      <p className="mb-0 mt-4">
        <Link href="/" className="font-mono text-small text-lamp underline underline-offset-[3px]">
          ← Sönen Ada
        </Link>
      </p>
    </section>
  );
}
