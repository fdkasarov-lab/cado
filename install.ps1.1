<#
.SYNOPSIS
  kimi-code installer for Windows (PowerShell 5.1+).

.EXAMPLE
  irm https://code.kimi.com/kimi-code/install.ps1 | iex

.EXAMPLE
  $env:KIMI_VERSION = '0.5.0'
  irm https://code.kimi.com/kimi-code/install.ps1 | iex

.NOTES
  Optional env:
    KIMI_VERSION         Explicit version; if unset, fetch from https://code.kimi.com/kimi-code/latest
    KIMI_INSTALL_DIR     Installation directory, default %USERPROFILE%\.kimi-code
    KIMI_NO_MODIFY_PATH  Skip PATH modification when set to a non-empty value
#>

$ErrorActionPreference = 'Stop'

# PowerShell 5.1 on older Windows may not negotiate TLS 1.2 by default.
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$KimiDownloadBase = 'https://code.kimi.com/kimi-code'
$KimiBinaryBase = "$KimiDownloadBase/binaries"

$KimiVersion    = $env:KIMI_VERSION
$KimiInstallDir = if ($env:KIMI_INSTALL_DIR) { $env:KIMI_INSTALL_DIR } else { Join-Path $env:USERPROFILE '.kimi-code' }
$KimiNoPath     = $env:KIMI_NO_MODIFY_PATH

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Die($msg)        { Write-Host "error: $msg" -ForegroundColor Red; exit 1 }

function Detect-Target {
  # PowerShell 7+ (.NET Core) uses RuntimeInformation; PowerShell 5.1 falls back to environment variables.
  $rawArch = try {
    [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
  } catch {
    # PowerShell 5.1: detect WOW64 (32-bit PS on 64-bit Windows) so we don't
    # misreport x64 as x86. PROCESSOR_ARCHITEW6432 is only set in WOW64.
    if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
  }

  $arch = switch ($rawArch) {
    'X64'     { 'x64' }
    'X86'     { 'x86' }
    'Arm64'   { 'arm64' }
    'ARM64'   { 'arm64' }
    'AMD64'   { 'x64' }
    'IA64'    { 'ia64' }
    default   { Die "unsupported architecture: $rawArch" }
  }

  return "win32-$arch"
}

function Test-Sha256([string]$file, [string]$expected) {
  $actual = (Get-FileHash $file -Algorithm SHA256).Hash.ToLower()
  if ($actual -ne $expected.ToLower()) {
    Die "checksum mismatch: expected $expected, got $actual"
  }
}

function Add-ToUserPath([string]$dir) {
  if ($KimiNoPath) { Write-Step "Skipping PATH update (KIMI_NO_MODIFY_PATH set)"; return }
  $current = [Environment]::GetEnvironmentVariable('Path', 'User')
  if ($current -and ($current.Split(';') -contains $dir)) {
    Write-Step "$dir already in user PATH"
    return
  }
  $newPath = if ($current) { "$dir;$current" } else { $dir }
  [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
  Write-Step "Added $dir to user PATH (open a new terminal for it to take effect)"
}

# ---------- legacy kimi-cli migration ----------
#
# Mirror of the Node postinstall logic (apps/kimi-code/scripts/postinstall*):
# detect every previous Python `kimi-cli` shim on PATH, rename the first to
# `kimi-legacy.exe` so users keep a fallback, and remove subsequent
# duplicates so the new CLI is not shadowed. The native binary installer
# prepends $KimiInstallDir\bin to PATH, so reachability is guaranteed in any
# fresh terminal — no first-match check needed.

$LegacyBin = 'kimi'
$LegacyRename = 'kimi-legacy'
$PythonMarker = 'kimi_cli'
# 256 KiB sniff window: `uv tool install` on Windows produces a Rust launcher
# .exe (~45 KiB) and the kimi_cli module name sits near the end. Larger than
# strictly needed for setuptools-style scripts; capped so a hostile file
# can't make us hold a lot of memory.
$ShimSniffBytesMax = 256 * 1024

function Get-ExecutableCandidates([string]$basename) {
  $exts = $env:PATHEXT
  if (-not $exts) { $exts = '.EXE;.CMD;.BAT;.COM' }
  $names = @($basename)
  foreach ($e in $exts.ToLower().Split(';')) {
    $trim = $e.Trim()
    if ($trim) { $names += ($basename + $trim) }
  }
  return $names
}

function Test-LegacyShim([string]$path) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf -ErrorAction SilentlyContinue)) { return $false }
  try {
    $canonical = [System.IO.Path]::GetFullPath($path)
    # Defense in depth: never inspect our own install tree as a legacy shim,
    # even if something in the bundled JS happens to contain the marker.
    # Trailing separator avoids false positives on sibling dirs that share a
    # name prefix (e.g. `.kimi-code` vs `.kimi-code-other`).
    $ownPrefix = [System.IO.Path]::GetFullPath($KimiInstallDir).TrimEnd('\') + '\'
    if ($canonical.ToLower().StartsWith($ownPrefix.ToLower())) { return $false }
    $fs = [System.IO.File]::OpenRead($canonical)
    try {
      $size = [int][Math]::Min([long]$fs.Length, [long]$ShimSniffBytesMax)
      $buf = New-Object byte[] $size
      $read = $fs.Read($buf, 0, $size)
    } finally { $fs.Close() }
    # iso-8859-1 is 1-to-1 byte->char; safe for ASCII marker search and won't
    # mangle the bytes around the marker via UTF-8 decoding.
    $text = [System.Text.Encoding]::GetEncoding('iso-8859-1').GetString($buf, 0, $read)
    return $text.Contains($PythonMarker)
  } catch {
    return $false
  }
}

function Find-LegacyShims {
  $ownBin = (Join-Path $KimiInstallDir 'bin').TrimEnd('\').ToLower()
  $candidates = Get-ExecutableCandidates $LegacyBin
  $seenDirs = @{}
  $results = @()
  foreach ($dir in ($env:Path -split ';')) {
    if (-not $dir) { continue }
    $dirKey = $dir.TrimEnd('\').ToLower()
    if ($seenDirs.ContainsKey($dirKey)) { continue }
    $seenDirs[$dirKey] = $true
    if ($dirKey -eq $ownBin) { continue }
    foreach ($name in $candidates) {
      # [IO.Path]::Combine, not Join-Path: Join-Path resolves the path's drive
      # qualifier through the PS provider and throws a terminating "Cannot find
      # drive 'X'" for any PATH entry on a drive that no longer exists (an
      # unplugged/removed/disconnected drive, e.g. D:). Combine is a pure string
      # op; the try/catch also skips otherwise-malformed PATH entries.
      try { $shim = [System.IO.Path]::Combine($dir, $name) } catch { continue }
      if (-not (Test-Path -LiteralPath $shim -PathType Leaf -ErrorAction SilentlyContinue)) { continue }
      if (Test-LegacyShim $shim) { $results += $shim }
    }
  }
  # Plain return so the caller's @() wrap handles all cases correctly:
  # `return ,$results` would wrap an empty result as a 1-element array
  # holding @(), which slips past the $shims.Count guard downstream.
  return $results
}

function Test-DirWritable([string]$dir) {
  try {
    $probe = Join-Path $dir ('.kimi-write-probe-' + [guid]::NewGuid().ToString('N'))
    Set-Content -LiteralPath $probe -Value '' -ErrorAction Stop
    Remove-Item -LiteralPath $probe -Force -ErrorAction Stop
    return $true
  } catch { return $false }
}

function Test-SystemOwnedDir([string]$shim) {
  $dir = (Split-Path -Parent $shim).ToLower()
  $roots = @(
    'c:\program files',
    'c:\program files (x86)',
    'c:\programdata',
    'c:\windows'
  )
  foreach ($r in $roots) {
    if ($dir -eq $r -or $dir.StartsWith($r + '\')) { return $true }
  }
  return $false
}

function Get-RenameTarget([string]$shim) {
  # Preserve extension so kimi.exe -> kimi-legacy.exe stays a runnable .exe.
  $dir = Split-Path -Parent $shim
  $ext = [System.IO.Path]::GetExtension($shim)
  return Join-Path $dir ($LegacyRename + $ext)
}

function Get-ShimClassification([string]$shim) {
  $target = Get-RenameTarget $shim
  $dir = Split-Path -Parent $shim
  if (-not (Test-DirWritable $dir)) {
    return @{ Kind = 'blocked'; Shim = $shim; Target = $target; IsSystemPath = (Test-SystemOwnedDir $shim) }
  }
  if (Test-Path -LiteralPath $target -ErrorAction SilentlyContinue) {
    if (Test-LegacyShim $target) {
      return @{ Kind = 'consolidate'; Shim = $shim; Target = $target }
    }
    return @{ Kind = 'delete-only'; Shim = $shim; Target = $target }
  }
  return @{ Kind = 'renameable'; Shim = $shim; Target = $target }
}

function Invoke-LegacyMigration {
  $shims = @(Find-LegacyShims)
  if ($shims.Count -eq 0) { return }

  # KIMI_NO_MODIFY_PATH + our bin dir not on current PATH: renaming legacy
  # would strand the user with no kimi command. List what we found and skip.
  if ($KimiNoPath) {
    $ownBin = Join-Path $KimiInstallDir 'bin'
    $ownBinKey = $ownBin.TrimEnd('\').ToLower()
    $onPath = $false
    foreach ($p in ($env:Path -split ';')) {
      if ($p -and $p.TrimEnd('\').ToLower() -eq $ownBinKey) { $onPath = $true; break }
    }
    if (-not $onPath) {
      Write-Step "Found previous kimi-cli on PATH but skipping migration"
      Write-Step "(KIMI_NO_MODIFY_PATH set and $ownBin is not on PATH -"
      Write-Step "renaming would leave no working kimi command). Affected:"
      foreach ($s in $shims) { Write-Host "      $s" }
      Write-Step "Add $ownBin to PATH and re-run to migrate."
      return
    }
  }

  $renames = @()
  $consolidates = @()
  $skippedForeign = @()
  $deletes = @()
  $blocked = @()
  $errors = @()
  $firstDone = $false

  foreach ($shim in $shims) {
    $c = Get-ShimClassification $shim
    if ($c.Kind -eq 'blocked') { $blocked += $c; continue }
    if (-not $firstDone) {
      $firstDone = $true
      switch ($c.Kind) {
        'renameable' {
          try {
            Move-Item -LiteralPath $c.Shim -Destination $c.Target -ErrorAction Stop
            $renames += $c
          } catch {
            $errors += @{ Shim = $c.Shim; Message = $_.Exception.Message }
          }
        }
        'consolidate' {
          try {
            Remove-Item -LiteralPath $c.Shim -Force -ErrorAction Stop
            $consolidates += $c
          } catch {
            $errors += @{ Shim = $c.Shim; Message = $_.Exception.Message }
          }
        }
        'delete-only' {
          try {
            Remove-Item -LiteralPath $c.Shim -Force -ErrorAction Stop
            $skippedForeign += $c
          } catch {
            $errors += @{ Shim = $c.Shim; Message = $_.Exception.Message }
          }
        }
      }
    } else {
      try {
        Remove-Item -LiteralPath $c.Shim -Force -ErrorAction Stop
        $deletes += $c
      } catch {
        $errors += @{ Shim = $c.Shim; Message = $_.Exception.Message }
      }
    }
  }

  Write-Step "Migrated previous kimi-cli installation:"
  if ($renames.Count -gt 0) {
    Write-Host "    Renamed (preserved as kimi-legacy):"
    foreach ($c in $renames) { Write-Host "      $($c.Shim) -> $($c.Target)" }
  }
  if ($consolidates.Count -gt 0) {
    Write-Host "    Removed duplicate (existing kimi-legacy kept):"
    foreach ($c in $consolidates) { Write-Host "      $($c.Shim) (existing $($c.Target) kept)" }
  }
  if ($skippedForeign.Count -gt 0) {
    Write-Host "    Removed (kimi-legacy slot was a user-managed file):"
    foreach ($c in $skippedForeign) { Write-Host "      $($c.Shim) (left $($c.Target) alone)" }
  }
  if ($deletes.Count -gt 0) {
    Write-Host "    Also removed (would have shadowed the new CLI):"
    foreach ($c in $deletes) { Write-Host "      $($c.Shim)" }
  }
  if ($blocked.Count -gt 0) {
    Write-Host "    Note: could not remove these (no write permission), but"
    Write-Host "    PATH order means they no longer shadow the new CLI:"
    foreach ($c in $blocked) {
      Write-Host "      $($c.Shim)"
      $quoted = "'" + ($c.Shim -replace "'", "''") + "'"
      if ($c.IsSystemPath) {
        Write-Host "        Remove manually (run in elevated PowerShell):"
        Write-Host "          Remove-Item $quoted"
      } else {
        Write-Host "        Remove manually: Remove-Item $quoted"
      }
    }
  }
  if ($errors.Count -gt 0) {
    Write-Host "    The following operations failed unexpectedly:"
    foreach ($e in $errors) { Write-Host "      $($e.Shim) ($($e.Message))" }
  }
}

# ---------- main ----------

try {

$target = Detect-Target
Write-Step "Detected target: $target"

# 1. Version
if ($KimiVersion) {
  $version = $KimiVersion
  Write-Step "Using pinned version $version"
} else {
  $latestUrl = "$KimiDownloadBase/latest"
  Write-Step "Resolving latest version from $latestUrl"
  # CDN serves `latest` without an explicit text content-type, so PS may
  # hand back a byte[] rather than a string. Coerce either shape into a
  # UTF-8 string before trimming.
  $version = (Invoke-WebRequest -Uri $latestUrl -UseBasicParsing).Content
  if ($version -is [byte[]]) { $version = [System.Text.Encoding]::UTF8.GetString($version) }
  $version = $version.Trim()
  if (-not $version) { Die "could not resolve latest version" }
  Write-Step "Latest version: $version"
}

# 2. Manifest
$manifestUrl = "$KimiBinaryBase/$version/manifest.json"
Write-Step "Fetching manifest $manifestUrl"
$manifest = Invoke-RestMethod -Uri $manifestUrl
$entry = $manifest.platforms.$target
if (-not $entry) { Die "platform $target not found in manifest" }
$filename = $entry.filename
$checksum = $entry.checksum
if ($checksum -notmatch '^[a-f0-9]{64}$') { Die "invalid checksum for ${target}: $checksum" }

# 3. Download binary
$tmp = Join-Path $env:TEMP ([guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  $binaryUrl = "$KimiBinaryBase/$version/$filename"
  $tmpBinary = Join-Path $tmp $filename
  Write-Step "Downloading $binaryUrl"
  Invoke-WebRequest -Uri $binaryUrl -OutFile $tmpBinary

  Write-Step "Verifying checksum"
  Test-Sha256 $tmpBinary $checksum

  # 4. Install
  $binDir = Join-Path $KimiInstallDir 'bin'
  New-Item -ItemType Directory -Path $binDir -Force | Out-Null
  $binaryDest = Join-Path $binDir 'kimi.exe'
  if (Test-Path $binaryDest) {
    $backup = "$binaryDest.bak"
    if (Test-Path $backup) {
      try {
        Remove-Item $backup -Force -ErrorAction Stop
      } catch {
        # File is locked by a running kimi process; use a unique backup name so
        # the install can proceed. The locked .bak is released when kimi exits.
        $backup = "$binaryDest.$([guid]::NewGuid().ToString('N').Substring(0,8)).bak"
      }
    }
    # Windows allows renaming a running .exe but not overwriting it, so move the old one first and then copy the new one.
    Move-Item $binaryDest $backup -Force
    Write-Step "Backed up existing kimi.exe to $([System.IO.Path]::GetFileName($backup))"
  }
  Copy-Item $tmpBinary $binaryDest -Force
  Write-Step "Installed to $binaryDest"

  # 5. PATH
  Add-ToUserPath $binDir

  # 6. Migrate previous Python kimi-cli installations: rename the first kimi
  #    on PATH to kimi-legacy (preserve fallback) and drop later duplicates
  #    so the new CLI is not shadowed.
  Invoke-LegacyMigration

  Write-Step "Done. Open a new terminal and run: kimi --version"
} finally {
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}

} catch {
  $err = $_
  [Console]::Error.WriteLine("")
  [Console]::Error.WriteLine("================ DEBUG: FULL ERROR ================")
  [Console]::Error.WriteLine("ExceptionType         : $($err.Exception.GetType().FullName)")
  [Console]::Error.WriteLine("Message               : $($err.Exception.Message)")
  if ($err.Exception.InnerException) {
    [Console]::Error.WriteLine("InnerException        : $($err.Exception.InnerException.Message)")
  }
  [Console]::Error.WriteLine("FullyQualifiedErrorId : $($err.FullyQualifiedErrorId)")
  [Console]::Error.WriteLine("CategoryInfo          : $($err.CategoryInfo)")
  if ($err.InvocationInfo) {
    [Console]::Error.WriteLine("Line                  : $($err.InvocationInfo.Line)")
    [Console]::Error.WriteLine("PositionMessage       : $($err.InvocationInfo.PositionMessage.Trim())")
  }
  if ($err.ScriptStackTrace) {
    [Console]::Error.WriteLine("ScriptStackTrace:")
    [Console]::Error.WriteLine($err.ScriptStackTrace)
  }
  [Console]::Error.WriteLine("===================================================")
  [Console]::Error.WriteLine("")
  [Console]::Error.WriteLine("Installation failed.")
  try { Read-Host "Press Enter to exit" } catch {}
  exit 1
}
