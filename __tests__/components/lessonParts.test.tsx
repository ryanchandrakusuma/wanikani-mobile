import { fireEvent, render, screen } from "@testing-library/react-native";
import { useAudioPlayer } from "expo-audio";
import { AudioButton } from "../../src/components/AudioButton";
import { Mnemonic } from "../../src/components/Mnemonic";
import { SubjectGlyph } from "../../src/components/SubjectGlyph";
import type { Subject } from "../../src/subjects/model";

jest.mock("expo-audio", () => ({ useAudioPlayer: jest.fn() }));
jest.mock("expo-image", () => {
  const { View } = jest.requireActual("react-native");
  return { Image: (props: { source: { uri: string } }) => <View testID="radical-image" accessibilityHint={props.source.uri} /> };
});

function subject(object: Subject["object"], data: Partial<Subject["data"]> = {}): Subject {
  return {
    id: 1, object,
    data: {
      level: 1, slug: "ground", characters: "一", meanings: [{ meaning: "Ground", primary: true, accepted_answer: true }],
      meaning_mnemonic: "", lesson_position: 0, spaced_repetition_system_id: 1, hidden_at: null, ...data,
    },
  };
}

describe("Mnemonic", () => {
  it("renders the text without tags", async () => {
    await render(<Mnemonic text="The <radical>ground</radical> is <reading>big</reading>." />);

    expect(screen.getByText("The ground is big.")).toBeTruthy();
    expect(screen.getByText("ground")).toBeTruthy();
    expect(screen.getByText("big")).toBeTruthy();
  });

  it("renders nothing for empty text", async () => {
    await render(<Mnemonic text={null} />);

    expect(screen.toJSON()).toBeNull();
  });
});

describe("SubjectGlyph", () => {
  it("shows the characters", async () => {
    await render(<SubjectGlyph subject={subject("kanji", { characters: "大" })} />);

    expect(screen.getByText("大")).toBeTruthy();
    expect(screen.queryByTestId("radical-image")).toBeNull();
  });

  it("shows the image for a radical without characters", async () => {
    await render(<SubjectGlyph subject={subject("radical", {
      characters: null,
      character_images: [{ url: "https://files.wanikani.com/x.png", content_type: "image/png", metadata: {} }],
    })} />);

    expect(screen.getByTestId("radical-image").props.accessibilityHint).toBe("https://files.wanikani.com/x.png");
  });

  it("falls back to the meaning if a radical has neither", async () => {
    await render(<SubjectGlyph subject={subject("radical", { characters: null })} />);

    expect(screen.getByText("Ground")).toBeTruthy();
  });
});

describe("AudioButton", () => {
  it("renders nothing without a URL", async () => {
    await render(<AudioButton url={null} />);

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("plays from the start when pressed", async () => {
    const player = { play: jest.fn(), seekTo: jest.fn().mockResolvedValue(undefined) };
    jest.mocked(useAudioPlayer).mockReturnValue(player as never);
    await render(<AudioButton url="https://files.wanikani.com/a.mp3" />);

    await fireEvent.press(screen.getByRole("button", { name: "Play pronunciation" }));

    expect(useAudioPlayer).toHaveBeenCalledWith("https://files.wanikani.com/a.mp3");
    expect(player.seekTo).toHaveBeenCalledWith(0);
    expect(player.play).toHaveBeenCalled();
  });
});
