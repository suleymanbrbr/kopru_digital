// MMKV native (Nitro) modulu jest'te yok; ayni arayuzlu bellek ici sahte kullanilir.
/* global jest */
// expo-notifications yerel modulu jest'te yok; push katmani testlerde sahte platformla calisir.
jest.mock('expo-notifications', () => ({}));
jest.mock('react-native-mmkv', () => ({
  createMMKV: () => {
    const m = new Map();
    return {
      getString: (k) => m.get(k),
      set: (k, v) => void m.set(k, v),
      remove: (k) => m.delete(k),
      clearAll: () => m.clear(),
    };
  },
}));
