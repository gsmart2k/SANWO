import { AlertTriangle } from 'lucide-react'
import type { Vault } from '../../hooks/useVault'

interface Props {
  vault: Vault
  penaltyRate: number
  onCancel: () => void
  onConfirm: () => void
}

export default function EarlyWithdrawModal({ vault, penaltyRate, onCancel, onConfirm }: Props) {
  const amount = parseFloat(vault.amount)
  const penalty = parseFloat((amount * penaltyRate).toFixed(2))
  const returning = parseFloat((amount - penalty).toFixed(2))

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={20} className="text-amber-600" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Break Vault Early?</h2>
        </div>

        <p className="text-slate-500 text-sm mb-5">
          Your vault is still locked until{' '}
          <strong className="text-slate-700">
            {new Date(vault.unlockDate).toLocaleDateString()}
          </strong>
          . Early withdrawal incurs a 5% penalty.
        </p>

        <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm mb-5">
          <div className="flex justify-between">
            <span className="text-slate-500">Amount locked</span>
            <span className="font-medium text-slate-900">{vault.amount} USDC</span>
          </div>
          <div className="flex justify-between text-red-500">
            <span>Penalty ({Math.round(penaltyRate * 100)}%)</span>
            <span>− {penalty.toFixed(2)} USDC</span>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold">
            <span className="text-slate-700">You receive</span>
            <span className="text-slate-900">{returning.toFixed(2)} USDC</span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-red-600 hover:bg-red-700 text-white transition-colors"
          >
            Confirm Withdrawal
          </button>
        </div>
      </div>
    </div>
  )
}
