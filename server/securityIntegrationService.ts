import axios from 'axios';

// Environment variables for security service endpoints
const OPENCTI_URL = process.env.OPENCTI_URL || 'http://opencti:8080';
const OPENCTI_TOKEN = process.env.OPENCTI_TOKEN || '';
const WAZUH_URL = process.env.WAZUH_URL || 'http://wazuh:55000';
const WAZUH_USER = process.env.WAZUH_USER || 'admin';
const WAZUH_PASSWORD = process.env.WAZUH_PASSWORD || '';
const OPA_URL = process.env.OPA_URL || 'http://opa:8181';
const KUBECOST_URL = process.env.KUBECOST_URL || 'http://kubecost:9090';

/**
 * OpenCTI Threat Intelligence Integration
 */
export async function getOpenCTIThreats() {
  try {
    const response = await axios.post(
      `${OPENCTI_URL}/graphql`,
      {
        query: `
          query {
            threats(first: 10, orderBy: created_at, orderMode: desc) {
              edges {
                node {
                  id
                  name
                  description
                  threat_actor_types
                  confidence
                  created_at
                  labels {
                    edges {
                      node {
                        value
                      }
                    }
                  }
                }
              }
            }
          }
        `
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENCTI_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.data.threats.edges.map((edge: any) => ({
      id: edge.node.id,
      name: edge.node.name,
      description: edge.node.description,
      type: edge.node.threat_actor_types?.[0] || 'unknown',
      confidence: edge.node.confidence,
      createdAt: edge.node.created_at,
      labels: edge.node.labels.edges.map((l: any) => l.node.value)
    }));
  } catch (error) {
    console.error('OpenCTI API error:', error);
    // Return mock data if service unavailable
    return getMockThreats();
  }
}

export async function getOpenCTIIndicators() {
  try {
    const response = await axios.post(
      `${OPENCTI_URL}/graphql`,
      {
        query: `
          query {
            indicators(first: 20, orderBy: created_at, orderMode: desc) {
              edges {
                node {
                  id
                  name
                  pattern
                  pattern_type
                  valid_from
                  valid_until
                  confidence
                }
              }
            }
          }
        `
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENCTI_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.data.indicators.edges.map((edge: any) => ({
      id: edge.node.id,
      name: edge.node.name,
      pattern: edge.node.pattern,
      type: edge.node.pattern_type,
      validFrom: edge.node.valid_from,
      validUntil: edge.node.valid_until,
      confidence: edge.node.confidence
    }));
  } catch (error) {
    console.error('OpenCTI Indicators API error:', error);
    return getMockIndicators();
  }
}

/**
 * Wazuh SIEM Integration
 */
export async function getWazuhAlerts(timeRange: string = '24h') {
  try {
    // Get Wazuh authentication token
    const authResponse = await axios.post(
      `${WAZUH_URL}/security/user/authenticate`,
      {},
      {
        auth: {
          username: WAZUH_USER,
          password: WAZUH_PASSWORD
        }
      }
    );

    const token = authResponse.data.data.token;

    // Get alerts
    const alertsResponse = await axios.get(
      `${WAZUH_URL}/security/alerts`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        params: {
          time_range: timeRange,
          limit: 100
        }
      }
    );

    return alertsResponse.data.data.affected_items.map((alert: any) => ({
      id: alert.id,
      timestamp: alert.timestamp,
      rule: {
        id: alert.rule.id,
        level: alert.rule.level,
        description: alert.rule.description,
        groups: alert.rule.groups
      },
      agent: {
        id: alert.agent.id,
        name: alert.agent.name,
        ip: alert.agent.ip
      },
      location: alert.location,
      data: alert.data
    }));
  } catch (error) {
    console.error('Wazuh API error:', error);
    return getMockWazuhAlerts();
  }
}

export async function getWazuhAgentStatus() {
  try {
    const authResponse = await axios.post(
      `${WAZUH_URL}/security/user/authenticate`,
      {},
      {
        auth: {
          username: WAZUH_USER,
          password: WAZUH_PASSWORD
        }
      }
    );

    const token = authResponse.data.data.token;

    const agentsResponse = await axios.get(
      `${WAZUH_URL}/agents`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    const agents = agentsResponse.data.data.affected_items;
    
    return {
      total: agents.length,
      active: agents.filter((a: any) => a.status === 'active').length,
      disconnected: agents.filter((a: any) => a.status === 'disconnected').length,
      never_connected: agents.filter((a: any) => a.status === 'never_connected').length
    };
  } catch (error) {
    console.error('Wazuh Agent Status API error:', error);
    return { total: 0, active: 0, disconnected: 0, never_connected: 0 };
  }
}

/**
 * Open Policy Agent (OPA) Integration
 */
export async function getOPAPolicyViolations() {
  try {
    const response = await axios.post(
      `${OPA_URL}/v1/data/violations/list`,
      {}
    );

    return response.data.result.map((violation: any) => ({
      id: violation.id,
      policy: violation.policy,
      resource: violation.resource,
      action: violation.action,
      user: violation.user,
      timestamp: violation.timestamp,
      severity: violation.severity,
      message: violation.message
    }));
  } catch (error) {
    console.error('OPA API error:', error);
    return getMockOPAViolations();
  }
}

export async function getOPAPolicyStats() {
  try {
    const response = await axios.get(
      `${OPA_URL}/v1/data/stats`
    );

    return {
      totalPolicies: response.data.result.total_policies,
      activePolicies: response.data.result.active_policies,
      totalDecisions: response.data.result.total_decisions,
      allowedDecisions: response.data.result.allowed_decisions,
      deniedDecisions: response.data.result.denied_decisions
    };
  } catch (error) {
    console.error('OPA Stats API error:', error);
    return { totalPolicies: 0, activePolicies: 0, totalDecisions: 0, allowedDecisions: 0, deniedDecisions: 0 };
  }
}

/**
 * Kubecost Integration
 */
export async function getKubecostCostData(window: string = '7d') {
  try {
    const response = await axios.get(
      `${KUBECOST_URL}/model/allocation`,
      {
        params: {
          window,
          aggregate: 'namespace'
        }
      }
    );

    return response.data.data.map((item: any) => ({
      namespace: item.name,
      cpuCost: item.cpuCost,
      memoryCost: item.memoryCost,
      pvCost: item.pvCost,
      networkCost: item.networkCost,
      totalCost: item.totalCost,
      cpuCoreHours: item.cpuCoreHours,
      ramByteHours: item.ramByteHours
    }));
  } catch (error) {
    console.error('Kubecost API error:', error);
    return getMockKubecostData();
  }
}

export async function getKubecostAnomalies() {
  try {
    const response = await axios.get(
      `${KUBECOST_URL}/model/costAnomalies`
    );

    return response.data.data.map((anomaly: any) => ({
      id: anomaly.id,
      namespace: anomaly.namespace,
      resource: anomaly.resource,
      anomalyType: anomaly.type,
      expectedCost: anomaly.expectedCost,
      actualCost: anomaly.actualCost,
      deviation: anomaly.deviation,
      timestamp: anomaly.timestamp
    }));
  } catch (error) {
    console.error('Kubecost Anomalies API error:', error);
    return getMockKubecostAnomalies();
  }
}

/**
 * Mock data fallbacks when services are unavailable
 */
function getMockThreats() {
  return [
    {
      id: '1',
      name: 'APT29 (Cozy Bear)',
      description: 'Russian state-sponsored threat actor targeting government and critical infrastructure',
      type: 'nation-state',
      confidence: 85,
      createdAt: new Date().toISOString(),
      labels: ['russia', 'apt', 'espionage']
    },
    {
      id: '2',
      name: 'Ransomware Campaign',
      description: 'Active ransomware campaign targeting financial institutions',
      type: 'cybercrime',
      confidence: 75,
      createdAt: new Date().toISOString(),
      labels: ['ransomware', 'financial']
    }
  ];
}

function getMockIndicators() {
  return [
    {
      id: '1',
      name: 'Malicious IP',
      pattern: '[ipv4-addr:value = \'192.0.2.1\']',
      type: 'ipv4-addr',
      validFrom: new Date().toISOString(),
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      confidence: 90
    }
  ];
}

function getMockWazuhAlerts() {
  return [
    {
      id: '1',
      timestamp: new Date().toISOString(),
      rule: {
        id: '5710',
        level: 5,
        description: 'Multiple authentication failures',
        groups: ['authentication_failed', 'authentication']
      },
      agent: {
        id: '001',
        name: 'web-server-01',
        ip: '10.0.1.10'
      },
      location: '/var/log/auth.log',
      data: {}
    }
  ];
}

function getMockOPAViolations() {
  return [
    {
      id: '1',
      policy: 'rbac_policy',
      resource: '/api/admin/users',
      action: 'DELETE',
      user: 'user@example.com',
      timestamp: new Date().toISOString(),
      severity: 'high',
      message: 'User attempted to delete admin user without sufficient privileges'
    }
  ];
}

function getMockKubecostData() {
  return [
    {
      namespace: 'production',
      cpuCost: 125.50,
      memoryCost: 89.30,
      pvCost: 45.20,
      networkCost: 12.10,
      totalCost: 272.10,
      cpuCoreHours: 1680,
      ramByteHours: 134217728000
    }
  ];
}

function getMockKubecostAnomalies() {
  return [
    {
      id: '1',
      namespace: 'production',
      resource: 'deployment/api-server',
      anomalyType: 'cost_spike',
      expectedCost: 50.00,
      actualCost: 125.00,
      deviation: 150,
      timestamp: new Date().toISOString()
    }
  ];
}
