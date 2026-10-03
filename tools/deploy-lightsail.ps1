param(
    [string]$Revision = 'HEAD',
    [ValidatePattern('^[A-Za-z0-9.-]+$')][string]$ServerAddress = '18.138.29.235',
    [ValidatePattern('^[a-z_][a-z0-9_-]*$')][string]$ServerUser = 'ubuntu',
    [string]$SSHKeyPath = "$env:USERPROFILE/Downloads/waypoint-key.pem"
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $SSHKeyPath)) { throw 'The local SSH key is missing.' }
$repository = Split-Path $PSScriptRoot -Parent
Push-Location $repository
try {
    & "$PSScriptRoot/package-release.ps1" -Revision $Revision
    $commit = (& git rev-parse --verify "$Revision^{commit}").Trim()
    if ($LASTEXITCODE -ne 0 -or $commit -notmatch '^[a-f0-9]{40}$') { throw 'Invalid release commit.' }
    $archive = Join-Path $repository "tmp/releases/$commit/waypoint-source.tar.gz"
    $hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    $sshArguments = @('-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=15', '-i', $SSHKeyPath)
    # Transfers source only. Existing approved private inputs and cloud.env stay
    # on the server; subsequent development releases preserve the cloud database.
    & scp @sshArguments $archive "${ServerUser}@${ServerAddress}:/opt/waypoint/releases/$commit.tar.gz"
    if ($LASTEXITCODE -ne 0) { throw 'Source release upload failed.' }
    $command = "set -eu; cd /opt/waypoint/releases; echo '$hash  $commit.tar.gz' | sha256sum -c -; mkdir -p $commit; tar -xzf $commit.tar.gz -C $commit; bash /opt/waypoint/releases/$commit/deploy/lightsail/start-release.sh /opt/waypoint/releases/$commit"
    & ssh @sshArguments "${ServerUser}@${ServerAddress}" $command
    if ($LASTEXITCODE -ne 0) { throw 'Cloud update failed. Inspect service health before accepting the release.' }
    Write-Output "Cloud release started: $commit"
} finally {
    Pop-Location
}
