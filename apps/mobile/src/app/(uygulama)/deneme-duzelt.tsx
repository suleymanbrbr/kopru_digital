import { useLocalSearchParams } from 'expo-router';

import { DenemeDuzeltEkrani } from '../../ekranlar/DenemeDuzeltEkrani';

export default function DenemeDuzelt() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <DenemeDuzeltEkrani denemeId={id ?? ''} />;
}
