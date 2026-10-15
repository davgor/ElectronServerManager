import { findSettingDoc, settingDocPath } from "../../renderer/settingDocs";

describe("setting doc lookup (config editor tooltips)", () => {
  it("writes array indexes as * so every array entry shares one doc", () => {
    expect(settingDocPath(["userGroups", "0", "canKickBan"])).toBe(
      "userGroups.*.canKickBan"
    );
    expect(settingDocPath(["userGroups", "12"])).toBe("userGroups.*");
    expect(settingDocPath(["gameSettings", "playerHealthFactor"])).toBe(
      "gameSettings.playerHealthFactor"
    );
  });

  it("finds the doc for a path and nothing for undocumented paths", () => {
    const docs = {
      queryPort: "Port doc",
      "userGroups.*.canKickBan": "Kick doc",
    };
    expect(findSettingDoc(docs, ["queryPort"])).toBe("Port doc");
    expect(findSettingDoc(docs, ["userGroups", "3", "canKickBan"])).toBe(
      "Kick doc"
    );
    expect(findSettingDoc(docs, ["userGroups", "3", "name"])).toBeUndefined();
    expect(findSettingDoc(undefined, ["queryPort"])).toBeUndefined();
  });

  it("ignores inherited object properties", () => {
    expect(findSettingDoc({}, ["toString"])).toBeUndefined();
    expect(findSettingDoc({}, ["constructor"])).toBeUndefined();
  });
});
