import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import { formatUnits } from 'viem'
import { publicClient, USDC_CONTRACT, formatUSDC } from '../lib/arcConfig'
import { initCircleSDK, executeChallenge } from '../lib/circleSDK'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Transaction {
  hash: string
  from: string
  to: string
  amount: string
  timestamp: number
  status: 'confirmed' | 'pending' | 'failed'
  direction: 'sent' | 'received'
}

export type AppView = 'dashboard' | 'terminal' | 'vault'
export type DashboardTab = 'balance' | 'send' | 'receive' | 'history' | 'deposit'

export interface SendPreset {
  to: string
  amount: string
}

interface CircleSession {
  userToken: string
  encryptionKey: string
  walletId: string
  walletAddress: string
}

interface WalletContextType {
  // Auth
  isAuthenticated: boolean
  isInitializing: boolean // true while PIN challenge is running for new users
  loginWithGoogle: (credential: string) => Promise<void>
  logout: () => void
  // Wallet
  connectedAddress: string | null
  walletId: string | null
  usdcBalance: string
  transactions: Transaction[]
  isLoading: boolean
  isRefreshing: boolean
  refreshBalance: () => Promise<void>
  refreshTransactions: () => Promise<void>
  addTransaction: (tx: Transaction) => void
  sendUSDC: (to: string, amount: string) => Promise<{ txHash: string }>
  estimateSend: (to: string, amount: string) => Promise<string>
  // Navigation (shared between Dashboard and Terminal)
  currentView: AppView
  setCurrentView: (v: AppView) => void
  dashboardTab: DashboardTab
  setDashboardTab: (t: DashboardTab) => void
  sendPreset: SendPreset | null
  setSendPreset: (p: SendPreset | null) => void
  userToken: string | null
}

// ─── Session persistence (sessionStorage) ────────────────────────────────────

const SESSION_KEY = 'sanwo_circle_session'

function loadSession(): CircleSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as CircleSession) : null
  } catch {
    return null
  }
}

function saveSession(s: CircleSession) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(s))
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY)
}

// ─── Chain data helpers ───────────────────────────────────────────────────────

async function fetchBalance(address: string): Promise<string> {
  const native = await publicClient.getBalance({ address: address as `0x${string}` })
  return formatUSDC(formatUnits(native, 18))
}

const ARCSCAN_API = 'https://testnet.arcscan.app/api'

async function fetchTransactions(address: string): Promise<Transaction[]> {
  const addr = address.toLowerCase()

  try {
    // ── 1. Native USDC transfers (value > 0) from ArcScan ──────────────────
    // Catches faucet drops, wallet-to-wallet native sends, and any transfer
    // that moves value without going through the ERC-20 interface.
    const [nativeRes, erc20Res] = await Promise.all([
      fetch(
        `${ARCSCAN_API}?module=account&action=txlist&address=${address}&sort=desc&limit=40`
      ).then((r) => r.json()),
      // ── 2. ERC-20 Transfer events (Circle Transfer API uses this path) ───
      fetch(
        `${ARCSCAN_API}?module=account&action=tokentx&address=${address}&contractaddress=${USDC_CONTRACT}&sort=desc&limit=40`
      ).then((r) => r.json()),
    ])

    interface ArcTx {
      hash: string; from: string; to: string; value: string
      timeStamp: string; txreceipt_status?: string; blockNumber?: string
    }

    const seen = new Set<string>()
    const txs: Transaction[] = []

    function pushTx(hash: string, from: string, to: string, rawValue: string, decimals: number, timestamp: string, status: string) {
      if (seen.has(hash)) return
      seen.add(hash)
      txs.push({
        hash,
        from,
        to,
        amount: formatUSDC(formatUnits(BigInt(rawValue), decimals)),
        timestamp: parseInt(timestamp, 10),
        status: status === '1' || status === '' ? 'confirmed' : 'failed',
        direction: from.toLowerCase() === addr ? 'sent' : 'received',
      })
    }

    // Native txs — only include ones that actually moved value (skip contract calls)
    for (const tx of (nativeRes.result ?? []) as ArcTx[]) {
      if (tx.value === '0' || tx.value === '') continue
      pushTx(tx.hash, tx.from, tx.to, tx.value, 18, tx.timeStamp, tx.txreceipt_status ?? '1')
    }

    // ERC-20 Transfer events — value is in 6-decimal USDC
    for (const tx of (erc20Res.result ?? []) as ArcTx[]) {
      pushTx(tx.hash, tx.from, tx.to, tx.value, 6, tx.timeStamp, '1')
    }

    return txs
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 20)
  } catch (err) {
    console.error('fetchTransactions error:', err)
    return []
  }
}

export function relativeTime(timestampSec: number): string {
  const diff = Math.floor(Date.now() / 1000) - timestampSec
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

// ─── Context ──────────────────────────────────────────────────────────────────

const WalletContext = createContext<WalletContextType | null>(null)

export function useWallet() {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet must be used inside WalletProvider')
  return ctx
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function WalletProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<CircleSession | null>(loadSession)
  const [isInitializing, setIsInitializing] = useState(false)
  const [usdcBalance, setUsdcBalance] = useState('0.00')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const [currentView, setCurrentView] = useState<AppView>('dashboard')
  const [dashboardTab, setDashboardTab] = useState<DashboardTab>('balance')
  const [sendPreset, setSendPreset] = useState<SendPreset | null>(null)

  const connectedAddress = session?.walletAddress ?? null
  const walletId = session?.walletId ?? null
  const isAuthenticated = !!session

  // ── Google login → Circle wallet ──────────────────────────────────────────
  const loginWithGoogle = useCallback(async (credential: string) => {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error((err as { error?: string }).error ?? 'Login failed')
    }

    const data = (await res.json()) as {
      userToken: string
      encryptionKey: string
      isNewUser: boolean
      challengeId?: string
      email?: string
      walletId?: string
      walletAddress?: string
    }

    // Initialise the Circle Web SDK with this session
    await initCircleSDK(data.userToken, data.encryptionKey)

    if (data.isNewUser && data.challengeId) {
      // New user — must complete PIN setup before wallet is usable
      setIsInitializing(true)
      try {
        await executeChallenge(data.challengeId)
      } finally {
        setIsInitializing(false)
      }

      // Fetch wallet created after PIN setup (pass email so server registers the mapping)
      const emailParam = data.email ? `?email=${encodeURIComponent(data.email)}` : ''
      const walletRes = await fetch(`/api/wallet${emailParam}`, {
        headers: { 'X-User-Token': data.userToken },
      })
      if (!walletRes.ok) throw new Error('Could not fetch wallet after initialization')
      const wallet = (await walletRes.json()) as { walletId: string; walletAddress: string }

      const newSession: CircleSession = {
        userToken: data.userToken,
        encryptionKey: data.encryptionKey,
        walletId: wallet.walletId,
        walletAddress: wallet.walletAddress,
      }
      saveSession(newSession)
      setSession(newSession)
    } else {
      const newSession: CircleSession = {
        userToken: data.userToken,
        encryptionKey: data.encryptionKey,
        walletId: data.walletId!,
        walletAddress: data.walletAddress!,
      }
      saveSession(newSession)
      setSession(newSession)
    }
  }, [])

  const logout = useCallback(() => {
    clearSession()
    setSession(null)
    setUsdcBalance('0.00')
    setTransactions([])
  }, [])

  // ── Balance & history ─────────────────────────────────────────────────────
  const refreshBalance = useCallback(async () => {
    if (!connectedAddress) return
    setIsRefreshing(true)
    try {
      setUsdcBalance(await fetchBalance(connectedAddress))
    } catch (err) {
      console.error('refreshBalance:', err)
    } finally {
      setIsRefreshing(false)
    }
  }, [connectedAddress])

  const refreshTransactions = useCallback(async () => {
    if (!connectedAddress) return
    try {
      setTransactions(await fetchTransactions(connectedAddress))
    } catch (err) {
      console.error('refreshTransactions:', err)
    }
  }, [connectedAddress])

  const addTransaction = useCallback((tx: Transaction) => {
    setTransactions((prev) => [tx, ...prev])
  }, [])

  // ── Send via Circle Transfer API ──────────────────────────────────────────
  const sendUSDC = useCallback(
    async (to: string, amount: string): Promise<{ txHash: string }> => {
      if (!session) throw new Error('Not authenticated')

      // 1. Create transfer challenge on the backend
      const res = await fetch('/api/transfer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Token': session.userToken,
        },
        body: JSON.stringify({ walletId: session.walletId, to, amount }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? 'Transfer failed')
      }
      const { challengeId } = (await res.json()) as { challengeId: string }

      // 2. User enters PIN in Circle's SDK UI
      await executeChallenge(challengeId)

      // 3. Poll the chain for the resulting Transfer event (Circle broadcasts async)
      const txHash = await pollForTxHash(session.walletAddress, amount)
      return { txHash }
    },
    [session]
  )

  // After the PIN challenge, Circle asynchronously broadcasts the tx.
  // Poll ArcScan for the most recent outbound tx from this address (up to ~15 s).
  async function pollForTxHash(fromAddress: string, _amount: string): Promise<string> {
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 1500))
      try {
        const res = await fetch(
          `${ARCSCAN_API}?module=account&action=txlist&address=${fromAddress}&sort=desc&limit=1`
        )
        const data = await res.json()
        const tx = data.result?.[0]
        if (tx?.hash) return tx.hash
      } catch {
        // ignore transient errors while polling
      }
    }
    return 'pending'
  }

  const estimateSend = useCallback(async (_to: string, _amount: string): Promise<string> => {
    // Arc gas fees are tiny (sub-cent USDC). Circle handles gas internally.
    return '< 0.01'
  }, [])

  // ── Bootstrap on mount (restore session) ─────────────────────────────────
  useEffect(() => {
    if (!session) return
    // Re-initialise the Circle SDK so it's ready to sign
    try { initCircleSDK(session.userToken, session.encryptionKey) } catch (e) { console.error(e) }
  }, [session?.userToken]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load wallet data when address becomes available ───────────────────────
  useEffect(() => {
    if (!connectedAddress) return
    setIsLoading(true)
    Promise.all([fetchBalance(connectedAddress), fetchTransactions(connectedAddress)])
      .then(([bal, txs]) => {
        setUsdcBalance(bal)
        setTransactions(txs)
      })
      .catch(console.error)
      .finally(() => setIsLoading(false))
  }, [connectedAddress])

  return (
    <WalletContext.Provider
      value={{
        isAuthenticated,
        isInitializing,
        loginWithGoogle,
        logout,
        connectedAddress,
        walletId,
        usdcBalance,
        transactions,
        isLoading,
        isRefreshing,
        refreshBalance,
        refreshTransactions,
        addTransaction,
        sendUSDC,
        estimateSend,
        currentView,
        setCurrentView,
        dashboardTab,
        setDashboardTab,
        sendPreset,
        setSendPreset,
        userToken: session?.userToken ?? null,
      }}
    >
      {children}
    </WalletContext.Provider>
  )
}
