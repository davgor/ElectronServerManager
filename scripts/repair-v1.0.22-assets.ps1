# Repairs v1.0.22 updater 404s by re-uploading hyphenated asset names
# that match latest.yml / latest-linux.yml.
#
# Prerequisites: gh auth login (repo scope)
# Usage: pwsh scripts/repair-v1.0.22-assets.ps1

$ErrorActionPreference = "Stop"
$repo = "davgor/ElectronServerManager"
$tag = "v1.0.22"
$gh = if (Test-Path "$env:ProgramFiles\GitHub CLI\gh.exe") {
  "$env:ProgramFiles\GitHub CLI\gh.exe"
} else {
  "gh"
}

$work = Join-Path $env:TEMP "esm-repair-1.0.22"
New-Item -ItemType Directory -Force -Path $work | Out-Null

$pairs = @(
  @{
    Source = "Game.Server.Manager.Setup.1.0.22.exe"
    Dest   = "Game-Server-Manager-Setup-1.0.22.exe"
  },
  @{
    Source = "Game.Server.Manager.Setup.1.0.22.exe.blockmap"
    Dest   = "Game-Server-Manager-Setup-1.0.22.exe.blockmap"
  },
  @{
    Source = "Game.Server.Manager-1.0.22.AppImage"
    Dest   = "Game-Server-Manager-1.0.22.AppImage"
  }
)

foreach ($pair in $pairs) {
  $url = "https://github.com/$repo/releases/download/$tag/$($pair.Source)"
  $out = Join-Path $work $pair.Dest
  Write-Host "Downloading $($pair.Source) -> $($pair.Dest)"
  Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing
  & $gh release upload $tag $out --repo $repo --clobber
}

Write-Host "Done. Confirm:"
Write-Host "  https://github.com/$repo/releases/download/$tag/Game-Server-Manager-Setup-1.0.22.exe"
