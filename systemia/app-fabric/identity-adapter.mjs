import { EvercraftIdentity, IdentityRateLimiter } from '../identity/identity.mjs';
import { verifyEvercraftSession } from '../evercraft-home/identity.mjs';

function required(value, field) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(field + '_required');
  return text;
}

function publicSubject(subject) {
  if (!subject) return null;
  return {
    id: subject.subject_ref,
    subject_ref: subject.subject_ref,
    login: subject.login,
    email: String(subject.login || '').includes('@') ? subject.login : null,
    display_name: subject.display_name,
    status: subject.status,
    created_at: subject.created_at,
    updated_at: subject.updated_at
  };
}

function remoteKey(request, login) {
  const forwarded = String(request?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  const remote = forwarded || request?.socket?.remoteAddress || 'unknown';
  return String(login || 'unknown').toLowerCase() + '@' + remote;
}

async function valueOf(provider, field) {
  if (typeof provider !== 'function') throw new Error(field + '_provider_required');
  return await provider();
}

export function createAppFabricIdentityAdapter({
  identity,
  signingKeyProvider,
  keyringProvider,
  rateLimiter = new IdentityRateLimiter(),
  registrationBroker = null,
  passwordRecoveryBroker = null,
  providerLogin = null,
  publicSettingsProvider = null,
  defaultSessionTtlSeconds = 1800
} = {}) {
  if (!(identity instanceof EvercraftIdentity)) throw new Error('evercraft_identity_required');

  const identityResolver = async ({ token }) => {
    const raw = String(token || '').trim();
    if (!raw) return null;
    const keyring = await valueOf(keyringProvider, 'identity_keyring');
    const session = verifyEvercraftSession(raw, keyring);
    identity.assertSessionActive(session);
    const subject = identity.getSubject(session.subject_ref);
    if (!subject || subject.status !== 'active') throw new Error('identity_subject_inactive');
    return {
      ...session,
      subject_ref: subject.subject_ref,
      display_name: subject.display_name,
      login: subject.login,
      subject: publicSubject(subject)
    };
  };

  const authHandlers = {
    publicSettings: async ({ appKey, request }) => {
      if (typeof publicSettingsProvider === 'function') {
        return await publicSettingsProvider({ appKey, request });
      }
      return {
        id: appKey,
        public_settings: {
          auth_provider: 'evercraft-identity',
          session_transport: 'bearer',
          registration_supported: Boolean(registrationBroker),
          password_recovery_supported: Boolean(passwordRecoveryBroker)
        }
      };
    },

    me: async ({ subjectRef }) => {
      const subject = identity.getSubject(subjectRef);
      if (!subject || subject.status !== 'active') throw new Error('subject_not_found');
      return publicSubject(subject);
    },

    updateMe: async ({ subjectRef, identity: resolvedIdentity, body }) => {
      const allowedKeys = new Set(['display_name', 'displayName']);
      const supplied = Object.keys(body || {});
      const unsupported = supplied.filter((key) => !allowedKeys.has(key));
      if (unsupported.length) throw new Error('identity_profile_field_unsupported');
      const displayName = body?.display_name ?? body?.displayName;
      const result = identity.updateProfile({
        subjectRef,
        displayName,
        authorityState: 'authenticated_self',
        authorityReceiptRef: 'session:' + required(resolvedIdentity?.session_id, 'session_id'),
        actorRef: subjectRef
      });
      return result.subject;
    },

    login: async ({ body, request }) => {
      const login = required(body?.login || body?.email, 'login').toLowerCase();
      const limiterKey = remoteKey(request, login);
      rateLimiter.assertAllowed(limiterKey);
      let authentication;
      try {
        authentication = identity.authenticatePassword({ login, password: body?.password });
      } catch (error) {
        rateLimiter.recordFailure(limiterKey);
        throw error;
      }
      rateLimiter.recordSuccess(limiterKey);

      const key = await valueOf(signingKeyProvider, 'identity_signing_key');
      const secret = required(key?.secret, 'signing_secret');
      const keyId = required(key?.keyId || key?.key_id || 'primary', 'signing_key_id');
      const ttlSeconds = Number(key?.ttlSeconds || key?.ttl_seconds || defaultSessionTtlSeconds);
      const issued = identity.issueSession(authentication, {
        signingSecret: secret,
        signingKeyId: keyId,
        ttlSeconds
      });
      const subject = identity.getSubject(authentication.subject_ref);
      return {
        access_token: issued.token,
        token: issued.token,
        token_type: 'Bearer',
        expires_at: issued.session.expires_at,
        user: publicSubject(subject),
        receipt_hash: issued.receipt.receipt_hash
      };
    },

    logout: async ({ identity: resolvedIdentity }) => {
      if (!resolvedIdentity?.session_id || !resolvedIdentity?.subject_ref) return { logged_out: true };
      const result = identity.revokeSession({
        sessionId: resolvedIdentity.session_id,
        subjectRef: resolvedIdentity.subject_ref,
        reason: 'app_fabric_logout'
      });
      return {
        logged_out: true,
        session_id: result.session_id,
        receipt_hash: result.receipt.receipt_hash
      };
    },

    register: async ({ appKey, body, request }) => {
      if (!registrationBroker || typeof registrationBroker.beginRegistration !== 'function') {
        throw new Error('auth_registration_delivery_not_configured');
      }
      return await registrationBroker.beginRegistration({ appKey, body: body || {}, request });
    },

    verifyOtp: async ({ appKey, body, request }) => {
      if (!registrationBroker || typeof registrationBroker.verifyRegistration !== 'function') {
        throw new Error('auth_registration_verification_not_configured');
      }
      return await registrationBroker.verifyRegistration({ appKey, body: body || {}, request });
    },

    resendOtp: async ({ appKey, body, request }) => {
      if (!registrationBroker || typeof registrationBroker.resendRegistration !== 'function') {
        throw new Error('auth_registration_resend_not_configured');
      }
      return await registrationBroker.resendRegistration({ appKey, body: body || {}, request });
    },

    resetPasswordRequest: async ({ appKey, body, request }) => {
      if (!passwordRecoveryBroker || typeof passwordRecoveryBroker.beginReset !== 'function') {
        throw new Error('auth_password_recovery_not_configured');
      }
      return await passwordRecoveryBroker.beginReset({ appKey, body: body || {}, request });
    },

    resetPassword: async ({ appKey, body, request }) => {
      if (!passwordRecoveryBroker || typeof passwordRecoveryBroker.completeReset !== 'function') {
        throw new Error('auth_password_reset_not_configured');
      }
      return await passwordRecoveryBroker.completeReset({ appKey, body: body || {}, request });
    },

    providerLogin: async (input) => {
      if (typeof providerLogin !== 'function') throw new Error('auth_provider_login_not_configured');
      return await providerLogin(input);
    }
  };

  return { identityResolver, authHandlers, publicSubject };
}
