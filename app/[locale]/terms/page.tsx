import type { Metadata } from 'next';
import LegalPage, { legalMetadata } from '@/components/LegalPage';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return legalMetadata('terms', (await params).locale);
}

export default async function TermsPage({ params }: Props) {
  return <LegalPage slug="terms" rawLocale={(await params).locale} />;
}
