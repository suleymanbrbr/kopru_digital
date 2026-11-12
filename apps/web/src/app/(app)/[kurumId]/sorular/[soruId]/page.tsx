'use client';

import { useParams } from 'next/navigation';

import { PersonelSoruDetayi } from '@/components/soru/ekranlar';

export default function PersonelSoruDetaySayfasi() {
  const { soruId } = useParams<{ soruId: string }>();
  return <PersonelSoruDetayi soruId={soruId} />;
}
