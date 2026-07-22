import axios from 'axios';

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be configured for this security integration`);
  return value;
}

function integrationFailure(service: string, error: unknown): never {
  const detail = error instanceof Error ? error.message : String(error);
  throw new Error(`${service} integration is unavailable: ${detail}`);
}

function openCtiConfig() {
  return { url: requiredEnv('OPENCTI_URL'), token: requiredEnv('OPENCTI_TOKEN') };
}

async function wazuhToken() {
  const url = requiredEnv('WAZUH_URL');
  const username = requiredEnv('WAZUH_USER');
  const password = requiredEnv('WAZUH_PASSWORD');
  const authResponse = await axios.post(
    `${url}/security/user/authenticate`,
    {},
    { auth: { username, password }, timeout: 10_000 },
  );
  const token = authResponse.data?.data?.token;
  if (!token || typeof token !== 'string') throw new Error('Wazuh authentication returned no token');
  return { url, token };
}

/** Retrieve live OpenCTI threat intelligence. */
export async function getOpenCTIThreats() {
  try {
    const { url, token } = openCtiConfig();
    const response = await axios.post(`${url}/graphql`, {
      query: `query { threats(first: 10, orderBy: created_at, orderMode: desc) { edges { node { id name description threat_actor_types confidence created_at labels { edges { node { value } } } } } } }`,
    }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 10_000 });
    const edges = response.data?.data?.threats?.edges;
    if (!Array.isArray(edges)) throw new Error('OpenCTI response lacks threat edges');
    return edges.map((edge: any) => ({
      id: edge.node.id,
      name: edge.node.name,
      description: edge.node.description,
      type: edge.node.threat_actor_types?.[0] ?? 'unknown',
      confidence: edge.node.confidence,
      createdAt: edge.node.created_at,
      labels: Array.isArray(edge.node.labels?.edges) ? edge.node.labels.edges.map((label: any) => label.node.value) : [],
    }));
  } catch (error) {
    return integrationFailure('OpenCTI', error);
  }
}

/** Retrieve live OpenCTI indicators. */
export async function getOpenCTIIndicators() {
  try {
    const { url, token } = openCtiConfig();
    const response = await axios.post(`${url}/graphql`, {
      query: `query { indicators(first: 20, orderBy: created_at, orderMode: desc) { edges { node { id name pattern pattern_type valid_from valid_until confidence } } } }`,
    }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 10_000 });
    const edges = response.data?.data?.indicators?.edges;
    if (!Array.isArray(edges)) throw new Error('OpenCTI response lacks indicator edges');
    return edges.map((edge: any) => ({
      id: edge.node.id,
      name: edge.node.name,
      pattern: edge.node.pattern,
      type: edge.node.pattern_type,
      validFrom: edge.node.valid_from,
      validUntil: edge.node.valid_until,
      confidence: edge.node.confidence,
    }));
  } catch (error) {
    return integrationFailure('OpenCTI indicators', error);
  }
}

/** Retrieve live Wazuh alerts. */
export async function getWazuhAlerts(timeRange: string = '24h') {
  try {
    const { url, token } = await wazuhToken();
    const response = await axios.get(`${url}/security/alerts`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { time_range: timeRange, limit: 100 },
      timeout: 10_000,
    });
    const alerts = response.data?.data?.affected_items;
    if (!Array.isArray(alerts)) throw new Error('Wazuh response lacks alert items');
    return alerts.map((alert: any) => ({
      id: alert.id,
      timestamp: alert.timestamp,
      rule: { id: alert.rule.id, level: alert.rule.level, description: alert.rule.description, groups: alert.rule.groups },
      agent: { id: alert.agent.id, name: alert.agent.name, ip: alert.agent.ip },
      location: alert.location,
      data: alert.data,
    }));
  } catch (error) {
    return integrationFailure('Wazuh alerts', error);
  }
}

/** Retrieve live Wazuh agent status. */
export async function getWazuhAgentStatus() {
  try {
    const { url, token } = await wazuhToken();
    const response = await axios.get(`${url}/agents`, { headers: { Authorization: `Bearer ${token}` }, timeout: 10_000 });
    const agents = response.data?.data?.affected_items;
    if (!Array.isArray(agents)) throw new Error('Wazuh response lacks agent items');
    return {
      total: agents.length,
      active: agents.filter((agent: any) => agent.status === 'active').length,
      disconnected: agents.filter((agent: any) => agent.status === 'disconnected').length,
      never_connected: agents.filter((agent: any) => agent.status === 'never_connected').length,
    };
  } catch (error) {
    return integrationFailure('Wazuh agent status', error);
  }
}

/** Retrieve live OPA violations. */
export async function getOPAPolicyViolations() {
  try {
    const response = await axios.post(`${requiredEnv('OPA_URL')}/v1/data/violations/list`, {}, { timeout: 10_000 });
    const violations = response.data?.result;
    if (!Array.isArray(violations)) throw new Error('OPA response lacks violations');
    return violations.map((violation: any) => ({
      id: violation.id,
      policy: violation.policy,
      resource: violation.resource,
      action: violation.action,
      user: violation.user,
      timestamp: violation.timestamp,
      severity: violation.severity,
      message: violation.message,
    }));
  } catch (error) {
    return integrationFailure('OPA violations', error);
  }
}

/** Retrieve live OPA decision statistics. */
export async function getOPAPolicyStats() {
  try {
    const response = await axios.get(`${requiredEnv('OPA_URL')}/v1/data/stats`, { timeout: 10_000 });
    const result = response.data?.result;
    if (!result || typeof result !== 'object') throw new Error('OPA response lacks policy statistics');
    return {
      totalPolicies: result.total_policies,
      activePolicies: result.active_policies,
      totalDecisions: result.total_decisions,
      allowedDecisions: result.allowed_decisions,
      deniedDecisions: result.denied_decisions,
    };
  } catch (error) {
    return integrationFailure('OPA policy statistics', error);
  }
}

/** Retrieve live Kubecost allocation data. */
export async function getKubecostCostData(window: string = '7d') {
  try {
    const response = await axios.get(`${requiredEnv('KUBECOST_URL')}/model/allocation`, {
      params: { window, aggregate: 'namespace' }, timeout: 10_000,
    });
    const data = response.data?.data;
    if (!Array.isArray(data)) throw new Error('Kubecost response lacks allocation data');
    return data.map((item: any) => ({
      namespace: item.name,
      cpuCost: item.cpuCost,
      memoryCost: item.memoryCost,
      pvCost: item.pvCost,
      networkCost: item.networkCost,
      totalCost: item.totalCost,
      cpuCoreHours: item.cpuCoreHours,
      ramByteHours: item.ramByteHours,
    }));
  } catch (error) {
    return integrationFailure('Kubecost allocation', error);
  }
}

/** Retrieve live Kubecost anomalies. */
export async function getKubecostAnomalies() {
  try {
    const response = await axios.get(`${requiredEnv('KUBECOST_URL')}/model/costAnomalies`, { timeout: 10_000 });
    const anomalies = response.data?.data;
    if (!Array.isArray(anomalies)) throw new Error('Kubecost response lacks anomaly data');
    return anomalies.map((anomaly: any) => ({
      id: anomaly.id,
      namespace: anomaly.namespace,
      resource: anomaly.resource,
      anomalyType: anomaly.type,
      expectedCost: anomaly.expectedCost,
      actualCost: anomaly.actualCost,
      deviation: anomaly.deviation,
      timestamp: anomaly.timestamp,
    }));
  } catch (error) {
    return integrationFailure('Kubecost anomalies', error);
  }
}
