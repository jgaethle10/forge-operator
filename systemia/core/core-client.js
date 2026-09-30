function normalizeBaseUrl(value) {
  return String(value || '/api/core').replace(/\/$/, '');
}

async function post(baseUrl, route, payload) {
  const response = await fetch(normalizeBaseUrl(baseUrl) + route, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok === false) {
    throw new Error(body?.error || `evercraft_core_http_${response.status}`);
  }
  return Object.prototype.hasOwnProperty.call(body, 'value') ? body.value : body;
}

async function fileToPayload(file) {
  if (!file) throw new Error('upload_file_required');
  if (typeof file === 'string') {
    return { data_base64: file, filename: 'upload.bin' };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return {
    data_base64: btoa(binary),
    filename: file.name || 'upload.bin',
    mime_type: file.type || 'application/octet-stream',
  };
}

export function createEvercraftCoreClient({ baseUrl = '/api/core' } = {}) {
  return {
    InvokeLLM(payload) {
      return post(baseUrl, '/invoke-llm', payload);
    },
    async UploadFile(payload = {}) {
      if (payload.file) {
        const encoded = await fileToPayload(payload.file);
        return post(baseUrl, '/upload-file', { ...payload, ...encoded, file: undefined });
      }
      return post(baseUrl, '/upload-file', payload);
    },
    SendEmail(payload) {
      return post(baseUrl, '/send-email', payload);
    },
    SendSMS(payload) {
      return post(baseUrl, '/send-sms', payload);
    },
    GenerateImage(payload) {
      return post(baseUrl, '/generate-image', payload);
    },
    ExtractDataFromUploadedFile(payload) {
      return post(baseUrl, '/extract-data', payload);
    },
  };
}

export const Core = createEvercraftCoreClient();
export const InvokeLLM = Core.InvokeLLM;
export const UploadFile = Core.UploadFile;
export const SendEmail = Core.SendEmail;
export const SendSMS = Core.SendSMS;
export const GenerateImage = Core.GenerateImage;
export const ExtractDataFromUploadedFile = Core.ExtractDataFromUploadedFile;
