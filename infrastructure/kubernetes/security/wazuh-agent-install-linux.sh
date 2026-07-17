#!/bin/bash

# IDLR Security Infrastructure - Wazuh Agent Installation Script (Linux)
# This script installs and configures Wazuh agent on Linux servers

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "======================================"
echo "IDLR Security Infrastructure"
echo "Wazuh Agent Installation (Linux)"
echo "======================================"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Error: This script must be run as root${NC}"
    exit 1
fi

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    VER=$VERSION_ID
else
    echo -e "${RED}Error: Cannot detect OS${NC}"
    exit 1
fi

echo "Detected OS: $OS $VER"
echo ""

# Get Wazuh manager address
read -p "Enter Wazuh Manager address (e.g., wazuh-manager.security.svc.cluster.local or IP): " WAZUH_MANAGER
if [ -z "$WAZUH_MANAGER" ]; then
    echo -e "${RED}Error: Wazuh Manager address is required${NC}"
    exit 1
fi

# Get agent name
HOSTNAME=$(hostname)
read -p "Enter agent name (default: $HOSTNAME): " AGENT_NAME
AGENT_NAME=${AGENT_NAME:-$HOSTNAME}

# Get agent groups
read -p "Enter agent groups (comma-separated, default: idlr,production): " AGENT_GROUPS
AGENT_GROUPS=${AGENT_GROUPS:-idlr,production}

echo ""
echo "Configuration:"
echo "  Wazuh Manager: $WAZUH_MANAGER"
echo "  Agent Name: $AGENT_NAME"
echo "  Agent Groups: $AGENT_GROUPS"
echo ""

read -p "Proceed with installation? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Installation cancelled"
    exit 0
fi

echo ""
echo "Installing Wazuh agent..."
echo ""

# Install based on OS
case "$OS" in
    ubuntu|debian)
        echo "Installing for Ubuntu/Debian..."
        
        # Import GPG key
        curl -s https://packages.wazuh.com/key/GPG-KEY-WAZUH | gpg --no-default-keyring --keyring gnupg-ring:/usr/share/keyrings/wazuh.gpg --import && chmod 644 /usr/share/keyrings/wazuh.gpg
        
        # Add repository
        echo "deb [signed-by=/usr/share/keyrings/wazuh.gpg] https://packages.wazuh.com/4.x/apt/ stable main" | tee -a /etc/apt/sources.list.d/wazuh.list
        
        # Update and install
        apt-get update
        WAZUH_MANAGER="$WAZUH_MANAGER" WAZUH_AGENT_NAME="$AGENT_NAME" apt-get install -y wazuh-agent
        ;;
        
    centos|rhel|fedora)
        echo "Installing for CentOS/RHEL/Fedora..."
        
        # Import GPG key
        rpm --import https://packages.wazuh.com/key/GPG-KEY-WAZUH
        
        # Add repository
        cat > /etc/yum.repos.d/wazuh.repo << EOF
[wazuh]
gpgcheck=1
gpgkey=https://packages.wazuh.com/key/GPG-KEY-WAZUH
enabled=1
name=EL-\$releasever - Wazuh
baseurl=https://packages.wazuh.com/4.x/yum/
protect=1
EOF
        
        # Install
        WAZUH_MANAGER="$WAZUH_MANAGER" WAZUH_AGENT_NAME="$AGENT_NAME" yum install -y wazuh-agent
        ;;
        
    *)
        echo -e "${RED}Error: Unsupported OS: $OS${NC}"
        exit 1
        ;;
esac

echo -e "${GREEN}✓ Wazuh agent installed${NC}"
echo ""

# Configure agent
echo "Configuring Wazuh agent..."

# Backup original config
cp /var/ossec/etc/ossec.conf /var/ossec/etc/ossec.conf.backup

# Update ossec.conf
cat > /var/ossec/etc/ossec.conf << EOF
<ossec_config>
  <client>
    <server>
      <address>$WAZUH_MANAGER</address>
      <port>1514</port>
      <protocol>tcp</protocol>
    </server>
    <config-profile>$AGENT_GROUPS</config-profile>
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
    <directories check_all="yes">/etc,/usr/bin,/usr/sbin</directories>
    <directories check_all="yes">/bin,/sbin,/boot</directories>
    
    <!-- IDLR application directories -->
    <directories check_all="yes">/opt/idlr</directories>
    <directories check_all="yes">/var/www/idlr</directories>

    <!-- Ignore some directories -->
    <ignore>/etc/mtab</ignore>
    <ignore>/etc/hosts.deny</ignore>
    <ignore>/etc/mail/statistics</ignore>
    <ignore>/etc/random-seed</ignore>
    <ignore>/etc/random.seed</ignore>
    <ignore>/etc/adjtime</ignore>
    <ignore>/etc/httpd/logs</ignore>
    <ignore>/etc/utmpx</ignore>
    <ignore>/etc/wtmpx</ignore>
    <ignore>/etc/cups/certs</ignore>
    <ignore>/etc/dumpdates</ignore>
    <ignore>/etc/svc/volatile</ignore>

    <!-- Ignore temporary files -->
    <ignore type="sregex">.log$|.swp$</ignore>

    <!-- Check the file, but never compute the diff -->
    <nodiff>/etc/ssl/private.key</nodiff>

    <skip_nfs>yes</skip_nfs>
    <skip_dev>yes</skip_dev>
    <skip_proc>yes</skip_proc>
    <skip_sys>yes</skip_sys>

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
    <log_format>syslog</log_format>
    <location>/var/log/syslog</location>
  </localfile>

  <localfile>
    <log_format>syslog</log_format>
    <location>/var/log/auth.log</location>
  </localfile>

  <localfile>
    <log_format>syslog</log_format>
    <location>/var/log/kern.log</location>
  </localfile>

  <localfile>
    <log_format>apache</log_format>
    <location>/var/log/apache2/access.log</location>
  </localfile>

  <localfile>
    <log_format>apache</log_format>
    <location>/var/log/apache2/error.log</location>
  </localfile>

  <!-- IDLR application logs -->
  <localfile>
    <log_format>json</log_format>
    <location>/var/log/idlr/application.log</location>
  </localfile>

  <localfile>
    <log_format>json</log_format>
    <location>/var/log/idlr/security.log</location>
  </localfile>

  <!-- Active response -->
  <active-response>
    <disabled>no</disabled>
    <ca_store>/var/ossec/etc/wpk_root.pem</ca_store>
    <ca_verification>yes</ca_verification>
  </active-response>

  <!-- Labels for agent -->
  <labels>
    <label key="environment">production</label>
    <label key="platform">idlr</label>
    <label key="hostname">$AGENT_NAME</label>
  </labels>

</ossec_config>
EOF

echo -e "${GREEN}✓ Wazuh agent configured${NC}"
echo ""

# Enable and start agent
echo "Starting Wazuh agent..."

systemctl daemon-reload
systemctl enable wazuh-agent
systemctl start wazuh-agent

# Wait for agent to start
sleep 3

# Check status
if systemctl is-active --quiet wazuh-agent; then
    echo -e "${GREEN}✓ Wazuh agent is running${NC}"
else
    echo -e "${RED}✗ Wazuh agent failed to start${NC}"
    echo "Check logs: journalctl -u wazuh-agent -n 50"
    exit 1
fi

echo ""

# Get agent ID
AGENT_ID=$(cat /var/ossec/etc/client.keys 2>/dev/null | cut -d' ' -f1 || echo "Not registered")

echo "======================================"
echo "Installation Complete!"
echo "======================================"
echo ""
echo "Agent Information:"
echo "  Name: $AGENT_NAME"
echo "  ID: $AGENT_ID"
echo "  Manager: $WAZUH_MANAGER"
echo "  Groups: $AGENT_GROUPS"
echo "  Status: Running"
echo ""

if [ "$AGENT_ID" = "Not registered" ]; then
    echo -e "${YELLOW}⚠ Agent is not yet registered with the manager${NC}"
    echo ""
    echo "The agent will automatically register when it connects to the manager."
    echo "If registration fails, you may need to manually register the agent:"
    echo ""
    echo "On the Wazuh manager, run:"
    echo "  /var/ossec/bin/manage_agents -a $AGENT_NAME"
    echo ""
    echo "Then copy the generated key and import it on this agent:"
    echo "  /var/ossec/bin/manage_agents -i <key>"
    echo "  systemctl restart wazuh-agent"
fi

echo ""
echo "Useful commands:"
echo "  Check agent status: systemctl status wazuh-agent"
echo "  View agent logs: tail -f /var/ossec/logs/ossec.log"
echo "  Restart agent: systemctl restart wazuh-agent"
echo "  Stop agent: systemctl stop wazuh-agent"
echo ""
echo "Agent configuration: /var/ossec/etc/ossec.conf"
echo "Agent logs: /var/ossec/logs/"
echo ""
