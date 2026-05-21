import { RefreshCw, ExternalLink, ArrowUpRight, ArrowDownLeft } from 'lucide-react'
import { useWallet, relativeTime } from '../context/WalletContext'
import { truncateAddress, EXPLORER_BASE } from '../lib/arcConfig'

const STATUS_COLORS = {
  confirmed: 'bg-green-50 text-green-700',
  pending: 'bg-amber-50 text-amber-700',
  failed: 'bg-red-50 text-red-700',
}

export default function History() {
  const { transactions, refreshTransactions, isRefreshing } = useWallet()

  return (
    <div className="max-w-2xl px-1">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-slate-900">Transaction history</h2>
        <button
          onClick={refreshTransactions}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {transactions.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 py-16 flex flex-col items-center gap-3">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center">
            <ArrowUpRight size={20} className="text-slate-400" />
          </div>
          <p className="text-slate-500 text-sm">No transactions yet</p>
          <p className="text-slate-400 text-xs">Your transfers will appear here</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 divide-y divide-slate-50 overflow-hidden">
          {transactions.map((tx) => (
            <a
              key={tx.hash}
              href={`${EXPLORER_BASE}/tx/${tx.hash}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors group"
            >
              {/* Direction icon */}
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                  tx.direction === 'received'
                    ? 'bg-green-50 text-green-600'
                    : 'bg-red-50 text-red-500'
                }`}
              >
                {tx.direction === 'received' ? (
                  <ArrowDownLeft size={16} />
                ) : (
                  <ArrowUpRight size={16} />
                )}
              </div>

              {/* Address */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-800 font-mono">
                  {tx.direction === 'received'
                    ? truncateAddress(tx.from)
                    : truncateAddress(tx.to)}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">{relativeTime(tx.timestamp)}</div>
              </div>

              {/* Amount */}
              <div className="text-right flex-shrink-0">
                <div
                  className={`text-sm font-semibold ${
                    tx.direction === 'received' ? 'text-green-600' : 'text-red-500'
                  }`}
                >
                  {tx.direction === 'received' ? '+' : '-'}
                  {tx.amount} USDC
                </div>
                <span
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${STATUS_COLORS[tx.status]}`}
                >
                  {tx.status}
                </span>
              </div>

              <ExternalLink
                size={13}
                className="text-slate-300 group-hover:text-slate-400 flex-shrink-0 transition-colors"
              />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
