import { useState } from 'react'
import { Copy, Check, RefreshCw, Send, QrCode, Clock, Loader2, ArrowDownToLine, ArrowLeftRight } from 'lucide-react'
import { useWallet } from '../context/WalletContext'
import { truncateAddress } from '../lib/arcConfig'
import SendFlow from './SendFlow'
import Receive from './Receive'
import History from './History'
import DepositFlow from './DepositFlow'
import BridgeFlow from './BridgeFlow'

type Tab = 'balance' | 'send' | 'receive' | 'history' | 'deposit' | 'bridge'

function BalanceCard() {
  const { usdcBalance, connectedAddress, refreshBalance, isRefreshing, isLoading } = useWallet()
  const [copied, setCopied] = useState(false)

  async function copyAddress() {
    if (!connectedAddress) return
    await navigator.clipboard.writeText(connectedAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-6 text-white">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-blue-100 text-sm font-medium mb-1">USDC Balance</p>
          {isLoading ? (
            <div className="flex items-center gap-2">
              <Loader2 size={18} className="animate-spin text-blue-200" />
              <span className="text-blue-200 text-sm">Loading…</span>
            </div>
          ) : (
            <div className="flex items-baseline gap-1.5">
              <span className="text-4xl font-bold tracking-tight">{usdcBalance}</span>
              <span className="text-blue-200 text-lg font-medium">USDC</span>
            </div>
          )}
        </div>
        <button
          onClick={refreshBalance}
          disabled={isRefreshing}
          className="p-2 rounded-lg bg-blue-500/30 hover:bg-blue-500/50 transition-colors disabled:opacity-50"
          title="Refresh balance"
        >
          <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {connectedAddress && (
        <div className="flex items-center gap-2 bg-blue-500/30 rounded-lg px-3 py-2">
          <span className="text-blue-100 text-xs font-mono flex-1">
            {truncateAddress(connectedAddress)}
          </span>
          <button
            onClick={copyAddress}
            className="text-blue-200 hover:text-white transition-colors"
            title="Copy address"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
      )}
    </div>
  )
}

function QuickActions({ onSelect }: { onSelect: (tab: Tab) => void }) {
  const actions = [
    { id: 'send' as const, label: 'Send', icon: Send, color: 'bg-blue-50 text-blue-600 hover:bg-blue-100' },
    { id: 'receive' as const, label: 'Receive', icon: QrCode, color: 'bg-green-50 text-green-600 hover:bg-green-100' },
    { id: 'deposit' as const, label: 'Deposit', icon: ArrowDownToLine, color: 'bg-purple-50 text-purple-600 hover:bg-purple-100' },
    { id: 'bridge' as const, label: 'Bridge', icon: ArrowLeftRight, color: 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100' },
    { id: 'history' as const, label: 'History', icon: Clock, color: 'bg-slate-100 text-slate-600 hover:bg-slate-200' },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      {actions.map(({ id, label, icon: Icon, color }) => (
        <button
          key={id}
          onClick={() => onSelect(id)}
          className={`flex flex-col items-center gap-2 py-4 px-2 rounded-xl font-medium text-sm transition-colors ${color}`}
        >
          <Icon size={20} />
          {label}
        </button>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const { dashboardTab, setDashboardTab } = useWallet()
  const tab = dashboardTab

  function showTab(t: Tab) {
    setDashboardTab(t)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-6 md:px-6 md:py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-400 text-sm mt-0.5">Arc Testnet</p>
        </div>

        {/* Always visible: balance card + quick actions */}
        {tab === 'balance' && (
          <>
            <BalanceCard />
            <div className="mt-4">
              <QuickActions onSelect={showTab} />
            </div>

            {/* Mini recent transactions */}
            <RecentTransactions onShowAll={() => showTab('history')} />
          </>
        )}

        {tab === 'send' && (
          <SendFlow onBack={() => showTab('balance')} />
        )}

        {tab === 'receive' && (
          <>
            <button
              onClick={() => showTab('balance')}
              className="text-sm text-slate-500 hover:text-slate-700 mb-5 flex items-center gap-1 transition-colors"
            >
              ← Back
            </button>
            <Receive />
          </>
        )}

        {tab === 'history' && (
          <>
            <button
              onClick={() => showTab('balance')}
              className="text-sm text-slate-500 hover:text-slate-700 mb-5 flex items-center gap-1 transition-colors"
            >
              ← Back
            </button>
            <History />
          </>
        )}

        {tab === 'deposit' && (
          <DepositFlow onBack={() => showTab('balance')} />
        )}

        {tab === 'bridge' && (
          <BridgeFlow onBack={() => showTab('balance')} />
        )}
      </div>
    </div>
  )
}

function RecentTransactions({ onShowAll }: { onShowAll: () => void }) {
  const { transactions } = useWallet()
  const recent = transactions.slice(0, 3)

  if (recent.length === 0) return null

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700">Recent</h3>
        <button
          onClick={onShowAll}
          className="text-xs text-blue-600 hover:underline"
        >
          View all
        </button>
      </div>
      <div className="bg-white rounded-xl border border-slate-100 divide-y divide-slate-50 overflow-hidden">
        {recent.map((tx) => (
          <a
            key={tx.hash}
            href={`https://testnet.arcscan.app/tx/${tx.hash}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
          >
            <div>
              <div className="text-xs font-mono text-slate-600">
                {tx.direction === 'received'
                  ? truncateAddress(tx.from)
                  : truncateAddress(tx.to)}
              </div>
              <div className="text-[11px] text-slate-400">
                {new Date(tx.timestamp * 1000).toLocaleDateString()}
              </div>
            </div>
            <span
              className={`text-sm font-semibold ${
                tx.direction === 'received' ? 'text-green-600' : 'text-red-500'
              }`}
            >
              {tx.direction === 'received' ? '+' : '-'}
              {tx.amount} USDC
            </span>
          </a>
        ))}
      </div>
    </div>
  )
}
