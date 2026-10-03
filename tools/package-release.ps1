param(
    [string]$Revision = 'HEAD'
)

$ErrorActionPreference = 'Stop'
$repository = Split-Path $PSScriptRoot -Parent
Push-Location $repository
try {
    $commit = git rev-parse --verify "$Revision^{commit}"
    if ($LASTEXITCODE -ne 0) { throw 'The release revision must identify an existing commit.' }
    $commit = $commit.Trim()
    $destination = Join-Path $repository "tmp/releases/$commit"
    New-Item -ItemType Directory -Force -Path $destination | Out-Null
    $archive = Join-Path $destination 'waypoint-source.tar.gz'
    $files = @(git ls-tree -r --name-only $commit)
    if ($LASTEXITCODE -ne 0) { throw 'Release file inspection failed.' }
    $restricted = @($files | Where-Object {
        $_ -match '(^|/)\.env($|\.)' -and $_ -notmatch '\.example$' -or
        $_ -match '^data/private/' -or
        $_ -match '^data/osrm/' -and $_ -ne 'data/osrm/.gitkeep' -or
        $_ -match '\.(pem|key|p12|pfx|dump)$'
    })
    if ($restricted.Count -gt 0) { throw 'Restricted file paths found in the commit. Do not upload this release.' }
    # Archive committed source only. Never copy the workspace, private data or credentials.
    git archive --format=tar.gz --output=$archive $commit
    if ($LASTEXITCODE -ne 0) { throw 'Release archive creation failed.' }
    $hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    [ordered]@{
        commit = $commit
        archive = 'waypoint-source.tar.gz'
        sha256 = $hash
        createdAt = [DateTime]::UtcNow.ToString('o')
        privateDataIncluded = $false
    } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $destination 'release.json') -Encoding utf8
    Write-Output "Release: $destination"
    Write-Output "Commit: $commit"
    Write-Output "SHA256: $hash"
    Write-Output 'Source only. Database state, network imports, OSRM files and credentials require a separate private transfer.'
} finally {
    Pop-Location
}
