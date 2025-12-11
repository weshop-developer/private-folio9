// Shim for libraries relying on __dirname (like yahoo-finance2 dependencies)
// @ts-ignore
globalThis.__dirname = "/"
// @ts-ignore
globalThis.process = { env: {} }

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { jwt } from 'hono/jwt'
import { hashPasswordBcrypt, comparePasswordBcrypt, signToken, JWT_SECRET } from './auth'
import yahooFinance from 'yahoo-finance2'

type Bindings = {
    DB: D1Database
    ASSETS: Fetcher
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', logger()) // Add Logger Middleware
app.use('/api/*', cors())

// --- DB Auto-Init Middleware ---
// Cloudflare Workers don't have a traditional "App Start", so we use a "Lazy Singleton" pattern.
// This runs once per Worker Isolate cold start.
let dbInitialized = false

app.use('*', async (c, next) => {
    if (!dbInitialized) {
        try {
            // fast check
            await c.env.DB.prepare('SELECT 1 FROM users LIMIT 1').first()
            dbInitialized = true
            console.log('[DB] Database already initialized.')
        } catch (e: any) {
            if (e.message.includes('no such table')) {
                console.log('[DB] Database tables not found, initializing...')
                await initialize_db(c.env.DB)
                dbInitialized = true
                console.log('[DB] Database initialized successfully.')
            } else {
                console.error('[DB] Error checking database initialization:', e)
            }
        }
    }
    await next()
})

// --- Auth Routes ---

app.post('/api/auth/register', async (c) => {
    const { username, password } = await c.req.json()
    if (!username || !password) return c.json({ error: 'Missing fields' }, 400)

    const hashedPassword = hashPasswordBcrypt(password)
    const id = crypto.randomUUID()

    try {
        await c.env.DB.prepare(
            'INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)'
        ).bind(id, username, hashedPassword).run()

        console.log(`[Auth] User registered successfully: ${username} (${id})`)
        const token = await signToken(id)
        return c.json({ token, user: { id, username } })
    } catch (e: any) {
        console.error(`[Auth] Registration failed for ${username}:`, e)
        if (e.message.includes('UNIQUE')) return c.json({ error: 'Username already exists' }, 409)
        return c.json({ error: 'Failed to register' }, 500)
    }
})

app.post('/api/auth/login', async (c) => {
    try {
        const { username, password } = await c.req.json()
        const user = await c.env.DB.prepare(
            'SELECT * FROM users WHERE username = ?'
        ).bind(username).first()

        if (!user || !comparePasswordBcrypt(password, user.password_hash as string)) {
            console.warn(`[Auth] Invalid login attempt for user: ${username}`)
            return c.json({ error: 'Invalid credentials' }, 401)
        }

        console.log(`[Auth] User logged in: ${username} (${user.id})`)
        const token = await signToken(user.id as string)
        return c.json({ token, user: { id: user.id, username: user.username } })
    } catch (e) {
        console.error(`[Auth] Login error for ${c.req.json ? (await c.req.json()).username : 'unknown'}:`, e)
        return c.json({ error: 'Login failed' }, 500)
    }
})

// --- Protected Routes ---

// Middleare to check JWT for protected routes
app.use('/api/portfolios/*', jwt({ secret: JWT_SECRET }))
app.use('/api/quote/*', jwt({ secret: JWT_SECRET }))

app.get('/api/portfolios', async (c) => {
    const payload = c.get('jwtPayload')
    const userId = payload.sub

    try {
        // Get portfolios with total value (simple sum of assets cost basis for now, real value requires fetching prices)
        // For MVP just list them
        const { results } = await c.env.DB.prepare(
            'SELECT * FROM portfolios WHERE user_id = ? ORDER BY created_at DESC'
        ).bind(userId).all()

        // Query assets for each portfolio? Or join? 
        // Let's do simple query first.
        console.log(`[Portfolios] Fetched ${results.length} portfolios for user ${userId}`)
        return c.json(results)
    } catch (e) {
        console.error(`[Portfolios] Failed to fetch portfolios for user ${userId}:`, e)
        return c.json({ error: 'Failed to fetch portfolios' }, 500)
    }
})

app.post('/api/portfolios', async (c) => {
    const payload = c.get('jwtPayload')
    const userId = payload.sub

    try {
        const { name, currency } = await c.req.json()

        const id = crypto.randomUUID()
        await c.env.DB.prepare(
            'INSERT INTO portfolios (id, user_id, name, currency) VALUES (?, ?, ?, ?)'
        ).bind(id, userId, name, currency || 'USD').run()

        console.log(`[Portfolios] Created portfolio '${name}' (${id}) for user ${userId}`)
        return c.json({ id, name, currency })
    } catch (e) {
        console.error(`[Portfolios] Failed to create portfolio for user ${userId}:`, e)
        return c.json({ error: 'Failed to create portfolio' }, 500)
    }
})

app.post('/api/portfolios/:id/assets', async (c) => {
    const payload = c.get('jwtPayload')
    const userId = payload.sub
    const portfolioId = c.req.param('id')

    try {
        const { symbol, quantity, costBasis } = await c.req.json()

        // Verify ownership
        const portfolio = await c.env.DB.prepare('SELECT id FROM portfolios WHERE id = ? AND user_id = ?').bind(portfolioId, userId).first()
        if (!portfolio) {
            console.warn(`[Assets] Unauthorized attempt to add asset to portfolio ${portfolioId} by user ${userId}`)
            return c.json({ error: 'Portfolio not found' }, 404)
        }

        const id = crypto.randomUUID()
        await c.env.DB.prepare(
            'INSERT INTO assets (id, portfolio_id, symbol, quantity, cost_basis) VALUES (?, ?, ?, ?, ?)'
        ).bind(id, portfolioId, symbol, quantity, costBasis).run()

        console.log(`[Assets] Added ${symbol} (x${quantity}) to portfolio ${portfolioId} for user ${userId}`)
        return c.json({ id, symbol, quantity })
    } catch (e) {
        console.error(`[Assets] Failed to add asset to portfolio ${portfolioId} for user ${userId}:`, e)
        return c.json({ error: 'Failed to add asset' }, 500)
    }
})

app.get('/api/portfolios/:id', async (c) => {
    const payload = c.get('jwtPayload')
    const userId = payload.sub
    const portfolioId = c.req.param('id')

    try {
        const portfolio = await c.env.DB.prepare('SELECT * FROM portfolios WHERE id = ? AND user_id = ?').bind(portfolioId, userId).first()
        if (!portfolio) return c.json({ error: 'Portfolio not found' }, 404)

        const { results: assets } = await c.env.DB.prepare('SELECT * FROM assets WHERE portfolio_id = ?').bind(portfolioId).all()
        console.log(`[Portfolios] Fetched portfolio ${portfolioId} with ${assets.length} assets for user ${userId}`)
        return c.json({ ...portfolio, assets })
    } catch (e) {
        console.error(`[Portfolios] Failed to fetch details for portfolio ${portfolioId} for user ${userId}:`, e)
        return c.json({ error: 'Failed to fetch portfolio details' }, 500)
    }
})

// --- Market Data ---

app.get('/api/quote', async (c) => {
    const symbol = c.req.query('symbol')
    if (!symbol) return c.json({ error: 'Missing symbol' }, 400)

    try {
        console.log(`[Quote] Fetching data for ${symbol}...`)
        const quote = await yahooFinance.quote(symbol)
        console.log(`[Quote] Successfully fetched ${symbol}: $${(quote as any).regularMarketPrice}`)
        return c.json(quote)
    } catch (e) {
        console.error(`[Quote] Yahoo Finance Error for ${symbol}:`, e)
        // Fallback or specific error handling
        return c.json({ error: 'Failed to fetch quote' }, 500)
    }
})

// API Routes
app.get('/api/prices', async (c) => {
    const ids = c.req.query('ids')
    if (!ids) return c.json({ error: 'Missing ids' }, 400)

    try {
        console.log(`[Prices] Fetching CoinGecko prices for IDs: ${ids}`)
        const response = await fetch(
            `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
            { headers: { 'Accept': 'application/json' }, cf: { cacheTtl: 60 } }
        )
        if (!response.ok) throw new Error('CoinGecko Error')
        const data = await response.json()
        console.log(`[Prices] Successfully fetched CoinGecko prices for IDs: ${ids}`)
        return c.json(data)
    } catch (e) {
        console.error(`[Prices] CoinGecko Error for ${ids}:`, e)
        return c.json({ error: 'Failed to fetch prices' }, 500) // Changed 200 to 500 for error
    }
})

// Serve Static Assets (React SPA)
// Intercept all other requests.
app.get('*', async (c) => {
    // 1. Production: Cloudflare Workers with Assets binding
    if (c.env.ASSETS) {
        // Try to serve the exact file
        const res = await c.env.ASSETS.fetch(c.req.raw)
        if (res.status !== 404) {
            return res
        }
        // Fallback to index.html for SPA routing (excluding /api)
        if (!c.req.path.startsWith('/api')) {
            const indexResponse = await c.env.ASSETS.fetch(new Request(new URL('/index.html', c.req.url), c.req.raw))
            return indexResponse
        }
        return c.text('Not Found', 404)
    }

    // 2. Local Development (Vite)
    // ASSETS binding is missing. We serve a shell HTML that points to the local client entry.
    // Vite's dev server middleware will intercept the request for /client/main.tsx and handle HMR.
    else {
        return c.html(`
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PrivateFolio (Local)</title>
    <script type="module">
      import RefreshRuntime from "/@react-refresh"
      RefreshRuntime.injectIntoGlobalHook(window)
      window.$RefreshReg$ = () => {}
      window.$RefreshSig$ = () => (type) => type
      window.__vite_plugin_react_preamble_installed__ = true
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/client/main.tsx"></script>
  </body>
</html>
        `)
    }
})

export default app

async function initialize_db(db: D1Database) {
    console.log('Initializing Database...')
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE TABLE IF NOT EXISTS portfolios (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            currency TEXT DEFAULT 'USD',
            created_at INTEGER NOT NULL DEFAULT (unixepoch()),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS assets (
            id TEXT PRIMARY KEY,
            portfolio_id TEXT NOT NULL,
            symbol TEXT NOT NULL,
            quantity REAL NOT NULL,
            cost_basis REAL NOT NULL,
            created_at INTEGER NOT NULL DEFAULT (unixepoch()),
            FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
        );
    `)
}
