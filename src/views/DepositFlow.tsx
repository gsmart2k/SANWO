import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, Copy, Check, RefreshCw, Loader2, Building2, Info, CreditCard } from 'lucide-react'
import { useWallet } from '../context/WalletContext'

type Method = 'paystack' | 'nuban'

interface VirtualAccount {
  accountNumber: string
  bankName: string
  customerCode: string
}

export default function DepositFlow({ onBack }: { onBack: () => void }) {
  const { connectedAddress } = useWallet()

  const [method, setMethod] = useState<Method>('paystack')
  const [email, setEmail] = useState('')
  const [ngnAmount, setNgnAmount] = useState('')
  const [rate, setRate] = useState<number | null>(null)
  const [isRefreshingRate, setIsRefreshingRate] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [nubanAccount, setNubanAccount] = useState<VirtualAccount | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  const usdcEquivalent =
    rate && ngnAmount && !isNaN(parseFloat(ngnAmount))
      ? (parseFloat(ngnAmount) / rate).toFixed(2)
      : null

  const refreshRate = useCallback(async () => {
    setIsRefreshingRate(true)
    try {
      const res = await fetch('/api/deposit/rate')
      if (res.ok) {
        const data = await res.json() as { rate: number }
        setRate(data.rate)
      }
    } finally {
      setIsRefreshingRate(false)
    }
  }, [])

  useEffect(() => { refreshRate() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Paystack standard checkout ──────────────────────────────────────────────

  async function handlePaystack() {
    setError('')
    const amt = parseFloat(ngnAmount)
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Enter a valid email address')
      return
    }
    if (isNaN(amt) || amt < 100) {
      setError('Minimum deposit is ₦100')
      return
    }
    if (!connectedAddress) {
      setError('Wallet not connected')
      return
    }

    setIsLoading(true)
    try {
      const res = await fetch('/api/deposit/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          ngnAmount: amt,
          walletAddress: connectedAddress,
          callbackUrl: window.location.origin,
        }),
      })
      const data = await res.json() as { authorizationUrl?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed to initialize payment')
      window.location.href = data.authorizationUrl!
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setIsLoading(false)
    }
  }

  // ── NUBAN dedicated account ─────────────────────────────────────────────────

  async function handleNuban() {
    setError('')
    const e = email.trim().toLowerCase()
    if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      setError('Enter a valid email address')
      return
    }
    setIsLoading(true)
    try {
      const res = await fetch('/api/deposit/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: e }),
      })
      const data = await res.json() as VirtualAccount & { rate?: number; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed to create account')
      setNubanAccount(data)
      if (data.rate) setRate(data.rate)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }

  async function copyAccount() {
    if (!nubanAccount) return
    await navigator.clipboard.writeText(nubanAccount.accountNumber)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── Shared email + rate header ──────────────────────────────────────────────

  return (
    <div className="max-w-lg px-1">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 text-sm mb-6 transition-colors"
      >
        <ArrowLeft size={15} /> Back
      </button>

      <h2 className="text-xl font-semibold text-slate-900 mb-1">Deposit USDC</h2>
      <p className="text-slate-400 text-sm mb-5">Fund your wallet with a Nigerian bank transfer</p>

      {/* Rate bar */}
      <div className="flex items-center justify-between bg-blue-50 rounded-xl px-4 py-2.5 mb-5">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Info size={13} className="text-blue-500" />
          {rate
            ? <span>Rate: <strong className="text-slate-800">₦{Math.round(rate).toLocaleString()} = 1 USDC</strong></span>
            : <span className="text-slate-400">Fetching rate…</span>}
        </div>
        <button onClick={refreshRate} disabled={isRefreshingRate} className="text-blue-500 hover:text-blue-700 disabled:opacity-50">
          <RefreshCw size={13} className={isRefreshingRate ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Method tabs */}
      <div className="flex gap-2 mb-5">
        <button
          onClick={() => { setMethod('paystack'); setError('') }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
            method === 'paystack'
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
          }`}
        >
          <CreditCard size={15} /> Pay with Paystack
        </button>
        <button
          onClick={() => { setMethod('nuban'); setError('') }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
            method === 'nuban'
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
          }`}
        >
          <Building2 size={15} /> Bank Account
        </button>
      </div>

      {/* Email field (shared) */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Your email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setError('') }}
          placeholder="you@example.com"
          className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* ── Paystack checkout panel ── */}
      {method === 'paystack' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Amount (NGN)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">₦</span>
              <input
                type="number"
                value={ngnAmount}
                onChange={(e) => setNgnAmount(e.target.value)}
                placeholder="0"
                min="100"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 pl-8 pr-16 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">NGN</span>
            </div>
            {usdcEquivalent && (
              <p className="mt-1.5 text-sm text-slate-500">
                ≈ <strong className="text-blue-600">{usdcEquivalent} USDC</strong> will be credited to your wallet
              </p>
            )}
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            onClick={handlePaystack}
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-xl py-3 flex items-center justify-center gap-2 transition-colors"
          >
            {isLoading
              ? <><Loader2 size={16} className="animate-spin" /> Redirecting…</>
              : <><CreditCard size={16} /> Pay with Paystack</>}
          </button>

          <p className="text-xs text-slate-400 text-center">
            You'll be redirected to Paystack's secure checkout. After payment, USDC is sent to your wallet automatically.
          </p>
        </div>
      )}

      {/* ── NUBAN panel ── */}
      {method === 'nuban' && !nubanAccount && (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Get a dedicated bank account number — transfer any amount anytime and USDC is sent automatically.
          </p>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            onClick={handleNuban}
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-xl py-3 flex items-center justify-center gap-2 transition-colors"
          >
            {isLoading
              ? <><Loader2 size={16} className="animate-spin" /> Creating account…</>
              : <><Building2 size={16} /> Get my bank account number</>}
          </button>
        </div>
      )}

      {method === 'nuban' && nubanAccount && (
        <div className="space-y-4">
          <div className="bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden">
            <div className="px-5 py-3 bg-slate-100 border-b border-slate-200">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Your dedicated account</p>
            </div>
            <div className="divide-y divide-slate-100">
              <div className="flex justify-between items-center px-5 py-3.5">
                <span className="text-sm text-slate-500">Bank</span>
                <span className="text-sm font-medium text-slate-800">{nubanAccount.bankName}</span>
              </div>
              <div className="flex justify-between items-center px-5 py-3.5">
                <span className="text-sm text-slate-500">Account number</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono font-semibold text-slate-900 tracking-wider">
                    {nubanAccount.accountNumber}
                  </span>
                  <button onClick={copyAccount} className="text-slate-400 hover:text-blue-600 transition-colors">
                    {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
              <div className="flex justify-between items-center px-5 py-3.5">
                <span className="text-sm text-slate-500">Receiving wallet</span>
                <span className="text-xs font-mono text-slate-500">
                  {connectedAddress?.slice(0, 6)}…{connectedAddress?.slice(-4)}
                </span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Calculate USDC equivalent</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₦</span>
              <input
                type="number"
                value={ngnAmount}
                onChange={(e) => setNgnAmount(e.target.value)}
                placeholder="0"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 pl-8 pr-16 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">NGN</span>
            </div>
            {usdcEquivalent && (
              <p className="mt-1.5 text-sm text-slate-500">
                ≈ <strong className="text-blue-600">{usdcEquivalent} USDC</strong>
              </p>
            )}
          </div>

          <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 space-y-1">
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">How it works</p>
            <ol className="text-xs text-amber-800 space-y-0.5 list-decimal list-inside">
              <li>Transfer any NGN amount to the account above</li>
              <li>Payment is detected automatically</li>
              <li>USDC is credited to your wallet within minutes</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  )
}
