# AWS deployment

AWS deployment is the next active task. The user confirmed a competition environment: retain labelled judge inputs and the four-role demonstration, while keeping local development separate. No AWS resources have been created yet. The local application and database remain intact. Account access, region, monthly budget and deployment hostname must be established before selecting and provisioning the cloud topology.

Preparation verified on 3 October 2026: both PowerShell scripts parse; the release archive was created and inspected (189 committed files, no `.env` or private data); missing CLI fails explicitly. AWS CLI is not installed or authenticated here. The official installer download timed out before completion; no unverified installer was executed. Cloud deployment and cloud smoke tests remain pending.

## Prepare an immutable release

```powershell
./tools/package-release.ps1 -Revision HEAD
```

This creates a source-only Git archive and SHA-256 manifest under ignored `tmp/releases/<commit>/`. It archives the selected commit rather than copying a working directory. It checks committed paths for private data, environment files and certificate/backup extensions. This is a path check, not a comprehensive secret scanner. The bundle excludes uncommitted changes; deploy a reviewed commit.

Private network SQL, prepared OSRM road files and any explicitly selected database backup must travel separately through restricted encrypted storage. Do not upload the local `.env`, demo browser evidence or a full workspace. Decide explicitly whether staging starts from imported judge fixtures or a restored database; production uses reviewed imports and new authorized accounts. A blank installation is not a migration of local history.

## Verify the target account

Install AWS CLI v2 using the [official AWS installer](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html). Configure an authorized named profile, preferably with [IAM Identity Center](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sso.html), and authenticate locally. Never paste access keys into chat or commit them. The following command is read only:

```powershell
./tools/aws-preflight.ps1 -Profile '<authorized profile>' -Region '<chosen region>' -ExpectedAccountId '<12-digit account ID>'
```

Preflight verifies STS authentication and the expected account. It does not create resources or establish that the identity has provisioning permissions. Scope deployment credentials to the selected environment; do not rely on long-lived root credentials.

## Deployment acceptance and continued development

Before accepting the first AWS release, verify HTTPS, secure cookies, four-role login and scopes, actual OSRM multi-stop allocation, ordered loading, approved shortages, driver proof, offline reload/conflict recovery, store receipt, scoped live updates and routing-failure behavior on isolated cloud judge records. Verify persistent database storage and an off-host encrypted backup with a tested restore. Confirm required source files and capabilities are present before claiming dataset readiness.

Record the deployed commit, image digests, environment mode, hostname and recovery procedure. Keep local development and cloud staging separate. Subsequent releases must use reviewed commits, run existing checks, take a pre-migration backup, preserve the database volume and smoke-test the deployed app. Never invoke judge reset as part of deployment. Schema migrations may prevent simply rolling back an image; assess migration compatibility before rollback.

The existing [HTTPS and recovery instructions](deployment.md) are the application baseline. AWS-specific provisioning, pricing and public acceptance will be documented once the target environment is known. A cost estimate requires region and topology; no price or production-availability claim is made yet.
