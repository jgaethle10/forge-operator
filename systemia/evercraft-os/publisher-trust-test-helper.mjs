import { generateKeyPairSync } from "node:crypto";
import {
  buildPublisherTrustEpochBody,
  signPublisherTrustEpoch,
  EvercraftOsPublisherTrustEpochStore,
} from "./publisher-trust-epoch.mjs";
import { EvercraftOsPublisherRootRegistry } from "./publisher-root-registry.mjs";

export function createTestAnchoredTrustProvider({ stateDir, trustStore, rootKeyId = "test-root-1" } = {}) {
  const root = generateKeyPairSync("ed25519");
  const publicKeyPem = root.publicKey.export({ type: "spki", format: "pem" });
  const privateKeyPem = root.privateKey.export({ type: "pkcs8", format: "pem" });
  const rootRegistry = new EvercraftOsPublisherRootRegistry({
    stateDir: stateDir + "-roots",
    bootstrapRootKeys: [{ key_id: rootKeyId, public_key_pem: publicKeyPem }],
    bootstrapSigningRootId: rootKeyId,
  });
  const provider = new EvercraftOsPublisherTrustEpochStore({
    stateDir,
    rootRegistry,
  });
  const body = buildPublisherTrustEpochBody({
    epoch: 1,
    previousEpochHash: null,
    trustStore,
    rootKeyId,
    issuedAt: new Date("2026-10-10T00:00:00Z"),
  });
  const signed = signPublisherTrustEpoch({ body, privateKeyPem });
  const accepted = provider.accept(signed);
  if (accepted.state !== "accepted") throw new Error("test_anchored_trust_accept_failed:" + (accepted.reason || accepted.state));
  return { provider, rootRegistry, rootPublicKeyPem: publicKeyPem, rootPrivateKeyPem: privateKeyPem, rootKeyId, accepted };
}
