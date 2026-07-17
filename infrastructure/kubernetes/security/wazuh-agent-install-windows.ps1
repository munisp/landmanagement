# IDLR Security Infrastructure - Wazuh Agent Installation Script (Windows)
# This script installs and configures Wazuh agent on Windows servers
# Run this script as Administrator

param(
    [Parameter(Mandatory=$true)]
    [string]$WazuhManager,
    
    [Parameter(Mandatory=$false)]
    [string]$AgentName = $env:COMPUTERNAME,
    
    [Parameter(Mandatory=$false)]
    [string]$AgentGroups = "idlr,production"
)

# Check if running as Administrator
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Error: This script must be run as Administrator" -ForegroundColor Red
    exit 1
}

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "IDLR Security Infrastructure" -ForegroundColor Cyan
Write-Host "Wazuh Agent Installation (Windows)" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Configuration:" -ForegroundColor Yellow
Write-Host "  Wazuh Manager: $WazuhManager"
Write-Host "  Agent Name: $AgentName"
Write-Host "  Agent Groups: $AgentGroups"
Write-Host ""

$confirmation = Read-Host "Proceed with installation? (y/N)"
if ($confirmation -ne 'y' -and $confirmation -ne 'Y') {
    Write-Host "Installation cancelled"
    exit 0
}

Write-Host ""
Write-Host "Downloading Wazuh agent..." -ForegroundColor Yellow

# Download Wazuh agent installer
$wazuhVersion = "4.8.0"
$installerUrl = "https://packages.wazuh.com/4.x/windows/wazuh-agent-$wazuhVersion-1.msi"
$installerPath = "$env:TEMP\wazuh-agent.msi"

try {
    Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath
    Write-Host "✓ Wazuh agent downloaded" -ForegroundColor Green
}
catch {
    Write-Host "✗ Failed to download Wazuh agent: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Installing Wazuh agent..." -ForegroundColor Yellow

# Install Wazuh agent
$installArgs = @(
    "/i",
    $installerPath,
    "/q",
    "WAZUH_MANAGER=`"$WazuhManager`"",
    "WAZUH_AGENT_NAME=`"$AgentName`"",
    "WAZUH_REGISTRATION_SERVER=`"$WazuhManager`""
)

try {
    Start-Process msiexec.exe -ArgumentList $installArgs -Wait -NoNewWindow
    Write-Host "✓ Wazuh agent installed" -ForegroundColor Green
}
catch {
    Write-Host "✗ Failed to install Wazuh agent: $_" -ForegroundColor Red
    exit 1
}

# Wait for installation to complete
Start-Sleep -Seconds 5

Write-Host ""
Write-Host "Configuring Wazuh agent..." -ForegroundColor Yellow

# Backup original config
$configPath = "C:\Program Files (x86)\ossec-agent\ossec.conf"
$backupPath = "C:\Program Files (x86)\ossec-agent\ossec.conf.backup"

if (Test-Path $configPath) {
    Copy-Item $configPath $backupPath -Force
}

# Create new configuration
$ossecConfig = @"
<ossec_config>
  <client>
    <server>
      <address>$WazuhManager</address>
      <port>1514</port>
      <protocol>tcp</protocol>
    </server>
    <config-profile>$AgentGroups</config-profile>
    <notify_time>10</notify_time>
    <time-reconnect>60</time-reconnect>
    <auto_restart>yes</auto_restart>
  </client>

  <client_buffer>
    <disabled>no</disabled>
    <queue_size>5000</queue_size>
    <events_per_second>500</events_per_second>
  </client_buffer>

  <!-- File integrity monitoring -->
  <syscheck>
    <disabled>no</disabled>
    <frequency>43200</frequency>
    <scan_on_start>yes</scan_on_start>

    <!-- Directories to monitor -->
    <directories check_all="yes">C:\Windows\System32</directories>
    <directories check_all="yes">C:\Program Files</directories>
    <directories check_all="yes">C:\Program Files (x86)</directories>
    
    <!-- IDLR application directories -->
    <directories check_all="yes">C:\inetpub\wwwroot\idlr</directories>
    <directories check_all="yes">C:\IDLR</directories>

    <!-- Windows registry monitoring -->
    <windows_registry>HKEY_LOCAL_MACHINE\Software</windows_registry>
    <windows_registry>HKEY_LOCAL_MACHINE\System\CurrentControlSet\Services</windows_registry>
    <windows_registry>HKEY_LOCAL_MACHINE\System\CurrentControlSet\Control\Session Manager\KnownDLLs</windows_registry>
    <windows_registry>HKEY_LOCAL_MACHINE\System\CurrentControlSet\Control\SecurePipeServers\winreg</windows_registry>

    <!-- Ignore some directories -->
    <ignore>C:\Windows\Temp</ignore>
    <ignore>C:\Temp</ignore>
    <ignore type="sregex">\.log$|\.tmp$</ignore>

    <skip_nfs>yes</skip_nfs>

    <!-- Nice value for Syscheck process -->
    <process_priority>10</process_priority>

    <!-- Maximum output throughput -->
    <max_eps>100</max_eps>

    <!-- Database synchronization settings -->
    <synchronization>
      <enabled>yes</enabled>
      <interval>5m</interval>
      <max_interval>1h</max_interval>
      <max_eps>10</max_eps>
    </synchronization>
  </syscheck>

  <!-- Log analysis -->
  <localfile>
    <location>Application</location>
    <log_format>eventchannel</log_format>
  </localfile>

  <localfile>
    <location>Security</location>
    <log_format>eventchannel</log_format>
    <query>Event/System[EventID != 5145 and EventID != 5156]</query>
  </localfile>

  <localfile>
    <location>System</location>
    <log_format>eventchannel</log_format>
  </localfile>

  <localfile>
    <location>Microsoft-Windows-Sysmon/Operational</location>
    <log_format>eventchannel</log_format>
  </localfile>

  <!-- IDLR application logs -->
  <localfile>
    <location>C:\IDLR\logs\application.log</location>
    <log_format>json</log_format>
  </localfile>

  <localfile>
    <location>C:\IDLR\logs\security.log</location>
    <log_format>json</log_format>
  </localfile>

  <!-- Active response -->
  <active-response>
    <disabled>no</disabled>
    <ca_store>wpk_root.pem</ca_store>
    <ca_verification>yes</ca_verification>
  </active-response>

  <!-- Labels for agent -->
  <labels>
    <label key="environment">production</label>
    <label key="platform">idlr</label>
    <label key="hostname">$AgentName</label>
    <label key="os">windows</label>
  </labels>

</ossec_config>
"@

try {
    $ossecConfig | Out-File -FilePath $configPath -Encoding UTF8 -Force
    Write-Host "✓ Wazuh agent configured" -ForegroundColor Green
}
catch {
    Write-Host "✗ Failed to configure Wazuh agent: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Starting Wazuh agent..." -ForegroundColor Yellow

# Start Wazuh agent service
try {
    Start-Service -Name "Wazuh"
    Set-Service -Name "Wazuh" -StartupType Automatic
    Write-Host "✓ Wazuh agent service started" -ForegroundColor Green
}
catch {
    Write-Host "✗ Failed to start Wazuh agent service: $_" -ForegroundColor Red
    exit 1
}

# Wait for service to start
Start-Sleep -Seconds 3

# Check service status
$service = Get-Service -Name "Wazuh"
if ($service.Status -eq "Running") {
    Write-Host "✓ Wazuh agent is running" -ForegroundColor Green
}
else {
    Write-Host "✗ Wazuh agent is not running (Status: $($service.Status))" -ForegroundColor Red
    Write-Host "Check logs: C:\Program Files (x86)\ossec-agent\ossec.log"
    exit 1
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Installation Complete!" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Agent Information:" -ForegroundColor Yellow
Write-Host "  Name: $AgentName"
Write-Host "  Manager: $WazuhManager"
Write-Host "  Groups: $AgentGroups"
Write-Host "  Status: Running"
Write-Host ""

# Check if agent is registered
$clientKeysPath = "C:\Program Files (x86)\ossec-agent\client.keys"
if (Test-Path $clientKeysPath) {
    $clientKeys = Get-Content $clientKeysPath
    if ($clientKeys) {
        $agentId = ($clientKeys -split ' ')[0]
        Write-Host "  Agent ID: $agentId"
    }
    else {
        Write-Host "⚠ Agent is not yet registered with the manager" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "The agent will automatically register when it connects to the manager."
        Write-Host "If registration fails, you may need to manually register the agent."
    }
}

Write-Host ""
Write-Host "Useful commands:" -ForegroundColor Yellow
Write-Host "  Check agent status: Get-Service -Name 'Wazuh'"
Write-Host "  View agent logs: Get-Content 'C:\Program Files (x86)\ossec-agent\ossec.log' -Tail 50"
Write-Host "  Restart agent: Restart-Service -Name 'Wazuh'"
Write-Host "  Stop agent: Stop-Service -Name 'Wazuh'"
Write-Host ""
Write-Host "Agent configuration: C:\Program Files (x86)\ossec-agent\ossec.conf"
Write-Host "Agent logs: C:\Program Files (x86)\ossec-agent\ossec.log"
Write-Host ""

# Clean up installer
Remove-Item $installerPath -Force -ErrorAction SilentlyContinue

Write-Host "Installation complete!" -ForegroundColor Green
