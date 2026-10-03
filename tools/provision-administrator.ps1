param([string]$Project='waypoint-production',[Parameter(Mandatory=$true)][string]$Username,[string]$Depot='PELIYAGODA',[string]$DisplayName='Operations administrator')
$ErrorActionPreference='Stop'
if($Project -notmatch '^[a-z][a-z0-9_-]{0,50}$'-or$Username -notmatch '^[A-Za-z0-9_.-]{3,60}$'-or$Depot -notin @('PELIYAGODA','KANDY')){throw 'Check project, username and source depot'}
$securePassword=Read-Host 'Initial administrator password (12–72 UTF-8 bytes)' -AsSecureString
$passwordPointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
 $provisionPassword=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
 $bytes=[Text.Encoding]::UTF8.GetByteCount($provisionPassword)
 if($bytes -lt 12 -or $bytes -gt 72){throw 'Password must be 12–72 UTF-8 bytes'}
 $safePassword=$provisionPassword.Replace("'","''")
 $safeName=$DisplayName.Replace("'","''")
 $id='ADMIN-'+[Guid]::NewGuid().ToString('N').Substring(0,16)
 # The password enters psql on stdin, never as a process argument or persisted file.
 $sql=@"
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
INSERT INTO accounts(id,username,display_name,password_hash,role,depot_code,enabled,administration_enabled,network_read_all)
VALUES('$id','$Username','$safeName',crypt('$safePassword',gen_salt('bf',12)),'DISPATCHER','$Depot',true,true,true);
INSERT INTO operational_audit(account_id,entity_type,entity_id,event,reason,changes)
VALUES('$id','accounts','$id','ADMINISTRATOR_PROVISIONED','Explicit deployment bootstrap from the host administrator','{}');
COMMIT;
"@
 $sql | docker compose -p $Project exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' *> $null
 if($LASTEXITCODE -ne 0){throw 'Provisioning failed. Check that migrations ran, the depot exists and the username is unused.'}
 Write-Output "Provisioned $Username for $Depot. Use HTTPS to sign in and create scoped operational accounts."
}finally{
 $provisionPassword=$null;$safePassword=$null;$sql=$null
 [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
}
