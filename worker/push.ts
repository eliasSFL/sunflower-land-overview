/// <reference types="@cloudflare/workers-types" />

// Pure Web-Crypto implementation of Web Push (VAPID + aes128gcm).
//
// References:
//   RFC 8030 — Generic Event Delivery Using HTTP Push
//   RFC 8188 — Encrypted Content-Encoding for HTTP (aes128gcm)
//   RFC 8291 — Message Encryption for Web Push
//   RFC 8292 — VAPID
//
// We implement this from scratch instead of pulling in `web-push` so:
//   - No `nodejs_compat` surface area is needed in the cron path.
//   - Bundle stays small.
//   - The crypto contract is auditable inline.
//
// The encryption envelope is:
//   salt(16) || rs(4 BE) || idlen(1) || serverPub(65) || aesgcm(ciphertext + tag)
// where the body content is padded with `0x02 || 0x00*` (single record,
// "last record" marker = 0x02; we never split into multiple records).

export type VapidConfig = {
  publicKey: string; // URL-safe base64, raw uncompressed P-256 (65 bytes)
  privateKey: string; // URL-safe base64, raw scalar (32 bytes)
  subject: string; // mailto: or https: URL
};

export type PushSubscriptionRecord = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

// `Bytes` always refers to a Uint8Array whose backing store is an
// ArrayBuffer (not SharedArrayBuffer). TS 5.7+ distinguishes these and
// every Web Crypto entry point in CF Workers types wants the strict
// `Uint8Array<ArrayBuffer>` shape.
type Bytes = Uint8Array<ArrayBuffer>;

function alloc(n: number): Bytes {
  return new Uint8Array(new ArrayBuffer(n));
}

// -- base64url helpers --------------------------------------------------

function b64urlDecode(s: string): Bytes {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = alloc(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function b64urlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...arrs: Uint8Array[]): Bytes {
  const total = arrs.reduce((s, a) => s + a.length, 0);
  const out = alloc(total);
  let off = 0;
  for (const a of arrs) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

// -- ECDSA P-256 (VAPID JWT signing) -----------------------------------

// Import a raw 32-byte scalar as an ECDSA P-256 private key via JWK.
async function importEcdsaPrivate(
  rawPriv: Bytes,
  rawPub: Bytes,
): Promise<CryptoKey> {
  // P-256 uncompressed public: 0x04 || X(32) || Y(32)
  if (rawPub[0] !== 0x04 || rawPub.length !== 65) {
    throw new Error(
      "Invalid VAPID public key (expected 65-byte uncompressed P-256)",
    );
  }
  const x = rawPub.slice(1, 33);
  const y = rawPub.slice(33, 65);
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    d: b64urlEncode(rawPriv),
    x: b64urlEncode(x),
    y: b64urlEncode(y),
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

async function signVapidJwt(
  vapid: VapidConfig,
  audience: string,
  expSeconds: number,
): Promise<string> {
  const header = { typ: "JWT", alg: "ES256" };
  const payload = { aud: audience, exp: expSeconds, sub: vapid.subject };
  const enc = new TextEncoder();
  const head = b64urlEncode(enc.encode(JSON.stringify(header)));
  const body = b64urlEncode(enc.encode(JSON.stringify(payload)));
  const signing = `${head}.${body}`;
  const priv = await importEcdsaPrivate(
    b64urlDecode(vapid.privateKey),
    b64urlDecode(vapid.publicKey),
  );
  const sigBuf = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    priv,
    enc.encode(signing),
  );
  // Web Crypto returns IEEE P-1363 (r||s) — exactly what JWS ES256 wants.
  return `${signing}.${b64urlEncode(sigBuf)}`;
}

// -- HKDF ---------------------------------------------------------------

async function hkdf(
  salt: Bytes,
  ikm: Bytes,
  info: Bytes,
  length: number,
): Promise<Bytes> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info } as HkdfParams,
    key,
    length * 8,
  );
  return new Uint8Array(bits) as Bytes;
}

// -- ECDH + aes128gcm payload encryption (RFC 8291 + RFC 8188) ---------

async function generateEphemeralEcdh(): Promise<{
  pubRaw: Bytes;
  priv: CryptoKey;
}> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const pubRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", pair.publicKey),
  ) as Bytes;
  return { pubRaw, priv: pair.privateKey };
}

async function importEcdhPublic(rawPub: Bytes): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    rawPub,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
}

async function deriveSharedSecret(
  serverPriv: CryptoKey,
  uaPubRaw: Bytes,
): Promise<Bytes> {
  const uaPub = await importEcdhPublic(uaPubRaw);
  const bits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: uaPub },
    serverPriv,
    256,
  );
  return new Uint8Array(bits) as Bytes;
}

async function encryptPayload(
  sub: PushSubscriptionRecord,
  plaintext: Bytes,
): Promise<{ body: Bytes; serverPubRaw: Bytes }> {
  const uaPubRaw = b64urlDecode(sub.keys.p256dh);
  const auth = b64urlDecode(sub.keys.auth);
  if (uaPubRaw.length !== 65 || uaPubRaw[0] !== 0x04) {
    throw new Error("Subscription p256dh is not uncompressed P-256");
  }

  const { pubRaw: serverPubRaw, priv: serverPriv } =
    await generateEphemeralEcdh();
  const ecdh = await deriveSharedSecret(serverPriv, uaPubRaw);

  const salt = crypto.getRandomValues(alloc(16));

  // Per RFC 8291 §3.3
  // PRK_key = HKDF(salt=auth, ikm=ecdh, info="WebPush: info\0" || uaPub || serverPub, 32)
  const enc = new TextEncoder();
  const keyInfo = concat(enc.encode("WebPush: info\0"), uaPubRaw, serverPubRaw);
  const ikm = await hkdf(auth, ecdh, keyInfo, 32);

  // CEK = HKDF(salt=salt, ikm=PRK_key, info="Content-Encoding: aes128gcm\0", 16)
  const cek = await hkdf(
    salt,
    ikm,
    enc.encode("Content-Encoding: aes128gcm\0"),
    16,
  );
  // Nonce = HKDF(salt=salt, ikm=PRK_key, info="Content-Encoding: nonce\0", 12)
  const nonce = await hkdf(
    salt,
    ikm,
    enc.encode("Content-Encoding: nonce\0"),
    12,
  );

  // Single-record padding: 0x02 marks the last record (RFC 8188 §2).
  const trailer = alloc(1);
  trailer[0] = 0x02;
  const padded = concat(plaintext, trailer);

  const cekKey = await crypto.subtle.importKey(
    "raw",
    cek,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce, tagLength: 128 },
      cekKey,
      padded,
    ),
  ) as Bytes;

  // Build the aes128gcm encoding header (RFC 8188 §2.1):
  //   salt(16) || rs(4) || idlen(1) || keyid(idlen) || ciphertext
  // For Web Push, keyid is the server ephemeral pub (raw, 65 bytes).
  const rs = 4096;
  const rsBuf = alloc(4);
  new DataView(rsBuf.buffer).setUint32(0, rs, false);
  const idlen = alloc(1);
  idlen[0] = serverPubRaw.length;
  const body = concat(salt, rsBuf, idlen, serverPubRaw, ct);
  return { body, serverPubRaw };
}

// -- public API ---------------------------------------------------------

export async function sendPush(
  vapid: VapidConfig,
  sub: PushSubscriptionRecord,
  payload: Bytes,
  ttlSeconds: number = 60,
): Promise<Response> {
  const url = new URL(sub.endpoint);
  const audience = `${url.protocol}//${url.host}`;
  // 12-hour JWT lifetime — short enough that a leaked token doesn't
  // grant long-lived access, well within the 24h RFC 8292 cap.
  const exp = Math.floor(Date.now() / 1000) + 12 * 60 * 60;
  const jwt = await signVapidJwt(vapid, audience, exp);

  const { body } = await encryptPayload(sub, payload);

  return fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      TTL: String(ttlSeconds),
      // Some push services (e.g. FCM) require explicit content length;
      // fetch in Workers infers it but we set it anyway for clarity.
      "Content-Length": String(body.byteLength),
    },
    body,
  });
}
