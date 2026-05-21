import { useState, useEffect } from 'react'
import { PiggyBank, Lock, Unlock, Plus, Loader2 } from 'lucide-react'
import type { Vault } from '../../hooks/useVault'
import EarlyWithdrawModal from './EarlyWithdrawModal'

const PENALTY_RATE = 0.05

function daysRemaining(unlockDate: string): number {
  return Math.max(0, Math.ceil((new Date(unlockDate).getTime() - Date.now()) / 86_400_000))
}

function StatusBadge({ status }: { status: Vault['status'] }) {
  const styles: Record<Vault['status'], string> = {
    active: 'bg-blue-100 text-blue-700',
    unlocked: 'bg-green-100 text-green-700',
    withdrawn: 'bg-slate-100 text-slate-500',
    broken_early: 'bg-amber-100 text-amber-700',
    pending: 'bg-yellow-100 text-yellow-700',
  }
  const labels: Record<Vault['status'], string> = {
    active: 'Active',
    unlocked: 'Unlocked',
    withdrawn: 'Withdrawn',
    broken_early: 'Broken Early',
    pending: 'Pending',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  )
}

interface WithdrawResult { amountReturned: string; penaltyDeducted: string }

interface Props {
  vaults: Vault[]
  loading: boolean
  error: string | null
  onCreateNew: () => void
  onWithdraw: (vaultId: string) => Promise<{ amountReturned: string; penaltyDeducted: string; isEarly: boolean }>
}

export default function VaultDashboard({ vaults, loading, error, onCreateNew, onWithdraw }: Props) {
  const [ngnRate, setNgnRate] = useState<number | null>(null)
  const [earlyModal, setEarlyModal] = useState<Vault | null>(null)
  const [withdrawing, setWithdrawing] = useState<string | null>(null)
  const [withdrawResult, setWithdrawResult] = useState<WithdrawResult | null>(null)

  useEffect(() => {
    fetch('/api/deposit/rate')
      .then((r) => r.json())
      .then((d: { rate: number }) => setNgnRate(d.rate))
      .catch(() => {})
  }, [])

  async function handleWithdraw(vault: Vault) {
    setWithdrawing(vault.id)
    try {
      const result = await onWithdraw(vault.id)
      setWithdrawResult({ amountReturned: result.amountReturned, penaltyDeducted: result.penaltyDeducted })
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Withdrawal failed')
    } finally {
      setWithdrawing(null)
    }
  }

  const activeVaults = vaults.filter((v) => !['withdrawn', 'broken_early'].includes(v.status))
  const pastVaults = vaults.filter((v) => ['withdrawn', 'broken_early'].includes(v.status))

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-blue-600" />
      </div>
    )
  }

  if (withdrawResult) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 md:px-6 md:py-8">
          <div className="bg-white rounded-2xl border border-slate-100 p-6 sm:p-10 text-center">
            <div className="text-5xl mb-4">✅</div>
            <h2 className="text-xl font-semibold text-slate-900 mb-2">Withdrawal successful</h2>
            <p className="text-slate-500 text-sm">
              <strong className="text-blue-600">{withdrawResult.amountReturned} USDC</strong> is on its way to your wallet.
            </p>
            {parseFloat(withdrawResult.penaltyDeducted) > 0 && (
              <p className="text-amber-600 text-xs mt-1">{withdrawResult.penaltyDeducted} USDC early-withdrawal penalty deducted.</p>
            )}
            <button
              onClick={() => setWithdrawResult(null)}
              className="mt-6 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl px-6 py-2.5 transition-colors"
            >
              Back to Vault
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-6 md:px-6 md:py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <PiggyBank size={24} className="text-blue-600" />
              Sanwo Vault
            </h1>
            <p className="text-slate-400 text-sm mt-0.5">Lock USDC and earn discipline</p>
          </div>
          <button
            onClick={onCreateNew}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl px-4 py-2 text-sm transition-colors"
          >
            <Plus size={16} />
            New Vault
          </button>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">{error}</div>
        )}

        {vaults.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
            <PiggyBank size={40} className="text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No vaults yet</p>
            <p className="text-slate-400 text-sm mt-1">Lock USDC for 30, 60, or 90 days</p>
            <button
              onClick={onCreateNew}
              className="mt-5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl px-5 py-2.5 text-sm transition-colors"
            >
              Create your first vault
            </button>
          </div>
        ) : (
          <>
            {/* Active vaults */}
            {activeVaults.length > 0 && (
              <div className="space-y-4 mb-6">
                {activeVaults.map((vault) => {
                  const days = daysRemaining(vault.unlockDate)
                  const canWithdraw = vault.status === 'unlocked'
                  const isWithdrawing = withdrawing === vault.id
                  const ngnEquiv = ngnRate
                    ? (parseFloat(vault.amount) * ngnRate).toLocaleString('en-NG', {
                        style: 'currency',
                        currency: 'NGN',
                        maximumFractionDigits: 0,
                      })
                    : null

                  return (
                    <div key={vault.id} className="bg-white rounded-2xl border border-slate-100 p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          {vault.name && (
                            <div className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-1">{vault.name}</div>
                          )}
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-2xl font-bold text-slate-900">{vault.amount}</span>
                            <span className="text-slate-500 font-medium">USDC</span>
                          </div>
                          {ngnEquiv && <div className="text-slate-400 text-xs mt-0.5">≈ {ngnEquiv}</div>}
                        </div>
                        <StatusBadge status={vault.status} />
                      </div>

                      <div className="flex items-center gap-4 text-sm text-slate-500 mb-4">
                        {canWithdraw ? (
                          <span className="flex items-center gap-1 text-green-600 font-medium">
                            <Unlock size={14} /> Ready to withdraw
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <Lock size={14} />
                            {days} day{days !== 1 ? 's' : ''} remaining
                          </span>
                        )}
                        <span className="text-slate-200">·</span>
                        <span>Unlocks {new Date(vault.unlockDate).toLocaleDateString()}</span>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => handleWithdraw(vault)}
                          disabled={!canWithdraw || isWithdrawing}
                          className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors bg-green-600 hover:bg-green-700 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {isWithdrawing ? (
                            <Loader2 size={14} className="animate-spin mx-auto" />
                          ) : (
                            'Withdraw'
                          )}
                        </button>
                        {vault.status === 'active' && (
                          <button
                            onClick={() => setEarlyModal(vault)}
                            disabled={isWithdrawing}
                            className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors border border-amber-200 text-amber-700 hover:bg-amber-50 disabled:opacity-40"
                          >
                            Break Early
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Past vaults */}
            {pastVaults.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-slate-500 mb-3">Past Vaults</h3>
                <div className="space-y-3">
                  {pastVaults.map((vault) => (
                    <div
                      key={vault.id}
                      className="bg-slate-50 rounded-xl border border-slate-100 px-4 py-3 flex items-center justify-between"
                    >
                      <div>
                        {vault.name && <div className="text-xs font-semibold text-slate-500 mb-0.5">{vault.name}</div>}
                        <span className="text-slate-700 font-medium text-sm">{vault.amount} USDC</span>
                        <div className="text-slate-400 text-xs mt-0.5">
                          {new Date(vault.lockDate).toLocaleDateString()} →{' '}
                          {new Date(vault.unlockDate).toLocaleDateString()}
                        </div>
                      </div>
                      <StatusBadge status={vault.status} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {earlyModal && (
        <EarlyWithdrawModal
          vault={earlyModal}
          penaltyRate={PENALTY_RATE}
          onCancel={() => setEarlyModal(null)}
          onConfirm={() => {
            const vault = earlyModal
            setEarlyModal(null)
            handleWithdraw(vault)
          }}
        />
      )}
    </div>
  )
}
