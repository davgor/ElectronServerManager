import { parseIniContent, stringifyIniContent } from "../../main/iniConfig";

describe("iniConfig", () => {
  it("parses Palworld-style INI snippets (sections, tuples, quotes)", () => {
    const snippet = `
; Palworld-style example
[ServerSettings]
ServerName="My Pal, Server"
TickRate=30
bEnabled=true
Players=(1,2,3)
AdminPlayers=("Alice","Bob Charlie")
MapLike=(key1=123,key2="some value",key3=true,key4="a,b")
Nested=(a(b,c),d)

EmptyString=""
`.trim();

    const parsed = parseIniContent(snippet);

    const settings = parsed.ServerSettings as Record<string, unknown>;
    expect(settings.ServerName).toBe("My Pal, Server");
    expect(settings.TickRate).toBe(30);
    expect(settings.bEnabled).toBe(true);
    expect(settings.Players).toEqual([1, 2, 3]);
    expect(settings.AdminPlayers).toEqual(["Alice", "Bob Charlie"]);
    expect(settings.MapLike).toEqual({
      key1: "123",
      key2: '"some value"',
      key3: "true",
      key4: '"a,b"',
    });
    expect(settings.Nested).toEqual(["a(b,c)", "d"]);
    expect(settings.EmptyString).toBe("");
  });

  it("round-trips parse -> stringify -> parse", () => {
    const snippet = `
[ServerSettings]
ServerName="My Pal, Server"
TickRate=30
bEnabled=true
Players=(1,2,3)
AdminPlayers=("Alice","Bob Charlie")
MapLike=(key1=123,key2="some value",key3=true,key4="a,b")
EmptyString=""
Nested=(a(b,c),d)
`.trim();

    const parsed1 = parseIniContent(snippet);
    const out = stringifyIniContent(parsed1);
    const parsed2 = parseIniContent(out);

    expect(parsed2).toEqual(parsed1);
  });

  it("handles quoted empty strings inside tuples", () => {
    const snippet = `
[ServerSettings]
AdminPlayers=("","Bob Charlie")
`.trim();

    const parsed1 = parseIniContent(snippet);
    const out = stringifyIniContent(parsed1);
    const parsed2 = parseIniContent(out);

    expect(parsed2).toEqual(parsed1);
  });
});
