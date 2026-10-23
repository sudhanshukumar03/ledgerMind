$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$version = (Get-Content -LiteralPath (Join-Path $workspace '.node-version') -Raw).Trim()
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid pinned Node version' }
if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64') { throw 'This Windows bootstrap currently supports x64' }
$runtimeRoot = Join-Path $workspace '.runtime'
$folderName = "node-v$version-win-x64"
$destination = Join-Path $runtimeRoot $folderName
$node = Join-Path $destination 'node.exe'
if (Test-Path -LiteralPath $node) {
    $installed = & $node --version
    if ($LASTEXITCODE -ne 0 -or $installed -ne "v$version") { throw 'Existing project runtime does not match the pin' }
    Write-Output "Project Node $installed is ready"
    exit 0
}
New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
$archiveName = "$folderName.zip"
$archive = Join-Path $runtimeRoot $archiveName
$base = "https://nodejs.org/dist/v$version"
$checksums = (Invoke-WebRequest -UseBasicParsing -Uri "$base/SHASUMS256.txt").Content
$expected = $null
foreach ($line in ($checksums -split "`n")) {
    if ($line.Trim() -match ('^([a-f0-9]{64})\s+' + [regex]::Escape($archiveName) + '$')) { $expected = $Matches[1]; break }
}
if (-not $expected) { throw 'Official archive checksum not found' }
Invoke-WebRequest -UseBasicParsing -Uri "$base/$archiveName" -OutFile $archive
$actual = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $expected) { throw 'Node archive checksum mismatch; extraction refused' }
$staging = Join-Path $runtimeRoot ("extract-" + [guid]::NewGuid().ToString('N') + '.tmp')
try {
    Expand-Archive -LiteralPath $archive -DestinationPath $staging
    $extracted = Join-Path $staging $folderName
    if (-not (Test-Path -LiteralPath (Join-Path $extracted 'node.exe'))) { throw 'Node executable missing from archive' }
    Move-Item -LiteralPath $extracted -Destination $destination
    $installed = & $node --version
    if ($LASTEXITCODE -ne 0 -or $installed -ne "v$version") { throw 'Downloaded Node version did not match the pin' }
    @{version=$version;archive=$archiveName;sha256=$actual;source="$base/$archiveName"} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $destination 'installation.json')
    Write-Output "Project Node $installed installed; official archive SHA-256 verified"
} finally {
    $resolvedStaging = [IO.Path]::GetFullPath($staging)
    $expectedRoot = [IO.Path]::GetFullPath($runtimeRoot) + [IO.Path]::DirectorySeparatorChar
    if (-not $resolvedStaging.StartsWith($expectedRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe cleanup target refused' }
    if (Test-Path -LiteralPath $resolvedStaging) { Remove-Item -LiteralPath $resolvedStaging -Recurse -Force }
}
