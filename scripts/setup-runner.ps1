<#
Installs GitHub Actions self-hosted runners on this PC for the check-shows
workflow, so District and BookMyShow are fetched from a home connection
instead of GitHub's (blocked) IPs.

  .\scripts\setup-runner.ps1            # install 2 runners (one per site, so they run in parallel)
  .\scripts\setup-runner.ps1 -Remove    # unregister and delete them

Needs the GitHub CLI (`gh auth login`) with admin access to the repo. No
administrator rights: each runner is a scheduled task that starts when you
log on and runs as you. Checks only happen while the PC is on and awake.
#>
param(
    [int]$Count = 2,
    [string]$Repo = "AyushK0808/dunesday",
    [string]$Root = "$HOME\actions-runner",
    [switch]$Remove
)

$ErrorActionPreference = "Stop"
$names = 1..$Count | ForEach-Object { "dunesday-$_" }

function Get-RunnerToken([string]$kind) {
    $t = gh api -X POST "repos/$Repo/actions/runners/$kind" --jq .token
    if ($LASTEXITCODE -ne 0 -or -not $t) { throw "Could not get a runner $kind from GitHub (is gh logged in with admin access?)" }
    return $t
}

if ($Remove) {
    $token = Get-RunnerToken "remove-token"
    foreach ($n in $names) {
        $task = "GitHub Runner $n"
        if (Get-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue) {
            Stop-ScheduledTask -TaskName $task
            Unregister-ScheduledTask -TaskName $task -Confirm:$false
        }
        Get-Process Runner.Listener, Runner.Worker -ErrorAction SilentlyContinue |
            Where-Object { $_.Path -like "$Root\$n\*" } | Stop-Process -Force
        $dir = Join-Path $Root $n
        if (Test-Path "$dir\config.cmd") {
            Push-Location $dir
            try { & .\config.cmd remove --token $token } finally { Pop-Location }
        }
        if (Test-Path $dir) { Remove-Item -Recurse -Force $dir }
        Write-Host "Removed $n"
    }
    return
}

# Download the latest runner once.
$version = (gh api repos/actions/runner/releases/latest --jq .tag_name).TrimStart("v")
$zip = Join-Path $Root "actions-runner-win-x64-$version.zip"
New-Item -ItemType Directory -Force $Root | Out-Null
if (-not (Test-Path $zip)) {
    Write-Host "Downloading runner $version"
    $url = "https://github.com/actions/runner/releases/download/v$version/actions-runner-win-x64-$version.zip"
    Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
}

$token = Get-RunnerToken "registration-token"
foreach ($n in $names) {
    $dir = Join-Path $Root $n
    if (-not (Test-Path "$dir\config.cmd")) {
        New-Item -ItemType Directory -Force $dir | Out-Null
        Expand-Archive -Path $zip -DestinationPath $dir -Force
    }
    Push-Location $dir
    try {
        if (-not (Test-Path ".runner")) {
            & .\config.cmd --unattended --url "https://github.com/$Repo" --token $token `
                --name "$env:COMPUTERNAME-$n" --labels dunesday --work _work --replace
            if ($LASTEXITCODE -ne 0) { throw "config.cmd failed for $n" }
        }
    } finally { Pop-Location }

    # Start at logon, hidden, restart if it crashes, never time out.
    $task = "GitHub Runner $n"
    $action = New-ScheduledTaskAction -Execute "powershell.exe" `
        -Argument "-NoProfile -WindowStyle Hidden -Command `"& '$dir\run.cmd'`"" -WorkingDirectory $dir
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
        -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskName $task -Action $action -Trigger $trigger -Settings $settings `
        -Description "GitHub Actions runner for $Repo (dunesday)" -Force | Out-Null
    Start-ScheduledTask -TaskName $task
    Write-Host "Installed and started $n"
}

Write-Host "Done. Check https://github.com/$Repo/settings/actions/runners - the runners should show as Idle within a minute."
