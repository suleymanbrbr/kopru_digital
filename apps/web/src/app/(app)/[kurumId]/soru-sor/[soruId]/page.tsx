'use client';

import { useParams } from 'next/navigation';

import { OgrenciSoruDetayi } from '@/components/soru/ekranlar';

export default function OgrenciSoruDetaySayfasi() {
  const { soruId } = useParams<{ soruId: string }>();
  return <OgrenciSoruDetayi soruId={soruId} />;
}
