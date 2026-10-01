import fs from 'node:fs';
import path from 'node:path';

const TEXT_EXTENSIONS=new Set([
  '.js','.jsx','.mjs','.cjs','.ts','.tsx','.json','.html','.css','.md','.yml','.yaml','.env'
]);
const sorted=(values)=>[...new Set(values)].sort();
const esc=(value)=>String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

function walk(root){
  const files=[];
  const visit=(dir)=>{
    for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
      if(['node_modules','.git','dist','build','.next','coverage'].includes(entry.name)) continue;
      const full=path.join(dir,entry.name);
      if(entry.isDirectory()) visit(full);
      else if(entry.isFile()&&TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(full);
    }
  };
  visit(root);
  return files;
}

export function scanBase44AliasDependencies(sourceDir){
  const root=path.resolve(sourceDir);
  const clientAliases=[];
  const serviceRoleAliases=[];
  const entities=[];
  const entityMethods=[];
  const serviceRoleConnectorProviders=[];
  const customIntegrationOperations=[];

  for(const file of walk(root)){
    const text=fs.readFileSync(file,'utf8');
    const fileClients=new Set(['base44']);

    for(const m of text.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)(?:\s*:\s*[^=;]+)?\s*=\s*createClient(?:FromRequest)?\s*\(/g)){
      fileClients.add(m[1]);
      clientAliases.push(m[1]);
    }

    const fileServiceRoles=new Set();
    for(const m of text.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)(?:\s*:\s*[^=;]+)?\s*=\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\.asServiceRole\b/g)){
      const alias=m[1];
      const owner=m[2];
      const rootName=owner.split('.')[0];
      if(fileClients.has(rootName)||owner==='base44'||owner.endsWith('.base44')){
        fileServiceRoles.add(alias);
        serviceRoleAliases.push(alias);
      }
    }

    for(const alias of fileClients){
      const a=esc(alias);
      for(const m of text.matchAll(new RegExp('\\b'+a+'(?:\\.asServiceRole)?\\.entities\\.([A-Za-z_$][\\w$]*)\\.([A-Za-z_$][\\w$]*)\\s*\\(','g'))){
        entities.push(m[1]);
        entityMethods.push(m[2]);
      }
      for(const m of text.matchAll(new RegExp('\\b'+a+'\\.asServiceRole\\.connectors\\.getConnection\\s*\\(\\s*[\'"]([^\'"]+)[\'"]','g'))){
        serviceRoleConnectorProviders.push(m[1]);
      }
      for(const m of text.matchAll(new RegExp('\\b'+a+'\\.integrations\\.custom\\.call\\s*\\(\\s*[\'"]([^\'"]+)[\'"]\\s*,\\s*[\'"]([^\'"]+)[\'"]','g'))){
        customIntegrationOperations.push(m[1]+' :: '+m[2]);
      }
    }

    for(const alias of fileServiceRoles){
      const a=esc(alias);
      for(const m of text.matchAll(new RegExp('\\b'+a+'\\.entities\\.([A-Za-z_$][\\w$]*)\\.([A-Za-z_$][\\w$]*)\\s*\\(','g'))){
        entities.push(m[1]);
        entityMethods.push(m[2]);
      }
      for(const m of text.matchAll(new RegExp('\\b'+a+'\\.connectors\\.getConnection\\s*\\(\\s*[\'"]([^\'"]+)[\'"]','g'))){
        serviceRoleConnectorProviders.push(m[1]);
      }
    }
  }

  return {
    client_aliases:sorted(clientAliases),
    service_role_aliases:sorted(serviceRoleAliases),
    entity_names:sorted(entities),
    entity_methods:sorted(entityMethods),
    service_role_connector_providers:sorted(serviceRoleConnectorProviders),
    custom_integration_operations:sorted(customIntegrationOperations)
  };
}
