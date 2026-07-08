/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */

jest.mock("../../main/steamDetection", () => ({
  backupServerSave: jest.fn(),
}));

import { backupServerSave as steamBackupServerSave } from "../../main/steamDetection";
import {
  backupServerSaveHandler,
  selectBackupFolder,
} from "../../main/serverBackup";

const mockBackupServerSave = steamBackupServerSave as jest.MockedFunction<
  typeof steamBackupServerSave
>;

describe("serverBackup", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe("backupServerSaveHandler", () => {
    it("returns success when backup is created", async () => {
      mockBackupServerSave.mockResolvedValueOnce(
        "C:\\Backups\\Enshrouded Dedicated Server\\backup.zip"
      );

      const result = await backupServerSaveHandler(
        2278520,
        "C:\\Games\\EnshroudedServer",
        "C:\\Backups"
      );

      expect(result).toEqual({
        success: true,
        backupPath: "C:\\Backups\\Enshrouded Dedicated Server\\backup.zip",
      });
      expect(mockBackupServerSave).toHaveBeenCalledWith(
        2278520,
        "C:\\Games\\EnshroudedServer",
        "C:\\Backups"
      );
    });

    it("returns failure when backup creation fails", async () => {
      mockBackupServerSave.mockResolvedValueOnce(null);

      const result = await backupServerSaveHandler(
        2278520,
        "C:\\Games\\EnshroudedServer",
        "C:\\Backups"
      );

      expect(result).toEqual({
        success: false,
        error: "Failed to create backup",
      });
    });
  });

  describe("selectBackupFolder", () => {
    it("returns error when main window is unavailable", async () => {
      const result = await selectBackupFolder(() => null, {
        showOpenDialog: jest.fn(),
      });

      expect(result).toEqual({
        success: false,
        path: null,
        error: "Main window not available",
      });
    });

    it("returns selected path when dialog succeeds", async () => {
      const showOpenDialog = jest.fn().mockResolvedValue({
        canceled: false,
        filePaths: ["C:\\Backups"],
      });

      const result = await selectBackupFolder(() => ({}) as never, {
        showOpenDialog,
      });

      expect(result).toEqual({
        success: true,
        path: "C:\\Backups",
      });
      expect(showOpenDialog).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          properties: ["openDirectory"],
          title: "Select Backup Location",
        })
      );
    });

    it("returns canceled result when dialog is dismissed", async () => {
      const showOpenDialog = jest.fn().mockResolvedValue({
        canceled: true,
        filePaths: [],
      });

      const result = await selectBackupFolder(() => ({}) as never, {
        showOpenDialog,
      });

      expect(result).toEqual({
        success: false,
        path: null,
      });
    });
  });
});
