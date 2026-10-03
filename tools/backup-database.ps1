param([string]$Project='waypoint')
$ErrorActionPreference='Stop'
if($Project -notmatch '^[a-z][a-z0-9_-]{0,50}$'){throw 'Invalid Compose project name'}
$workspacePath=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$backupDirectory=Join-Path $workspacePath 'data/private/backups'
New-Item -ItemType Directory -Force -Path $backupDirectory | Out-Null
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$containerPath="/tmp/waypoint-$stamp.dump"
$backupPath=Join-Path $backupDirectory "$Project-$stamp.dump"
docker compose -p $Project exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --file="$1"' sh $containerPath
if($LASTEXITCODE -ne 0){throw 'Backup failed; no successful backup is claimed'}
docker compose -p $Project cp "db:$containerPath" $backupPath
if($LASTEXITCODE -ne 0){throw 'Backup copy failed'}
docker compose -p $Project exec -T db rm -- $containerPath
Get-FileHash -Algorithm SHA256 -LiteralPath $backupPath | Format-List
Write-Output "Private database backup: $backupPath. Includes server evidence and account hashes; encrypt and restrict access before off-device storage."
