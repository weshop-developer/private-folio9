import { SignJWT, jwtVerify } from 'jose'

export const JWT_SECRET = 'your-secret-key-change-this-in-env-vars'

// Helper to sign JWT
export async function signToken(userId: string) {
    const secret = new TextEncoder().encode(JWT_SECRET)
    return await new SignJWT({ sub: userId })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime('24h')
        .sign(secret)
}

// Helper to verify JWT
export async function verifyToken(token: string) {
    try {
        const secret = new TextEncoder().encode(JWT_SECRET)
        const { payload } = await jwtVerify(token, secret)
        return payload
    } catch (e) {
        return null
    }
}

// Helper to hash password (using simple WebCrypto for MVP, bcryptjs can be heavy)
// Using PBKDF2 for password hashing
// export async function hashPassword(password: string, salt: string) { ... } 
// REMOVED unused WebCrypto implementation to avoid Buffer dependency issues.
// We are using bcryptjs below.

import bcrypt from 'bcryptjs'

export const hashPasswordBcrypt = (password: string) => bcrypt.hashSync(password, 8)
export const comparePasswordBcrypt = (password: string, hash: string) => bcrypt.compareSync(password, hash)
