import { View, type ViewProps } from 'react-native';

export function Kart({ className = '', ...rest }: ViewProps & { className?: string }) {
  return <View className={`rounded-buyuk border border-kenar bg-yuzey p-4 ${className}`} {...rest} />;
}
