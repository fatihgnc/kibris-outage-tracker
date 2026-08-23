import type { Metadata } from 'next';
import LegalPage, { legalMetadata } from '@/components/LegalPage';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return legalMetadata('privacy', (await params).locale);
}

export default async function PrivacyPage({ params }: Props) {
  return <LegalPage slug="privacy" rawLocale={(await params).locale} />;
}
