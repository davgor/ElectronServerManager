import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SteamPathSelector } from "../../renderer/SteamPathSelector";

const paths = ["C:\\Program Files\\Steam", "D:\\SteamLibrary"];

describe("SteamPathSelector Component", () => {
  it("should render an option for every path", () => {
    render(
      <SteamPathSelector
        paths={paths}
        selectedPath={paths[0]}
        onSelect={jest.fn()}
      />
    );

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(
      screen.getByRole("option", { name: "C:\\Program Files\\Steam" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "D:\\SteamLibrary" })
    ).toBeInTheDocument();
  });

  it("should reflect the selected path in the select value", () => {
    render(
      <SteamPathSelector
        paths={paths}
        selectedPath={paths[1]}
        onSelect={jest.fn()}
      />
    );

    expect(screen.getByLabelText("Steam Library:")).toHaveValue(
      "D:\\SteamLibrary"
    );
  });

  it("should call onSelect with the chosen path when a different option is selected", async () => {
    const user = userEvent.setup();
    const onSelect = jest.fn();
    render(
      <SteamPathSelector
        paths={paths}
        selectedPath={paths[0]}
        onSelect={onSelect}
      />
    );

    await user.selectOptions(
      screen.getByLabelText("Steam Library:"),
      "D:\\SteamLibrary"
    );

    expect(onSelect).toHaveBeenCalledWith("D:\\SteamLibrary");
  });

  it("should render nothing when paths is empty", () => {
    const { container } = render(
      <SteamPathSelector paths={[]} selectedPath="" onSelect={jest.fn()} />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
