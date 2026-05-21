import { LayoutDashboard, Terminal, PiggyBank } from 'lucide-react'
import { useWallet } from '../context/WalletContext'
import type { AppView } from '../context/WalletContext'

const NAV_ITEMS: { id: AppView; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'terminal', label: 'Terminal', icon: Terminal },
  { id: 'vault', label: 'Vault', icon: PiggyBank },
]

export default function BottomNav() {
  const { currentView, setCurrentView } = useWallet()

  return (
    <nav className="md:hidden flex border-t border-slate-200 bg-white safe-area-bottom">
      {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
        const active = currentView === id
        return (
          <button
            key={id}
            onClick={() => setCurrentView(id)}
            className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors ${
              active ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <Icon size={22} strokeWidth={active ? 2.5 : 1.75} />
            {label}
          </button>
        )
      })}
    </nav>
  )
}
