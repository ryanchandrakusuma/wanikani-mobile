import { Linking } from "react-native";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import Login from "../../src/pages/LoginPage";
import { useAuth } from "../../src/contexts/AuthContext";
import { WKApiError } from "../../src/api/client";

jest.mock("expo-router", () => ({ router: { replace: jest.fn() } }));
jest.mock("react-native-safe-area-context", () => {
  const { View } = jest.requireActual("react-native");
  return { SafeAreaView: View };
});
jest.mock("../../src/contexts/AuthContext", () => ({ useAuth: jest.fn() }));

const mockSignIn = jest.fn();
const mockReplace = jest.mocked(router.replace);

beforeEach(() => {
  mockSignIn.mockReset();
  mockReplace.mockReset();
  jest.mocked(useAuth).mockReturnValue({ signIn: mockSignIn } as unknown as ReturnType<typeof useAuth>);
});

const tokenInput = () => screen.getByLabelText("WaniKani API token");
const connect = () => screen.getByRole("button", { name: "Connect" });

describe("Login screen", () => {
  it("asks for a token when Connect is pressed with an empty field", async () => {
    await render(<Login />);

    await fireEvent.press(connect());

    expect(await screen.findByText("Paste your API token first.")).toBeTruthy();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("treats a whitespace-only token as empty", async () => {
    await render(<Login />);

    await fireEvent.changeText(tokenInput(), "   ");
    await fireEvent.press(connect());

    expect(await screen.findByText("Paste your API token first.")).toBeTruthy();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("signs in and goes to the home screen", async () => {
    mockSignIn.mockResolvedValue(undefined);
    await render(<Login />);

    await fireEvent.changeText(tokenInput(), "my-token");
    await fireEvent.press(connect());

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/home"));
    expect(mockSignIn).toHaveBeenCalledWith("my-token");
  });

  it("shows WaniKani's error message when the token is rejected", async () => {
    mockSignIn.mockRejectedValue(new WKApiError("This API token isn't valid.", "unauthorized", 401));
    await render(<Login />);

    await fireEvent.changeText(tokenInput(), "bad-token");
    await fireEvent.press(connect());

    expect(await screen.findByText("This API token isn't valid.")).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("shows a generic message for unexpected errors", async () => {
    mockSignIn.mockRejectedValue(new Error("boom"));
    await render(<Login />);

    await fireEvent.changeText(tokenInput(), "tok");
    await fireEvent.press(connect());

    expect(await screen.findByText("Something went wrong. Try again.")).toBeTruthy();
  });

  it("opens WaniKani's token settings page", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await render(<Login />);

    await fireEvent.press(screen.getByRole("link", { name: "Open WaniKani token settings" }));

    expect(openURL).toHaveBeenCalledWith("https://www.wanikani.com/settings/personal_access_tokens");
  });
});
