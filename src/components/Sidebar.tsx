import { LayoutDashboard, Terminal, LogOut, PiggyBank } from 'lucide-react'
import { useWallet } from '../context/WalletContext'
import { truncateAddress } from '../lib/arcConfig'

export default function Sidebar() {
  const { currentView, setCurrentView, connectedAddress, logout } = useWallet()

  const navItems = [
    { id: 'dashboard' as const, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'terminal' as const, label: 'Terminal', icon: Terminal },
    { id: 'vault' as const, label: 'Vault', icon: PiggyBank },
  ]

  return (
    <aside className="hidden md:flex w-60 flex-shrink-0 bg-slate-900 flex-col h-full">
      {/* Brand */}
      <div className="px-5 py-6 border-b border-slate-800">
        <div className="flex items-center gap-3 mb-2">
          <div
            className="w-10 h-10 rounded-xl bg-white flex-shrink-0"
            style={{
              backgroundImage: "url('/sanwo-logo.png')",
              backgroundSize: '260% auto',
              backgroundPosition: 'left center',
              backgroundRepeat: 'no-repeat',
            }}
          />
          <div>
            <div className="text-white font-bold text-base leading-none">SANWO</div>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/20 text-amber-400 mt-0.5">
              Testnet
            </span>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ id, label, icon: Icon }) => {
          const active = currentView === id
          return (
            <button
              key={id}
              onClick={() => setCurrentView(id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Icon size={17} />
              {label}
            </button>
          )
        })}
      </nav>

      {/* Footer: address + logout */}
      <div className="px-3 pb-5 space-y-2">
        {connectedAddress && (
          <div className="px-3 py-2 rounded-lg bg-slate-800">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Wallet</div>
            <div className="text-slate-300 text-xs font-mono">
              {truncateAddress(connectedAddress)}
            </div>
          </div>
        )}
        <button
          onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 text-sm transition-colors"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </aside>
  )
}
