import fs from 'node:fs';
import tls from 'node:tls';
import { X509Certificate } from 'node:crypto';

function normalizeDomain(value){
  const domain=String(value||'').trim().toLowerCase().replace(/^\.+|\.+$/g,'');
  if(!domain||!/^[a-z0-9.-]+$/.test(domain)||domain.includes('..')){
    throw new Error('public_edge_base_domain_invalid');
  }
  return domain;
}

export function inspectPublicEdgeTls({
  baseDomain,
  tlsKeyPath,
  tlsCertPath,
  minValidityMs=72*60*60*1000,
  now=Date.now(),
}={}){
  const domain=normalizeDomain(baseDomain);
  const keyPath=String(tlsKeyPath||'').trim();
  const certPath=String(tlsCertPath||'').trim();
  if(!keyPath||!certPath) throw new Error('public_edge_tls_material_required');
  if(!fs.existsSync(keyPath)) throw new Error('public_edge_tls_key_missing');
  if(!fs.existsSync(certPath)) throw new Error('public_edge_tls_cert_missing');

  const key=fs.readFileSync(keyPath);
  const cert=fs.readFileSync(certPath);

  try{
    tls.createSecureContext({key,cert});
  }catch(error){
    throw new Error('public_edge_tls_key_cert_mismatch_or_invalid: '+String(error?.message||error));
  }

  let x509;
  try{
    x509=new X509Certificate(cert);
  }catch(error){
    throw new Error('public_edge_tls_certificate_invalid: '+String(error?.message||error));
  }

  const validFromMs=Date.parse(x509.validFrom);
  const validToMs=Date.parse(x509.validTo);
  if(!Number.isFinite(validFromMs)||!Number.isFinite(validToMs)){
    throw new Error('public_edge_tls_validity_unreadable');
  }
  if(validFromMs>now) throw new Error('public_edge_tls_not_yet_valid');
  if(validToMs<=now) throw new Error('public_edge_tls_expired');
  if(validToMs-now<Math.max(0,Number(minValidityMs||0))){
    throw new Error('public_edge_tls_validity_window_too_short');
  }

  const probeHost=`route-probe.${domain}`;
  const matched=x509.checkHost(probeHost,{subject:'default'});
  if(!matched){
    throw new Error('public_edge_tls_certificate_does_not_cover_wildcard_domain');
  }

  return {
    schema:'evercraft.public-edge.tls-admission.v1',
    ready:true,
    base_domain:domain,
    probe_hostname:probeHost,
    certificate_subject:x509.subject,
    certificate_issuer:x509.issuer,
    certificate_fingerprint256:x509.fingerprint256||null,
    certificate_valid_from:new Date(validFromMs).toISOString(),
    certificate_valid_to:new Date(validToMs).toISOString(),
    certificate_days_remaining:Number(((validToMs-now)/86400000).toFixed(2)),
    hostname_match:matched,
    private_key_exposed:false,
    certificate_bytes_exposed:false,
  };
}

export function validatePublicEdgeAdmission({
  mode='proof_loopback',
  baseDomain='',
  tlsKeyPath='',
  tlsCertPath='',
  controlHost='127.0.0.1',
  controlToken='',
  publicPort=443,
  minValidityMs=72*60*60*1000,
}={}){
  const normalizedMode=String(mode||'');
  if(!['proof_loopback','wildcard_https'].includes(normalizedMode)){
    throw new Error('public_edge_mode_invalid');
  }
  const control=String(controlHost||'127.0.0.1').toLowerCase();
  const loopback=['127.0.0.1','localhost','::1','[::1]'].includes(control);
  if(!loopback&&!String(controlToken||'')){
    throw new Error('public_edge_control_token_required_for_nonloopback_control');
  }

  if(normalizedMode==='proof_loopback'){
    return {
      schema:'evercraft.public-edge.admission.v1',
      ready:true,
      mode:normalizedMode,
      public_https:false,
      proof_only:true,
      founder_login_required:false,
      tls:null,
    };
  }

  const port=Number(publicPort);
  if(!Number.isInteger(port)||port<1||port>65535){
    throw new Error('public_edge_public_port_invalid');
  }
  const tlsAdmission=inspectPublicEdgeTls({
    baseDomain,
    tlsKeyPath,
    tlsCertPath,
    minValidityMs,
  });
  return {
    schema:'evercraft.public-edge.admission.v1',
    ready:true,
    mode:normalizedMode,
    public_https:true,
    proof_only:false,
    founder_login_required:false,
    public_port:port,
    tls:tlsAdmission,
  };
}
