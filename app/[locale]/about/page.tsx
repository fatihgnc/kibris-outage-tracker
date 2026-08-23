import type { Metadata } from 'next';
import LegalPage, { legalMetadata } from '@/components/LegalPage';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return legalMetadata('about', (await params).locale);
}

export default async function AboutPage({ params }: Props) {
  return <LegalPage slug="about" rawLocale={(await params).locale} />;
}
