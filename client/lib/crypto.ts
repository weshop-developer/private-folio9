// Web Crypto API Helpers for PrivateFolio E2EE

// 1. Derive a Master Key from the user's password and a salt (e.g. username)
export async function deriveMasterKey(password: string, salt: string): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
        "raw",
        enc.encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
    );

    return window.crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: enc.encode(salt),
            iterations: 100000,
            hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false, // Key cannot be exported
        ["encrypt", "decrypt"]
    );
}

// 2. Encrypt Data (Object -> JSON -> Encrypted String)
// Output Format: "iv_hex:ciphertext_hex"
export async function encryptData(data: any, key: CryptoKey): Promise<string> {
    const enc = new TextEncoder();
    const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for AES-GCM
    const encodedData = enc.encode(JSON.stringify(data));

    const ciphertext = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        encodedData
    );

    // Convert to Hex strings for storage
    const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
    const cipherHex = Array.from(new Uint8Array(ciphertext)).map(b => b.toString(16).padStart(2, '0')).join('');

    return `${ivHex}:${cipherHex}`;
}

// 3. Decrypt Data (Encrypted String -> JSON -> Object)
export async function decryptData(encryptedString: string, key: CryptoKey): Promise<any> {
    const [ivHex, cipherHex] = encryptedString.split(':');
    if (!ivHex || !cipherHex) throw new Error('Invalid encrypted format');

    const iv = new Uint8Array(ivHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    const ciphertext = new Uint8Array(cipherHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));

    const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        ciphertext
    );

    const dec = new TextDecoder();
    return JSON.parse(dec.decode(decryptedBuffer));
}
