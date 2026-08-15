import { formatBytes, formatPercent } from "../../renderer/serverMetricsFormat";

describe("serverMetricsFormat", () => {
  describe("formatPercent", () => {
    it("formats to one decimal with a percent sign", () => {
      expect(formatPercent(12.345)).toBe("12.3%");
      expect(formatPercent(0)).toBe("0.0%");
      expect(formatPercent(99.96)).toBe("100.0%");
    });
  });

  describe("formatBytes", () => {
    it("formats values below one GiB as MiB with one decimal", () => {
      expect(formatBytes(0)).toBe("0.0 MiB");
      expect(formatBytes(512 * 1024 * 1024)).toBe("512.0 MiB");
      expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.5 MiB");
    });

    it("formats values of one GiB and above as GiB with two decimals", () => {
      expect(formatBytes(1024 * 1024 * 1024)).toBe("1.00 GiB");
      expect(formatBytes(1.25 * 1024 * 1024 * 1024)).toBe("1.25 GiB");
      expect(formatBytes(16 * 1024 * 1024 * 1024)).toBe("16.00 GiB");
    });
  });
});
