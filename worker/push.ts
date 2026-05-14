/// <reference types="@cloudflare/workers-types" />

// RFC 8291 (Web Push aes128gcm) + RFC 8292 (VAPID).
// Pure Web Crypto — no `web-push` dependency. Cloudflare Workers' Web
// Crypto exposes everything we need: ECDH on P-256, HKDF-SHA256,
// AES-GCM, ECDSA P-256 SHA-256 (for the VAPID JWT).

export type Vapid = {
  publicKey: string; // base64url-encoded raw P-256 public key (65 bytes)
  privateKey: string; // base64url-encoded raw P-256 private key (32 bytes)
  subject: string; // "mailto:..." or "https://..."
};

export type WebPushSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

const enc = new TextEncoder();

function b64uDecode(value: string): Uint8Array {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function b64uEncode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

// `Uint8Array<ArrayBufferLike>` (TS 5.7+) doesn't satisfy `BufferSource`
// (which requires `ArrayBufferView<ArrayBuffer>` or `ArrayBuffer`).
// In a Worker every buffer is ArrayBuffer-backed; this assertion just
// narrows the generic for the type-checker.
const buf = (u8: Uint8Array): BufferSource => u8 as unknown as BufferSource;

// Build the uncompressed P-256 raw public key (65 bytes: 0x04 || X || Y).
// Web Crypto's `jwk` import keeps the components separated; client
// subscriptions ship the raw form directly, so we just b64u-decode them.

async function importEcdhPublic(rawKey: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    buf(rawKey),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
}

async function generateEcdhKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
}

async function exportRawPublic(key: CryptoKey): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.exportKey("raw", key));
}

async function ecdh(
  serverPriv: CryptoKey,
  clientPub: CryptoKey,
): Promise<Uint8Array> {
  const bits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: clientPub },
    serverPriv,
    256,
  );
  return new Uint8Array(bits);
}

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", buf(ikm), "HKDF", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: buf(salt),
      info: buf(info),
    },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

// RFC 8291 §3.4. Returns the on-the-wire body: salt(16) || rs(4 BE) ||
// idlen(1) || keyid(65: server pub raw) || ciphertext+tag.
async function encryptPayload(
  payload: Uint8Array,
  clientP256dh: Uint8Array,
  authSecret: Uint8Array,
): Promise<Uint8Array> {
  const serverKeyPair = await generateEcdhKeyPair();
  const serverPubRaw = await exportRawPublic(serverKeyPair.publicKey);
  const clientPub = await importEcdhPublic(clientP256dh);
  const ecdhSecret = await ecdh(serverKeyPair.privateKey, clientPub);

  // PRK_key = HKDF(salt=auth_secret, ikm=ecdh, info="WebPush: info\0"
  //                || clientPub || serverPub, len=32)
  const keyInfo = concat(
    enc.encode("WebPush: info\0"),
    clientP256dh,
    serverPubRaw,
  );
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(
    salt,
    ikm,
    enc.encode("Content-Encoding: aes128gcm\0"),
    16,
  );
  const nonce = await hkdf(
    salt,
    ikm,
    enc.encode("Content-Encoding: nonce\0"),
    12,
  );

  // RFC 8188 single-record padding: append 0x02 (last-record marker).
  const plaintext = concat(payload, new Uint8Array([0x02]));

  const cekKey = await crypto.subtle.importKey(
    "raw",
    buf(cek),
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: buf(nonce) },
      cekKey,
      buf(plaintext),
    ),
  );

  // rs = 4096, idlen = 65 (serverPub raw length).
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096, false);
  const idlen = new Uint8Array([serverPubRaw.length]);

  return concat(salt, rs, idlen, serverPubRaw, ciphertext);
}

// Web Crypto needs a JWK for ECDSA P-256 private-key import (raw EC
// keys aren't supported). RFC 8292 stores both halves as base64url
// raw bytes, so we build the JWK by hand from the public X/Y and the
// private scalar d.
async function importVapidKey(vapid: Vapid): Promise<CryptoKey> {
  const pubRaw = b64uDecode(vapid.publicKey);
  if (pubRaw[0] !== 0x04 || pubRaw.length !== 65) {
    throw new Error("VAPID public key must be uncompressed P-256 (65 bytes)");
  }
  const x = pubRaw.subarray(1, 33);
  const y = pubRaw.subarray(33, 65);
  const d = b64uDecode(vapid.privateKey);
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: b64uEncode(x),
    y: b64uEncode(y),
    d: b64uEncode(d),
    ext: true,
  };
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

// VAPID JWT (RFC 8292). 12-hour expiry; aud = origin of the push
// service endpoint.
async function signVapidJwt(
  vapid: Vapid,
  pushOrigin: string,
): Promise<string> {
  const header = b64uEncode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = b64uEncode(
    enc.encode(
      JSON.stringify({
        aud: pushOrigin,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: vapid.subject,
      }),
    ),
  );
  const signingInput = enc.encode(`${header}.${payload}`);
  const key = await importVapidKey(vapid);
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      buf(signingInput),
    ),
  );
  return `${header}.${payload}.${b64uEncode(signature)}`;
}

export async function sendPush(
  subscription: WebPushSubscription,
  payload: unknown,
  vapid: Vapid,
  ttlSeconds = 60 * 60,
): Promise<Response> {
  const url = new URL(subscription.endpoint);
  const body = await encryptPayload(
    enc.encode(JSON.stringify(payload)),
    b64uDecode(subscription.keys.p256dh),
    b64uDecode(subscription.keys.auth),
  );
  const jwt = await signVapidJwt(vapid, url.origin);
  return fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      "Content-Length": String(body.byteLength),
      Authorization: `vapid t=${jwt},k=${vapid.publicKey}`,
      TTL: String(ttlSeconds),
    },
    body: body as unknown as BodyInit,
  });
}

