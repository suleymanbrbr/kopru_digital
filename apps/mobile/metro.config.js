// Expo monorepo icin Metro'yu otomatik yapilandirir (isolated pnpm dahil); watchFolders/resolver
// ezmesi gerekmez. Burada yalnizca SVG donusturucusu ve NativeWind eklenir.
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// SVG dosyalari (karakter yer tutuculari) react-native-svg bilesenine donusturulur.
config.transformer = {
  ...config.transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer/expo'),
};
config.resolver = {
  ...config.resolver,
  assetExts: config.resolver.assetExts.filter((ext) => ext !== 'svg'),
  sourceExts: [...config.resolver.sourceExts, 'svg'],
};

module.exports = withNativeWind(config, { input: './src/global.css' });
