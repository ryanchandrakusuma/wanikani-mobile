import * as SecureStore from "expo-secure-store";
import { tokenStorage } from "../../src/auth/tokenStorage";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const store = jest.mocked(SecureStore);
const KEY = "wanikani_api_token";

describe("tokenStorage", () => {
  it("reads the token from secure storage", async () => {
    store.getItemAsync.mockResolvedValueOnce("tok-abc");

    await expect(tokenStorage.get()).resolves.toBe("tok-abc");
    expect(store.getItemAsync).toHaveBeenCalledWith(KEY);
  });

  it("returns null when no token is saved", async () => {
    store.getItemAsync.mockResolvedValueOnce(null);

    await expect(tokenStorage.get()).resolves.toBeNull();
  });

  it("saves the token under the app's key", async () => {
    await tokenStorage.set("tok-abc");

    expect(store.setItemAsync).toHaveBeenCalledWith(KEY, "tok-abc");
  });

  it("deletes the token on clear", async () => {
    await tokenStorage.clear();

    expect(store.deleteItemAsync).toHaveBeenCalledWith(KEY);
  });
});
