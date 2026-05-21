import { useState } from 'react'
import { Loader2, Lock, AlertCircle } from 'lucide-react'
import { useWallet } from '../../context/WalletContext'

interface Props {
  onBack: () => void
  onCreate: (amount: string, unlockDate: Date) => Promise<void>
}

const DURATIONS = [
  { label: '30 days', days: 30 },
  { label: '60 days', days: 60 },
  { label: '90 days', days: 90 },
]

function addDays(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d
}

function toInputDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

export default function CreateVault({ onBack, onCreate }: Props) {
  const { usdcBalance } = useWallet()
  const [amount, setAmount] = useState('')
  const [selectedDays, setSelectedDays] = useState<number | null>(30)
  const [customDate, setCustomDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const minDateStr = toInputDate(addDays(7))

  const unlockDate: Date | null =
    selectedDays !== null ? addDays(selectedDays) : customDate ? new Date(customDate) : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) { setError('Enter a valid amount'); return }
    if (amountNum > parseFloat(usdcBalance)) { setError('Insufficient balance'); return }
    if (!unlockDate) { setError('Select a lock duration or custom date'); return }

    setLoading(true)
    try {
      await onCreate(amount, unlockDate)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create vault')
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Loader2 size={32} className="animate-spin text-blue-600 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">Setting up your vault…</p>
          <p className="text-slate-400 text-sm mt-1">Complete the PIN prompt to lock your funds</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-6 md:px-6 md:py-8">
        <button
          onClick={onBack}
          className="text-sm text-slate-500 hover:text-slate-700 mb-5 flex items-center gap-1 transition-colors"
        >
          ← Back
        </button>

        <h2 className="text-xl font-bold text-slate-900 mb-1">Create a Vault</h2>
        <p className="text-slate-400 text-sm mb-6">Lock USDC until your chosen date</p>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Amount */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5">
            <label className="text-sm font-semibold text-slate-700 block mb-2">Amount (USDC)</label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="flex-1 text-2xl font-bold text-slate-900 bg-transparent outline-none placeholder-slate-300"
              />
              <button
                type="button"
                onClick={() => setAmount(usdcBalance)}
                className="text-xs text-blue-600 hover:underline font-medium"
              >
                Max
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-2">Available: {usdcBalance} USDC</p>
          </div>

          {/* Duration */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5">
            <label className="text-sm font-semibold text-slate-700 block mb-3">Lock Duration</label>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {DURATIONS.map(({ label, days }) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => { setSelectedDays(days); setCustomDate('') }}
                  className={`py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    selectedDays === days
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Custom date</label>
              <input
                type="date"
                min={minDateStr}
                value={customDate}
                onChange={(e) => { setCustomDate(e.target.value); setSelectedDays(null) }}
                className="w-full bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-700 border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Preview */}
          {unlockDate && parseFloat(amount) > 0 && (
            <div className="bg-blue-50 rounded-2xl border border-blue-100 p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Summary</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Locking</span>
                  <span className="font-semibold text-slate-900">{amount} USDC</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Unlock date</span>
                  <span className="font-semibold text-slate-900">{unlockDate.toLocaleDateString()}</span>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-blue-100 flex items-start gap-2 text-xs text-amber-700">
                <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
                <span>Early withdrawal incurs a 5% penalty on the locked amount.</span>
              </div>
            </div>
          )}

          {error && (
            <p className="text-red-500 text-sm flex items-center gap-1.5">
              <AlertCircle size={14} /> {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!amount || !unlockDate}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl py-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Lock size={16} />
            Lock Funds
          </button>
        </form>
      </div>
    </div>
  )
}
