import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { scanBase44AliasDependencies } from './source-scanner-aliases.mjs';

const TEXT_EXTENSIONS = new Set([
  '.js','.jsx','.mjs','.cjs','.ts','.tsx','.json','.html','.css','.md','.yml','.yaml','.env'
]);
const SUPPORTED_ENTITY_METHODS = new Set([
  'list','filter','get','create','update','delete','deleteMany','bulkCreate','importEntities',
  'updateMany','bulkUpdate','count','aggregate','upsert','subscribe'
]);
const SUPPORTED_AUTH_METHODS = new Set([
  'me','updateMe','isAuthenticated','register','verifyOtp','resendOtp','resetPasswordRequest',
  'resetPassword','loginViaEmailPassword','logout','redirectToLogin','loginWithProvider','setToken'
]);
const SUPPORTED_APP_METHODS = new Set(['getPublicSettings']);
const SUPPORTED_APP_LOG_METHODS = new Set(['logUserInApp']);

const sha = (value) => 'sha256:' + createHash('sha256').update(String(value)).digest('hex');
const sorted = (values) => [...new Set(values)].sort();

function walk(root) {
  const files = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules','.git','dist','build','.next','coverage'].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(full);
    }
  };
  visit(root);
  return files;
}

function classifyDependency(text) {
  return {
    sdk_import: /from\s+['"]@base44\/sdk['"]|require\(['"]@base44\/sdk['"]\)/.test(text),
    axios_helper_import: /@base44\/sdk\/dist\/utils\/axios-client/.test(text),
    base44_app_url: /https?:\/\/[^\s"'\x60]+\.base44\.app\b/i.test(text),
    base44_api_url: /https?:\/\/[^\s"'\x60]*base44[^\s"'\x60]*/i.test(text),
    base44_media_url: /https?:\/\/media\.base44\.[^\s"'\x60]*/i.test(text)
  };
}

export function scanBase44Source({ sourceDir } = {}) {
  if (!sourceDir) throw new Error('source_dir_required');
  const root = path.resolve(sourceDir);
  if (!fs.statSync(root).isDirectory()) throw new Error('source_dir_must_be_directory');
  const aliasScan = scanBase44AliasDependencies(root);

  const entities = [];
  const entityMethods = [];
  const functions = [];
  const authMethods = [];
  const appMethods = [];
  const appLogMethods = [];
  const integrationPairs = [];
  const crossAppFingerprints = [];
  const envKeys = [];
  const dependencyCounts = {
    sdk_import_files: 0,
    axios_helper_files: 0,
    hardcoded_base44_app_url_files: 0,
    hardcoded_base44_api_url_files: 0,
    hardcoded_base44_media_url_files: 0
  };
  let serviceRoleFiles = 0;
  let getConfigFiles = 0;

  const files = walk(root);
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const dep = classifyDependency(text);
    if (dep.sdk_import) dependencyCounts.sdk_import_files += 1;
    if (dep.axios_helper_import) dependencyCounts.axios_helper_files += 1;
    if (dep.base44_app_url) dependencyCounts.hardcoded_base44_app_url_files += 1;
    if (dep.base44_api_url) dependencyCounts.hardcoded_base44_api_url_files += 1;
    if (dep.base44_media_url) dependencyCounts.hardcoded_base44_media_url_files += 1;
    if (/\basServiceRole\b/.test(text)) serviceRoleFiles += 1;
    if (/\bbase44\.getConfig\s*\(/.test(text)) getConfigFiles += 1;

    for (const m of text.matchAll(/\bbase44(?:\.asServiceRole)?\.entities\.([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\s*\(/g)) {
      entities.push(m[1]);
      entityMethods.push(m[2]);
    }
    for (const m of text.matchAll(/\bbase44\.functions\.invoke\s*\(\s*['"]([^'"]+)['"]/g)) functions.push(m[1]);
    for (const m of text.matchAll(/\bbase44\.auth\.([A-Za-z_$][\w$]*)\s*\(/g)) authMethods.push(m[1]);
    for (const m of text.matchAll(/\bbase44\.app\.([A-Za-z_$][\w$]*)\s*\(/g)) appMethods.push(m[1]);
    for (const m of text.matchAll(/\bbase44\.appLogs\.([A-Za-z_$][\w$]*)\s*\(/g)) appLogMethods.push(m[1]);
    for (const m of text.matchAll(/\bbase44\.integrations\.([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\s*\(/g)) {
      integrationPairs.push(m[1] + '.' + m[2]);
    }

    for (const m of text.matchAll(/\bappId\s*:\s*['"]([a-f0-9]{24})['"]/gi)) {
      crossAppFingerprints.push(sha(m[1]));
    }
    for (const m of text.matchAll(/\b(?:process\.env\.|import\.meta\.env\.)([A-Z][A-Z0-9_]{2,})\b/g)) envKeys.push(m[1]);
  }

  const uniqueMethods = sorted(entityMethods.concat(aliasScan.entity_methods || []));
  const uniqueAuth = sorted(authMethods);
  const uniqueApp = sorted(appMethods);
  const uniqueAppLogs = sorted(appLogMethods);
  const unsupportedEntityMethods = uniqueMethods.filter((name) => !SUPPORTED_ENTITY_METHODS.has(name));
  const unsupportedAuthMethods = uniqueAuth.filter((name) => !SUPPORTED_AUTH_METHODS.has(name));
  const unsupportedAppMethods = uniqueApp.filter((name) => !SUPPORTED_APP_METHODS.has(name));
  const unsupportedAppLogMethods = uniqueAppLogs.filter((name) => !SUPPORTED_APP_LOG_METHODS.has(name));
  const hardcodedRoutes =
    dependencyCounts.hardcoded_base44_app_url_files +
    dependencyCounts.hardcoded_base44_api_url_files +
    dependencyCounts.hardcoded_base44_media_url_files;

  const blockers = [];
  if (unsupportedEntityMethods.length) blockers.push('unsupported_entity_method');
  if (unsupportedAuthMethods.length) blockers.push('unsupported_auth_method');
  if (unsupportedAppMethods.length) blockers.push('unsupported_app_method');
  if (unsupportedAppLogMethods.length) blockers.push('unsupported_app_log_method');
  if (hardcodedRoutes) blockers.push('hardcoded_base44_routes_require_repoint');
  if (serviceRoleFiles) blockers.push('service_role_permit_review_required');
  if ((aliasScan.custom_integration_operations || []).length) blockers.push('custom_integration_mapping_review_required');

  return {
    schema: 'evercraft.base44.source-scan.v1',
    files_scanned: files.length,
    source_path_emitted: false,
    source_root_fingerprint: sha(root),
    sdk: {
      import_files: dependencyCounts.sdk_import_files,
      axios_helper_files: dependencyCounts.axios_helper_files,
      get_config_files: getConfigFiles
    },
    entities: {
      names: sorted(entities.concat(aliasScan.entity_names || [])),
      methods: uniqueMethods,
      unsupported_methods: unsupportedEntityMethods
    },
    functions: {
      invoked: sorted(functions)
    },
    auth: {
      methods: uniqueAuth,
      unsupported_methods: unsupportedAuthMethods
    },
    app: {
      methods: uniqueApp,
      unsupported_methods: unsupportedAppMethods
    },
    app_logs: {
      methods: uniqueAppLogs,
      unsupported_methods: unsupportedAppLogMethods
    },
    integrations: {
      operations: sorted(integrationPairs),
      custom_operations: aliasScan.custom_integration_operations || []
    },
    aliases: {
      client_aliases: aliasScan.client_aliases || [],
      service_role_aliases: aliasScan.service_role_aliases || [],
      service_role_connector_providers: aliasScan.service_role_connector_providers || []
    },
    cross_app_clients: {
      count: sorted(crossAppFingerprints).length,
      app_id_fingerprints: sorted(crossAppFingerprints),
      raw_app_ids_emitted: false
    },
    environment: {
      keys: sorted(envKeys),
      values_emitted: false
    },
    dependencies: {
      ...dependencyCounts,
      service_role_files: serviceRoleFiles,
      service_role_alias_count: (aliasScan.service_role_aliases || []).length,
      custom_integration_operation_count: (aliasScan.custom_integration_operations || []).length,
      hardcoded_route_values_emitted: false
    },
    compatibility: {
      app_fabric_sdk_shape_supported:
        unsupportedEntityMethods.length === 0 &&
        unsupportedAuthMethods.length === 0 &&
        unsupportedAppMethods.length === 0 &&
        unsupportedAppLogMethods.length === 0,
      blockers,
      automatic_source_mutation_allowed: false,
      traffic_cutover_allowed: false
    }
  };
}

async function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--source');
  const sourceDir = i >= 0 ? args[i + 1] : '';
  console.log(JSON.stringify(scanBase44Source({ sourceDir }), null, 2));
}

if (import.meta.url === new URL('file://' + process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
