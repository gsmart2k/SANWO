import express from 'express'
import { OAuth2Client } from 'google-auth-library'
import { randomUUID, createHmac, publicEncrypt, constants } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import 'dotenv/config'

// ─── Persistence helpers ──────────────────────────────────────────────────────

const __dir = dirname(fileURLToPath(import.meta.url))
const REGISTRY_PATH = join(__dir, 'registry.json')
const PAYSTACK_ACCOUNTS_PATH = join(__dir, 'paystack_accounts.json')

function loadJSON<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback
  try { return JSON.parse(readFileSync(path, 'utf8')) as T } catch { return fallback }
}

function saveJSON(path: string, data: unknown) {
  writeFileSync(path, JSON.stringify(data, null, 2))
}

// email (lowercase) → wallet address
const registry: Record<string, string> = loadJSON(REGISTRY_PATH, {})

function registerUser(email: string, walletAddress: string) {
  registry[email.toLowerCase()] = walletAddress
  saveJSON(REGISTRY_PATH, registry)
}

// ─── Paystack virtual account store ──────────────────────────────────────────

interface PaystackAccount {
  customerCode: string
  accountNumber: string
  bankName: string
}

const paystackAccounts: Record<string, PaystackAccount> = loadJSON(PAYSTACK_ACCOUNTS_PATH, {})

function savePaystackAccount(email: string, account: PaystackAccount) {
  paystackAccounts[email.toLowerCase()] = account
  saveJSON(PAYSTACK_ACCOUNTS_PATH, paystackAccounts)
}

// ─── App setup ────────────────────────────────────────────────────────────────

const app = express()

// Webhook route must receive raw body for signature verification — register BEFORE express.json()
app.post('/api/deposit/webhook', express.raw({ type: '*/*' }), async (req, res) => {
  const secret = process.env.PAYSTACK_SECRET_KEY ?? ''
  const sig = req.headers['x-paystack-signature'] as string | undefined
  const hash = createHmac('sha512', secret).update(req.body as Buffer).digest('hex')

  if (!sig || hash !== sig) {
    console.warn('Paystack webhook: invalid signature')
    return res.status(401).send('Invalid signature')
  }

  let event: { event: string; data: Record<string, unknown> }
  try {
    event = JSON.parse((req.body as Buffer).toString())
  } catch {
    return res.status(400).send('Bad JSON')
  }

  res.sendStatus(200) // acknowledge immediately

  if (event.event !== 'charge.success') return

  const data = event.data as {
    amount: number
    currency: string
    channel: string
    customer: { email: string }
  }

  if (data.currency !== 'NGN') return

  const email = data.customer?.email?.toLowerCase()
  const ngnAmount = data.amount / 100 // kobo → NGN
  const walletAddress = registry[email]

  if (!walletAddress) {
    console.warn(`Paystack webhook: no wallet for ${email}`)
    return
  }

  const rate = await fetchNgnRate().catch(() => null)
  if (!rate) { console.error('Paystack webhook: could not fetch NGN rate'); return }

  const usdcAmount = (ngnAmount / rate).toFixed(2)
  console.log(`Paystack deposit: ${email} paid ₦${ngnAmount} → ${usdcAmount} USDC to ${walletAddress}`)

  try {
    const txId = await sendFromTreasury(walletAddress, usdcAmount)
    console.log(`Treasury payout submitted — Circle tx: ${txId}`)
  } catch (err) {
    console.error('Treasury payout failed:', err)
  }
})

app.use(express.json())

// Allow Vite dev server to proxy — in production replace with proper CORS config
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-User-Token')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY ?? ''
const CIRCLE_BASE = 'https://api.circle.com'
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? ''
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY ?? ''
const PAYSTACK_BASE = 'https://api.paystack.co'

if (!CIRCLE_API_KEY) console.warn('⚠  CIRCLE_API_KEY is not set')
if (!GOOGLE_CLIENT_ID) console.warn('⚠  GOOGLE_CLIENT_ID is not set')
if (!PAYSTACK_SECRET_KEY) console.warn('⚠  PAYSTACK_SECRET_KEY is not set')

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID)

// ─── Paystack API helper ──────────────────────────────────────────────────────

async function paystack<T = Record<string, unknown>>(
  method: string,
  path: string,
  body?: object
): Promise<T> {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = (await res.json()) as { status: boolean; message?: string; data: T }
  if (!res.ok || !json.status) {
    throw new Error(json.message ?? `Paystack ${res.status} on ${path}`)
  }
  return json.data
}

// ─── Treasury payout (developer-controlled wallet → user wallet) ─────────────

async function getEntitySecretCiphertext(): Promise<string> {
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET ?? ''
  const { data } = await circle<{ publicKey: string }>('GET', '/v1/w3s/config/entity/publicKey')
  const encrypted = publicEncrypt(
    { key: data.publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(entitySecret, 'hex')
  )
  return encrypted.toString('base64')
}

async function sendFromTreasury(toAddress: string, usdcAmount: string): Promise<string> {
  const treasuryWalletId = process.env.CIRCLE_TREASURY_WALLET_ID ?? ''
  if (!treasuryWalletId) throw new Error('CIRCLE_TREASURY_WALLET_ID not configured')

  const entitySecretCiphertext = await getEntitySecretCiphertext()

  const res = await circle<{ id?: string; state?: string }>(
    'POST',
    '/v1/w3s/developer/transactions/transfer',
    {
      idempotencyKey: randomUUID(),
      entitySecretCiphertext,
      walletId: treasuryWalletId,
      destinationAddress: toAddress,
      amounts: [usdcAmount],
      tokenAddress: '0x3600000000000000000000000000000000000000',
      blockchain: 'ARC-TESTNET',
      feeLevel: 'MEDIUM',
    }
  )

  return (res as { id?: string }).id ?? 'submitted'
}

// ─── NGN/USDC rate ────────────────────────────────────────────────────────────

async function fetchNgnRate(): Promise<number> {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=ngn'
    )
    const data = await res.json() as { 'usd-coin': { ngn: number } }
    return data['usd-coin'].ngn
  } catch {
    return 1650 // fallback rate if CoinGecko is unavailable
  }
}

// ─── Circle API helper ────────────────────────────────────────────────────────

async function circle<T = Record<string, unknown>>(
  method: string,
  path: string,
  body?: object,
  userToken?: string
): Promise<{ data: T }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${CIRCLE_API_KEY}`,
  }
  if (userToken) headers['X-User-Token'] = userToken

  const res = await fetch(`${CIRCLE_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  const json = (await res.json()) as { data: T; message?: string; errors?: unknown[] }
  if (!res.ok) {
    const detail = JSON.stringify(json)
    console.error(`Circle API error [${res.status}] ${method} ${path}:`, detail)
    throw new Error(json.message ?? `Circle API ${res.status} on ${path}`)
  }
  return json
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * POST /api/auth/google
 * Verifies a Google ID token, creates or retrieves the Circle user, and
 * returns the userToken + encryptionKey needed for the Circle Web SDK.
 *
 * For first-time users it also returns a challengeId (PIN setup).
 * For returning users it returns the wallet address directly.
 */
app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential } = req.body as { credential: string }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    })
    const payload = ticket.getPayload()!
    // Prefix with "google_" to namespace Circle userId by provider
    const userId = `google_${payload.sub}`

    // Create Circle user (idempotent — safe to call even if already exists)
    try {
      await circle('POST', '/v1/w3s/users', { userId })
    } catch {
      // 409 Conflict → user already exists, continue
    }

    // Acquire a short-lived session token
    const tokenRes = await circle<{ userToken: string; encryptionKey: string }>(
      'POST',
      '/v1/w3s/users/token',
      { userId }
    )
    const { userToken, encryptionKey } = tokenRes.data

    // Check whether the user already has a wallet on Arc Testnet
    const walletRes = await circle<{
      wallets?: Array<{ id: string; address: string; blockchain: string }>
    }>('GET', '/v1/w3s/wallets?pageSize=10', undefined, userToken)

    const arcWallets = (walletRes.data.wallets ?? []).filter(
      (w) => w.blockchain === 'ARC-TESTNET'
    )

    if (arcWallets.length > 0) {
      // Returning user — no challenge needed
      const email = payload.email
      if (email) registerUser(email, arcWallets[0].address)
      res.json({
        userToken,
        encryptionKey,
        walletId: arcWallets[0].id,
        walletAddress: arcWallets[0].address,
        isNewUser: false,
      })
      return
    }

    // New user — initialise with wallet creation on Arc Testnet
    // This returns a challengeId that the browser SDK must execute (PIN setup)
    const initRes = await circle<{ challengeId: string }>(
      'POST',
      '/v1/w3s/user/initialize',
      {
        idempotencyKey: randomUUID(),
        blockchains: ['ARC-TESTNET'],
      },
      userToken
    )

    // Return the email so the frontend can send it back after PIN setup
    res.json({
      userToken,
      encryptionKey,
      challengeId: initRes.data.challengeId,
      email: payload.email ?? null,
      isNewUser: true,
    })
  } catch (err) {
    console.error('/api/auth/google error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

/**
 * GET /api/users/reverse-lookup?address=0x...
 * Resolves a wallet address to the email registered in SANWO.
 * Returns 404 if no email is mapped to that address.
 */
app.get('/api/users/reverse-lookup', (req, res) => {
  const address = (req.query.address as string ?? '').toLowerCase().trim()
  if (!address) return res.status(400).json({ error: 'address query param required' })

  const entry = Object.entries(registry).find(([, addr]) => addr.toLowerCase() === address)
  if (!entry) return res.status(404).json({ error: 'No SANWO user found for that address' })

  res.json({ email: entry[0] })
})

/**
 * GET /api/users/lookup?email=user@example.com
 * Resolves an email address to a SANWO wallet address.
 * Returns 404 if the user hasn't signed up yet.
 */
app.get('/api/users/lookup', (req, res) => {
  const email = (req.query.email as string ?? '').toLowerCase().trim()
  if (!email) return res.status(400).json({ error: 'email query param required' })

  const walletAddress = registry[email]
  if (!walletAddress) {
    return res.status(404).json({ error: `${email} hasn't signed up for SANWO yet` })
  }
  res.json({ walletAddress })
})

/**
 * GET /api/wallet
 * Returns the wallet ID and on-chain address for the authenticated user.
 * Requires X-User-Token header.
 */
app.get('/api/wallet', async (req, res) => {
  const userToken = req.headers['x-user-token'] as string
  const email = req.query.email as string | undefined
  try {
    const walletRes = await circle<{
      wallets?: Array<{ id: string; address: string; blockchain: string }>
    }>('GET', '/v1/w3s/wallets?pageSize=10', undefined, userToken)

    const arcWallets = (walletRes.data.wallets ?? []).filter(
      (w) => w.blockchain === 'ARC-TESTNET'
    )

    if (!arcWallets.length) {
      return res.status(404).json({ error: 'No Arc Testnet wallet found' })
    }

    // Register email → address so others can send to this user by email
    if (email) registerUser(email, arcWallets[0].address)

    res.json({ walletId: arcWallets[0].id, walletAddress: arcWallets[0].address })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

/**
 * POST /api/transfer
 * Creates a transfer challenge for the Circle Web SDK to execute.
 * The user must complete the PIN challenge in the browser to sign the tx.
 */
app.post('/api/transfer', async (req, res) => {
  const userToken = req.headers['x-user-token'] as string
  const { walletId, to, amount } = req.body as {
    walletId: string
    to: string
    amount: string
  }

  try {
    const body = {
      idempotencyKey: randomUUID(),
      walletId,
      destinationAddress: to,
      amounts: [amount],
      tokenAddress: '0x3600000000000000000000000000000000000000',
      blockchain: 'ARC-TESTNET',   // correct field name (not tokenBlockchain)
      feeLevel: 'MEDIUM',
    }

    console.log('Transfer request:', JSON.stringify(body))

    const transferRes = await circle<{ challengeId: string }>(
      'POST',
      '/v1/w3s/user/transactions/transfer',
      body,
      userToken
    )

    res.json({ challengeId: transferRes.data.challengeId })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

/**
 * GET /api/transactions
 * Returns recent transactions for a wallet from Circle's API.
 */
app.get('/api/transactions', async (req, res) => {
  const userToken = req.headers['x-user-token'] as string
  const { walletId } = req.query as { walletId: string }

  try {
    const txRes = await circle(
      'GET',
      `/v1/w3s/transactions?walletIds=${walletId}&pageSize=20`,
      undefined,
      userToken
    )
    res.json(txRes.data)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

// ─── Deposit routes ───────────────────────────────────────────────────────────

/**
 * GET /api/deposit/rate
 * Returns the current NGN → USDC exchange rate.
 */
app.get('/api/deposit/rate', async (_req, res) => {
  try {
    const rate = await fetchNgnRate()
    res.json({ rate, currency: 'NGN', per: 'USDC' })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

/**
 * POST /api/deposit/create
 * Creates (or retrieves) a Paystack dedicated virtual account for this user.
 * Body: { email: string }
 */
app.post('/api/deposit/create', async (req, res) => {
  const { email } = req.body as { email: string }
  if (!email) return res.status(400).json({ error: 'email is required' })

  const key = email.toLowerCase()

  // Return existing account if already created
  if (paystackAccounts[key]) {
    const rate = await fetchNgnRate().catch(() => 1650)
    return res.json({ ...paystackAccounts[key], rate })
  }

  try {
    // 1. Create Paystack customer
    const customer = await paystack<{ customer_code: string }>('POST', '/customer', {
      email,
      first_name: email.split('@')[0],
      last_name: 'User',
    })

    // 2. Assign a dedicated virtual account (use 'test-bank' in sandbox)
    const dva = await paystack<{
      account_number: string
      bank: { name: string }
    }>('POST', '/dedicated_account', {
      customer: customer.customer_code,
      preferred_bank: PAYSTACK_SECRET_KEY.startsWith('sk_test') ? 'test-bank' : 'wema-bank',
    })

    const account: PaystackAccount = {
      customerCode: customer.customer_code,
      accountNumber: dva.account_number,
      bankName: dva.bank.name,
    }

    savePaystackAccount(key, account)

    const rate = await fetchNgnRate().catch(() => 1650)
    res.json({ ...account, rate })
  } catch (err) {
    console.error('/api/deposit/create error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

/**
 * POST /api/deposit/initialize
 * Creates a Paystack standard checkout session.
 * Body: { email, ngnAmount, walletAddress, callbackUrl }
 */
app.post('/api/deposit/initialize', async (req, res) => {
  const { email, ngnAmount, walletAddress, callbackUrl } = req.body as {
    email: string
    ngnAmount: number
    walletAddress: string
    callbackUrl: string
  }

  if (!email || !ngnAmount || !walletAddress) {
    return res.status(400).json({ error: 'email, ngnAmount, and walletAddress are required' })
  }

  try {
    const data = await paystack<{ authorization_url: string; reference: string }>(
      'POST',
      '/transaction/initialize',
      {
        email,
        amount: Math.round(ngnAmount * 100), // kobo
        callback_url: callbackUrl,
        metadata: { walletAddress, ngnAmount },
      }
    )
    res.json({ authorizationUrl: data.authorization_url, reference: data.reference })
  } catch (err) {
    console.error('/api/deposit/initialize error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

/**
 * GET /api/deposit/verify?reference=xxx
 * Verifies a completed Paystack transaction and sends USDC from treasury.
 */
app.get('/api/deposit/verify', async (req, res) => {
  const reference = (req.query.reference as string ?? '').trim()
  if (!reference) return res.status(400).json({ error: 'reference is required' })

  try {
    const tx = await paystack<{
      status: string
      amount: number
      metadata: { walletAddress: string; ngnAmount: number }
    }>('GET', `/transaction/verify/${reference}`)

    if (tx.status !== 'success') {
      return res.status(400).json({ error: `Transaction status: ${tx.status}` })
    }

    const ngnAmount = tx.amount / 100
    const walletAddress = tx.metadata?.walletAddress
    if (!walletAddress) return res.status(400).json({ error: 'No wallet address in transaction metadata' })

    const rate = await fetchNgnRate().catch(() => 1650)
    const usdcAmount = (ngnAmount / rate).toFixed(2)

    console.log(`Verified deposit: ₦${ngnAmount} → ${usdcAmount} USDC to ${walletAddress}`)

    const txId = await sendFromTreasury(walletAddress, usdcAmount)
    res.json({ success: true, usdcAmount, txId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('/api/deposit/verify error:', msg)
    const friendly = msg.toLowerCase().includes('insufficient')
      ? 'The treasury wallet is temporarily low on funds. Your NGN payment was received — please contact support to complete your USDC credit.'
      : msg
    res.status(500).json({ error: friendly })
  }
})

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT ?? 3001
app.listen(PORT, () =>
  console.log(`SANWO server → http://localhost:${PORT}`)
)
