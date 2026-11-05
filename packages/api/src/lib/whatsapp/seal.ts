// Access tokens for connected numbers are stored sealed with AES-256-GCM. The key is derived (HKDF-SHA256) from the
// server secret, so a leaked database alone does not hand out anyone's WhatsApp token. Rotating BETTER_AUTH_SECRET
// makes stored tokens unreadable: the seller then reconnects the number.

const VERSION = "v1";
const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  if (secret.length < 32) throw new Error("token sealing secret must be at least 32 characters");
  const base = await crypto.subtle.importKey("raw", encoder.encode(secret), "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode("wacheap"),
      info: encoder.encode("wa-number-token"),
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** `v1.<iv>.<ciphertext>`, base64. `context` (the phone number id) is bound in, so a sealed token can't be moved to another row. */
export async function sealToken(secret: string, token: string, context: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(context) },
    await deriveKey(secret),
    encoder.encode(token),
  );
  return `${VERSION}.${toBase64(iv)}.${toBase64(new Uint8Array(sealed))}`;
}

/** The token sealed by `sealToken`; throws when the secret, the context or the text don't match. */
export async function openToken(secret: string, sealed: string, context: string): Promise<string> {
  const [version, iv, data] = sealed.split(".");
  if (version !== VERSION || !iv || !data) throw new Error("unknown sealed token format");
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(iv), additionalData: encoder.encode(context) },
    await deriveKey(secret),
    fromBase64(data),
  );
  return new TextDecoder().decode(plain);
}
