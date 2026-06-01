// Shared Apple JWS verification for Supabase edge functions.
// Verifies the JWS signature against the leaf certificate public key (x5c[0]).
// NOTE: cert chain validation (leaf → intermediate → Apple root) is intentionally
// deferred — tracked as B3 in the security backlog.

export function base64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - padded.length % 4) % 4;
  const b64 = padded + '='.repeat(pad);
  const binary = atob(b64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export function base64Decode(str: string): Uint8Array {
  const binary = atob(str);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

// Verifies an Apple JWS and returns the decoded payload.
// Throws on invalid structure, missing x5c chain, or signature mismatch.
// The caller must not trust the payload if this throws.
export async function verifyAppleJWS(signedPayload: string): Promise<unknown> {
  const parts = signedPayload.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWS structure');

  const [headerB64, payloadB64, signatureB64] = parts;

  const header = JSON.parse(new TextDecoder().decode(base64urlDecode(headerB64)));
  const x5c: string[] = header.x5c;
  if (!x5c || x5c.length < 2) throw new Error('Missing x5c cert chain in JWS header');

  const leafDer = base64Decode(x5c[0]);

  let publicKey: CryptoKey;
  let algorithm: AlgorithmIdentifier;
  try {
    publicKey = await crypto.subtle.importKey(
      'spki', leafDer,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false, ['verify'],
    );
    algorithm = { name: 'ECDSA', hash: 'SHA-256' };
  } catch {
    publicKey = await crypto.subtle.importKey(
      'spki', leafDer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false, ['verify'],
    );
    algorithm = { name: 'RSASSA-PKCS1-v1_5' };
  }

  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64urlDecode(signatureB64);

  const valid = await crypto.subtle.verify(algorithm, publicKey, signature, signingInput);
  if (!valid) throw new Error('JWS signature verification failed');

  return JSON.parse(new TextDecoder().decode(base64urlDecode(payloadB64)));
}
