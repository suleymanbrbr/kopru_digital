'use client';

import { notFound, useParams } from 'next/navigation';

import { BolumYerTutucu } from '@/components/kabuk/bolum-yer-tutucu';

export default function BolumSayfasi() {
  const { bolum } = useParams<{ bolum: string }>();
  return <BolumYerTutucu bolum={bolum} notFound={notFound} />;
}
