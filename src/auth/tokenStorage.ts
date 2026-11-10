import * as SecureStore from "expo-secure-store";

// Stored in the device keychain (iOS) / keystore (Android), not plain storage.
const KEY = "wanikani_api_token";

export const tokenStorage = {
  get: () => SecureStore.getItemAsync(KEY),
  set: (token: string) => SecureStore.setItemAsync(KEY, token),
  clear: () => SecureStore.deleteItemAsync(KEY),
};
