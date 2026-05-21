import { useState, useEffect } from 'react'
import { ArrowLeft, Send, CheckCircle, XCircle, ExternalLink, Loader2, AtSign, Wallet } from 'lucide-react'
import { useWallet } from '../context/WalletContext'
import { EXPLORER_BASE, truncateAddress, formatUSDC } from '../lib/arcConfig'

type Step = 'input' | 'confirm' | 'result'

interface SendResult {
  success: boolean
  txHash?: string
  error?: string
}

function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
}

function isAddress(v: string) {
  return /^0x[0-9a-fA-F]{40}$/.test(v.trim())
}

export default function SendFlow({ onBack }: { onBack: () => void }) {
  const { sendUSDC, estimateSend, addTransaction, refreshBalance, connectedAddress, sendPreset, setSendPreset } = useWallet()

  const [step, setStep] = useState<Step>('input')
  const [recipient, setRecipient] = useState('')   // email OR address typed by user
  const [resolvedAddress, setResolvedAddress] = useState('')  // always an 0x address
  const [resolvedLabel, setResolvedLabel] = useState('')      // display name (email or truncated addr)
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [gasFee, setGasFee] = useState('…')
  const [isResolving, setIsResolving] = useState(false)
  const [isEstimating, setIsEstimating] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [result, setResult] = useState<SendResult | null>(null)
  const [inputError, setInputError] = useState('')

  // If the terminal pre-filled a send, jump straight to confirm
  useEffect(() => {
    if (!sendPreset) return
    const { to, amount: presetAmount } = sendPreset
    setRecipient(to)
    setAmount(presetAmount)
    setSendPreset(null)

    if (isAddress(to)) {
      setResolvedAddress(to)
      setResolvedLabel(truncateAddress(to))
      setStep('confirm')
    } else if (isEmail(to)) {
      setIsResolving(true)
      fetch(`/api/users/lookup?email=${encodeURIComponent(to)}`)
        .then((r) => (r.ok ? r.json() : r.json().then((e: { error?: string }) => Promise.reject(e.error ?? 'Not found'))))
        .then(({ walletAddress }: { walletAddress: string }) => {
          setResolvedAddress(walletAddress)
          setResolvedLabel(to)
          setStep('confirm')
        })
        .catch((msg: string) => {
          setInputError(typeof msg === 'string' ? msg : `${to} hasn't signed up for SANWO yet`)
        })
        .finally(() => setIsResolving(false))
    }
  }, [sendPreset, setSendPreset])

  // Estimate gas whenever we reach the confirm step
  useEffect(() => {
    if (step !== 'confirm' || !resolvedAddress || !amount) return
    setIsEstimating(true)
    estimateSend(resolvedAddress, amount)
      .then((fee) => setGasFee(fee))
      .catch(() => setGasFee('< 0.01'))
      .finally(() => setIsEstimating(false))
  }, [step, resolvedAddress, amount, estimateSend])

  async function resolveRecipient(): Promise<boolean> {
    const value = recipient.trim()
    setInputError('')

    if (isAddress(value)) {
      setResolvedAddress(value)
      setResolvedLabel(truncateAddress(value))
      return true
    }

    if (isEmail(value)) {
      setIsResolving(true)
      try {
        const res = await fetch(`/api/users/lookup?email=${encodeURIComponent(value)}`)
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          setInputError((err as { error?: string }).error ?? `${value} hasn't signed up for SANWO yet`)
          return false
        }
        const { walletAddress } = await res.json() as { walletAddress: string }
        setResolvedAddress(walletAddress)
        setResolvedLabel(value)   // show the email in the confirm screen
        return true
      } catch {
        setInputError('Could not look up that email. Try again.')
        return false
      } finally {
        setIsResolving(false)
      }
    }

    setInputError('Enter a valid email address or wallet address (0x…)')
    return false
  }

  async function handleNext() {
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) {
      setInputError('Enter a valid amount')
      return
    }
    if (!recipient.trim()) {
      setInputError('Enter a recipient')
      return
    }
    const ok = await resolveRecipient()
    if (ok) setStep('confirm')
  }

  async function handleSend() {
    setIsSending(true)
    try {
      const { txHash } = await sendUSDC(resolvedAddress, amount)
      addTransaction({
        hash: txHash,
        from: connectedAddress ?? '',
        to: resolvedAddress,
        amount: formatUSDC(amount),
        timestamp: Math.floor(Date.now() / 1000),
        status: 'confirmed',
        direction: 'sent',
      })
      await refreshBalance()
      setResult({ success: true, txHash })
    } catch (err) {
      setResult({ success: false, error: err instanceof Error ? err.message : String(err) })
    } finally {
      setIsSending(false)
      setStep('result')
    }
  }

  // ── Input step ────────────────────────────────────────────────────────────

  if (step === 'input') {
    return (
      <div className="max-w-lg px-1">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 text-sm mb-6 transition-colors"
        >
          <ArrowLeft size={15} /> Back
        </button>

        <h2 className="text-xl font-semibold text-slate-900 mb-6">Send USDC</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Recipient
            </label>
            {/* Toggle hint */}
            <div className="flex gap-2 mb-2">
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <AtSign size={11} /> Email
              </span>
              <span className="text-xs text-slate-300">or</span>
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <Wallet size={11} /> Wallet address
              </span>
            </div>
            <input
              type="text"
              value={recipient}
              onChange={(e) => { setRecipient(e.target.value); setInputError('') }}
              placeholder="friend@gmail.com or 0x..."
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Amount (USDC)
            </label>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 pr-16 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400">
                USDC
              </span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Memo <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="What's this for?"
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {inputError && <p className="text-red-500 text-sm">{inputError}</p>}

          <button
            onClick={handleNext}
            disabled={isResolving}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-xl py-3 flex items-center justify-center gap-2 transition-colors"
          >
            {isResolving ? (
              <><Loader2 size={16} className="animate-spin" /> Looking up…</>
            ) : (
              <><Send size={16} /> Review transfer</>
            )}
          </button>
        </div>
      </div>
    )
  }

  // ── Confirm step ──────────────────────────────────────────────────────────

  if (step === 'confirm') {
    return (
      <div className="max-w-lg px-1">
        <button
          onClick={() => setStep('input')}
          className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 text-sm mb-6 transition-colors"
        >
          <ArrowLeft size={15} /> Back
        </button>

        <h2 className="text-xl font-semibold text-slate-900 mb-6">Confirm transfer</h2>

        <div className="bg-slate-50 rounded-2xl border border-slate-100 divide-y divide-slate-100">
          <div className="flex justify-between items-start px-5 py-4">
            <span className="text-sm text-slate-500">To</span>
            <div className="text-right">
              <div className="text-sm font-medium text-slate-800">{resolvedLabel}</div>
              {/* If we resolved an email, also show the address */}
              {isEmail(recipient.trim()) && (
                <div className="text-xs text-slate-400 font-mono mt-0.5">
                  {truncateAddress(resolvedAddress)}
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-between items-center px-5 py-4">
            <span className="text-sm text-slate-500">Amount</span>
            <span className="text-sm font-semibold text-slate-900">{formatUSDC(amount)} USDC</span>
          </div>
          {memo && (
            <div className="flex justify-between items-center px-5 py-4">
              <span className="text-sm text-slate-500">Memo</span>
              <span className="text-sm text-slate-700">{memo}</span>
            </div>
          )}
          <div className="flex justify-between items-center px-5 py-4">
            <span className="text-sm text-slate-500">Est. gas fee</span>
            <span className="text-sm text-slate-700">
              {isEstimating
                ? <span className="flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> Estimating…</span>
                : `${gasFee} USDC`}
            </span>
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button
            onClick={() => setStep('input')}
            className="flex-1 border border-slate-200 text-slate-700 font-medium rounded-xl py-3 hover:bg-slate-50 transition-colors"
          >
            Back
          </button>
          <button
            onClick={handleSend}
            disabled={isSending}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-xl py-3 flex items-center justify-center gap-2 transition-colors"
          >
            {isSending
              ? <><Loader2 size={16} className="animate-spin" /> Sending…</>
              : <><Send size={16} /> Confirm & Send</>}
          </button>
        </div>
      </div>
    )
  }

  // ── Result step ───────────────────────────────────────────────────────────

  if (!result) return null

  return (
    <div className="max-w-lg px-1">
      <div className="flex flex-col items-center py-8 text-center">
        {result.success ? (
          <>
            <CheckCircle size={52} className="text-green-500 mb-4" />
            <h2 className="text-xl font-semibold text-slate-900 mb-1">Transfer sent!</h2>
            <p className="text-slate-500 text-sm mb-6">
              {formatUSDC(amount)} USDC sent to <span className="font-medium">{resolvedLabel}</span>
            </p>
            {result.txHash && result.txHash !== 'pending' && (
              <a
                href={`${EXPLORER_BASE}/tx/${result.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-blue-600 hover:underline text-sm mb-8"
              >
                View on ArcScan <ExternalLink size={13} />
              </a>
            )}
          </>
        ) : (
          <>
            <XCircle size={52} className="text-red-500 mb-4" />
            <h2 className="text-xl font-semibold text-slate-900 mb-1">Transfer failed</h2>
            <p className="text-slate-500 text-sm mb-8 max-w-xs">{result.error}</p>
          </>
        )}
        <button
          onClick={onBack}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl px-6 py-3 transition-colors"
        >
          Back to dashboard
        </button>
      </div>
    </div>
  )
}
