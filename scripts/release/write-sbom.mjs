#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const output = resolve(process.argv[2] ?? 'artifacts/sbom.cdx.json');
const raw = execFileSync('pnpm', ['list', '--prod', '--json', '--depth', 'Infinity'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const trees = JSON.parse(raw);
const components = new Map();

function visit(name, dependency) {
  if (!dependency || typeof dependency !== 'object') return;
  const version = typeof dependency.version === 'string' ? dependency.version : 'unknown';
  const componentName = typeof dependency.name === 'string' ? dependency.name : name;
  if (componentName && version !== 'unknown') {
    const purl = `pkg:npm/${encodeURIComponent(componentName).replace('%40', '@')}@${encodeURIComponent(version)}`;
    components.set(purl, { type: 'library', name: componentName, version, purl });
  }
  const dependencies = dependency.dependencies;
  if (dependencies && typeof dependencies === 'object') {
    for (const [childName, child] of Object.entries(dependencies)) visit(childName, child);
  }
}

for (const tree of trees) {
  const dependencies = tree?.dependencies;
  if (dependencies && typeof dependencies === 'object') {
    for (const [name, dependency] of Object.entries(dependencies)) visit(name, dependency);
  }
}

const metadataName = process.env.npm_package_name ?? 'idlr-pts-platform';
const metadataVersion = process.env.npm_package_version ?? '0.0.0';
const bom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.5',
  serialNumber: `urn:uuid:release-${process.env.GITHUB_SHA ?? 'local'}`,
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    component: { type: 'application', name: metadataName, version: metadataVersion },
    tools: [{ vendor: 'IDLR', name: 'write-sbom.mjs', version: '1' }],
  },
  components: [...components.values()].sort((left, right) => left.purl.localeCompare(right.purl)),
};

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(bom, null, 2)}\n`, 'utf8');
console.log(`Wrote CycloneDX SBOM with ${bom.components.length} production components to ${output}`);
