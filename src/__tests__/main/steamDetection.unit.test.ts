// Mock fs and child_process before importing the module under test
jest.mock('fs', () => ({
  promises: {
    stat: jest.fn(),
    readFile: jest.fn(),
    readdir: jest.fn(),
    mkdir: jest.fn(),
  },
  Dirent: jest.requireActual('fs').Dirent,
}));

jest.mock('child_process', () => ({
  execSync: jest.fn(),
}));

const fsMock = require('fs');
const childProcessMock = require('child_process');

describe('steamDetection main flows', () => {
  const mockedFs = fsMock as unknown as {
    promises: {
      stat: jest.Mock;
      readFile: jest.Mock;
      readdir: jest.Mock;
      mkdir: jest.Mock;
    };
  };

  const mockedExec = childProcessMock.execSync as jest.Mock;

  jest.mock('child_process', () => ({
    execSync: jest.fn(),
  }));

  let fsMock: any;
  let childProcessMock: any;
    mockedExec.mockReset();
    // Mock global.fetch to avoid network calls
    // @ts-ignore
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
  });

  afterAll(() => {
    // @ts-ignore
    delete global.fetch;
  });

  test('getServerBuildId returns build id string when manifest readable', async () => {
    // Mock fs.readFile to return a manifest containing buildid
    mockedFs.promises.readFile.mockResolvedValue('"buildid" "12345"');
    const { getServerBuildId } = require('../../main/steamDetection');
      // Re-require the mocked modules so we have the same mock instances used by the module under test
      fsMock = require('fs');
      childProcessMock = require('child_process');


    const result = await getServerBuildId(1623730, 'C:\\steam\\steamapps');
    expect(result).toBe('12345');
    expect(mockedFs.promises.readFile).toHaveBeenCalled();
  });

  test('getServerBuildId returns null when manifest unreadable', async () => {
    mockedFs.promises.readFile.mockRejectedValue(new Error('no file'));
    const { getServerBuildId } = require('../../main/steamDetection');

    const result = await getServerBuildId(1623730, 'C:\\steam\\steamapps');
    expect(result).toBeNull();
  });

  test('backupServerSave returns null when save directory missing', async () => {
    // For app 2278520, serverInfo.saveLocation is set; mock stat to throw for savePath
    mockedFs.promises.stat.mockImplementation((p: string) => {
      if ((p as string).includes('savegame')) {
        return Promise.reject(new Error('not found'));
      }
      return Promise.resolve({});
    });
    const { backupServerSave } = require('../../main/steamDetection');

    const res = await backupServerSave(2278520, 'C:\\games\\EnshroudedServer', 'C:\\backups');
    expect(res).toBeNull();
    expect(mockedFs.promises.stat).toHaveBeenCalled();
  });

  test('backupServerSave succeeds when save exists and zip command runs', async () => {
    // stat for savePath succeeds, mkdir succeeds, execSync called
    mockedFs.promises.stat.mockResolvedValue({});
    mockedFs.promises.mkdir.mockResolvedValue({});
    mockedExec.mockImplementation(() => '');
    const { backupServerSave } = require('../../main/steamDetection');

    const res = await backupServerSave(1623730, 'C:\\games\\PalServer', 'C:\\backups');
    expect(res).not.toBeNull();
    expect(mockedFs.promises.mkdir).toHaveBeenCalled();
    expect(mockedExec).toHaveBeenCalled();
  });

  test('findInstalledServers finds installing server when manifest exists but common missing', async () => {
    // Provide a fake steamPath param; parseLibraryFolders will not be called when passing full path.
    const steamPath = 'C:\\Program Files (x86)\\Steam';

    // Mock fs.readFile (libraryfolders) to throw so default libraryPaths used by function
    mockedFs.promises.readFile.mockRejectedValue(new Error('no vdf'));

    // For both apps, when checking manifest, have stat resolve for app manifests
    mockedFs.promises.stat.mockImplementation((p: string) => {
      if (String(p).includes('appmanifest_1623730.acf') || String(p).includes('appmanifest_2278520.acf')) {
        return Promise.resolve({});
      }
      // commonPath stat will throw to simulate missing common folder
      if (String(p).endsWith('common')) {
        return Promise.reject(new Error('no common'));
      }
      return Promise.resolve({});
    });

    // Mock fetch to return ok
    // @ts-ignore
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    const { findInstalledServers } = require('../../main/steamDetection');

    const results = await findInstalledServers(steamPath);
    // We expect at least one installing placeholder pushed for each manifest found
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((r: any) => String(r.installPath).includes('common'))).toBe(true);
  });

  test('findInstalledServers finds a server when directory present', async () => {
    const steamPath = 'C:\\Program Files (x86)\\Steam';

    // libraryfolders.vdf read fails -> default
    mockedFs.promises.readFile.mockRejectedValue(new Error('no vdf'));

    // stat logic: manifest exists; common path exists
    mockedFs.promises.stat.mockImplementation((p: string) => {
      if (String(p).includes('appmanifest_1623730.acf') || String(p).includes('appmanifest_2278520.acf')) {
        return Promise.resolve({});
      }
      if (String(p).endsWith('common')) {
        return Promise.resolve({});
      }
      // stat for save paths etc - resolve
      return Promise.resolve({});
    });

    // readdir returns a numeric folder for one of the appIds
    mockedFs.promises.readdir.mockResolvedValue([
      { name: '1623730', isDirectory: () => true },
    ]);

    // Mock execSync (isProcessRunning) to return string containing exe name
    mockedExec.mockReturnValue('PalServer.exe');

    // @ts-ignore
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    const { findInstalledServers } = require('../../main/steamDetection');

    const results = await findInstalledServers(steamPath);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((r: any) => r.appId === 1623730)).toBe(true);
  });
});
