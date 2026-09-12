param([string]$Version = '2026.09.12')
$ErrorActionPreference = 'Stop'
if ($Version -notmatch '^\d{4}\.\d{2}\.\d{2}$') { throw 'Use a calendar version: YYYY.MM.DD' }
$rtsRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$rtsTarget = Join-Path $rtsRoot "release\iron-dunes-$Version"
if (Test-Path -LiteralPath $rtsTarget) { throw "Package directory already exists: $rtsTarget" }
if (-not (Test-Path -LiteralPath (Join-Path $rtsRoot 'dist\index.html'))) { throw 'Run npm run build first' }
$rtsManifest = Get-Content -Raw -LiteralPath (Join-Path $rtsRoot 'package.json') | ConvertFrom-Json
$rtsExpected = (($Version -split '\.') | ForEach-Object { [int]$_ }) -join '.'
if ($rtsManifest.version -ne $rtsExpected) { throw 'Package version does not match the release' }
$rtsFiles = @('package.json', 'package-lock.json', 'README.md', 'RELEASE_NOTES.md', 'StartGame.cmd') | ForEach-Object { Get-Item -LiteralPath (Join-Path $rtsRoot $_) }
$rtsFiles += Get-ChildItem -LiteralPath (Join-Path $rtsRoot 'server') -File -Filter '*.mjs'
# В архив попадают только игровые файлы. Исходники Blender, логи и настройки исключены.
$rtsFiles += Get-ChildItem -LiteralPath (Join-Path $rtsRoot 'dist') -Recurse -File | Where-Object { $_.Extension -in @('.html', '.js', '.css', '.glb', '.png', '.svg', '.ico', '.webp', '.woff2') }
foreach ($rtsFile in $rtsFiles) {
    $rtsRelative = $rtsFile.FullName.Substring($rtsRoot.Length + 1)
    $rtsDestination = Join-Path $rtsTarget $rtsRelative
    [System.IO.Directory]::CreateDirectory((Split-Path $rtsDestination)) | Out-Null
    Copy-Item -LiteralPath $rtsFile.FullName -Destination $rtsDestination
}
$rtsArchive = "$rtsTarget.zip"
Compress-Archive -LiteralPath $rtsTarget -DestinationPath $rtsArchive
$rtsHash = (Get-FileHash -LiteralPath $rtsArchive -Algorithm SHA256).Hash.ToLowerInvariant()
"$rtsHash  iron-dunes-$Version.zip" | Set-Content -LiteralPath (Join-Path $rtsRoot 'release\SHA256SUMS.txt') -Encoding ascii
Write-Output $rtsArchive
Write-Output "SHA256 $rtsHash"
