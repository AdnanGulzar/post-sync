import { TokenCrypto } from './token-crypto';

const SECRET = 'test-only-encryption-key-nUqR3mZ7fLxW2pB9';

describe('TokenCrypto', () => {
  const crypto = new TokenCrypto(SECRET);

  it('round-trips a token', () => {
    const token = 'ya29.a0AfH6SMBexample-access-token';
    expect(crypto.decrypt(crypto.encrypt(token))).toBe(token);
  });

  it('round-trips tokens with unicode and separators', () => {
    // The stored form is colon-delimited, so a token containing colons must
    // survive; base64 of the ciphertext is what keeps that safe.
    const token = 'a:b:c::ünïcødé:🔑';
    expect(crypto.decrypt(crypto.encrypt(token))).toBe(token);
  });

  it('produces different ciphertext each time', () => {
    // A fixed IV would let equal tokens be spotted by comparing columns.
    const token = 'same-token';
    expect(crypto.encrypt(token)).not.toBe(crypto.encrypt(token));
  });

  it('never stores the plaintext', () => {
    const token = 'super-secret-value';
    expect(crypto.encrypt(token)).not.toContain(token);
  });

  it('rejects a token encrypted under a different key', () => {
    const other = new TokenCrypto('a-completely-different-key-Xy7Qm2Lp');
    expect(() => other.decrypt(crypto.encrypt('x'))).toThrow();
  });

  it('rejects tampered ciphertext rather than returning garbage', () => {
    const [iv, tag, data] = crypto.encrypt('x').split(':') as [string, string, string];
    const flipped = Buffer.from(data, 'base64');
    flipped[0] = (flipped[0] as number) ^ 0xff;
    expect(() => crypto.decrypt(`${iv}:${tag}:${flipped.toString('base64')}`)).toThrow();
  });

  it('rejects a malformed stored value', () => {
    expect(() => crypto.decrypt('not-encrypted')).toThrow(/expected iv:authTag:ciphertext/);
    expect(() => crypto.decrypt('a:b')).toThrow();
  });

  it('refuses to construct without a key', () => {
    const saved = process.env.TOKEN_ENCRYPTION_KEY;
    delete process.env.TOKEN_ENCRYPTION_KEY;
    try {
      expect(() => new TokenCrypto()).toThrow(/TOKEN_ENCRYPTION_KEY is not set/);
    } finally {
      if (saved !== undefined) process.env.TOKEN_ENCRYPTION_KEY = saved;
    }
  });
});
