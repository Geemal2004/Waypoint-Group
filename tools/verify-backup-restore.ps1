param([Parameter(Mandatory=$true)][string]$BackupPath)
$ErrorActionPreference='Stop'
$workspacePath=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$privateRoot=[IO.Path]::GetFullPath((Join-Path $workspacePath 'data/private'))
$resolvedBackup=[IO.Path]::GetFullPath($BackupPath)
if(-not $resolvedBackup.StartsWith($privateRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)-or-not(Test-Path -LiteralPath $resolvedBackup)){throw 'Choose an existing backup in this workspace private directory'}
$containerName='waypoint-restore-check-'+[Guid]::NewGuid().ToString('N').Substring(0,12)
# Disposable isolated container, no host port, no production volume, no remote network.
docker run -d --name $containerName --network none --tmpfs /var/lib/postgresql/data -e POSTGRES_HOST_AUTH_METHOD=trust postgis/postgis:16-3.4 | Out-Null
if($LASTEXITCODE -ne 0){throw 'Unable to create isolated restore target'}
try {
 $ready=$false
 for($attempt=0;$attempt -lt 30;$attempt++){
  # The image starts a temporary socket-only server during initialization.
  # TCP readiness waits for the final server, avoiding a shutdown during restore.
  docker exec $containerName pg_isready -h 127.0.0.1 -U postgres *> $null
  if($LASTEXITCODE -eq 0){$ready=$true;break}
  Start-Sleep -Seconds 1
 }
 if(-not $ready){throw 'Restore target not ready'}
 docker cp $resolvedBackup "${containerName}:/tmp/backup.dump"
 if($LASTEXITCODE -ne 0){throw 'Backup copy failed'}
 docker exec $containerName createdb -U postgres restored
 docker exec $containerName pg_restore -U postgres -d restored --no-owner --no-acl --exit-on-error /tmp/backup.dump
 if($LASTEXITCODE -ne 0){throw 'Restore failed'}
 docker exec $containerName psql -U postgres -d restored -v ON_ERROR_STOP=1 -c 'SELECT (SELECT count(*) FROM orders) AS orders, (SELECT count(*) FROM route_stops) AS stops, (SELECT count(*) FROM proofs) AS proofs, (SELECT count(*) FROM receipts) AS receipts, (SELECT count(*) FROM audit_events) AS audit_events;'
 if($LASTEXITCODE -ne 0){throw 'Restored schema verification failed'}
 docker exec $containerName psql -U postgres -d restored -v ON_ERROR_STOP=1 -c "SELECT version,success FROM flyway_schema_history ORDER BY installed_rank; SELECT count(*) AS orphaned_stops FROM route_stops s LEFT JOIN orders o ON o.id=s.order_id WHERE o.id IS NULL;"
 if($LASTEXITCODE -ne 0){throw 'Restored integrity verification failed'}
 Write-Output 'Restore succeeded in an isolated disposable database. The live database was not altered.'
}finally{
 docker rm -f $containerName | Out-Null
}
