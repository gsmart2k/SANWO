import { useState, useEffect } from 'react'
import { GoogleLogin } from '@react-oauth/google'
import { useWallet } from './context/WalletContext'
import Sidebar from './components/Sidebar'
import BottomNav from './components/BottomNav'
import Dashboard from './views/Dashboard'
import Terminal from './views/Terminal'
import VaultView from './views/Vault'

function Spinner({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-500 text-sm">{message}</p>
      </div>
    </div>
  )
}

function LoginScreen() {
  const { loginWithGoogle } = useWallet()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  async function onCredential(credential: string) {
    setError('')
    setIsLoading(true)
    try {
      await loginWithGoogle(credential)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) return <Spinner message="Connecting to Circle…" />

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-6 sm:p-10 max-w-md w-full mx-4">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img src="/sanwo-logo.png" alt="SANWO" className="h-14 mb-4 object-contain mx-auto" />
          <p className="text-slate-500 text-sm mt-1">USDC payments on Arc blockchain</p>
          <span className="mt-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
            Testnet
          </span>
        </div>

        {/* Google sign-in button — gives us the ID token credential directly */}
        <div className="flex justify-center">
          <GoogleLogin
            onSuccess={(res) => res.credential && onCredential(res.credential)}
            onError={() => setError('Google sign-in failed. Please try again.')}
            width="340"
            text="continue_with"
            shape="rectangular"
            logo_alignment="left"
          />
        </div>

        {error && <p className="text-red-500 text-sm text-center mt-3">{error}</p>}

        <p className="text-center text-xs text-slate-400 mt-5">
          No crypto knowledge needed — Circle creates a self-custodial wallet for you
          automatically.
        </p>

        <div className="mt-6 pt-6 border-t border-slate-100 flex items-center justify-center gap-6 text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
            Sub-second finality
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
            Powered by Circle
          </span>
        </div>
      </div>
    </div>
  )
}

function InitializingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center max-w-sm mx-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-slate-900 mb-2">Setting up your wallet</h2>
        <p className="text-slate-500 text-sm">
          Complete the PIN setup in the Circle popup to secure your wallet.
        </p>
      </div>
    </div>
  )
}

function DepositVerifying() {
  return <Spinner message="Verifying payment and crediting USDC…" />
}

function DepositResult({ success, usdcAmount, error, onDone }: {
  success: boolean; usdcAmount?: string; error?: string; onDone: () => void
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-10 max-w-sm w-full mx-4 text-center">
        <div className={`text-5xl mb-4`}>{success ? '✅' : '❌'}</div>
        <h2 className="text-xl font-semibold text-slate-900 mb-2">
          {success ? 'Deposit successful!' : 'Deposit failed'}
        </h2>
        {success && usdcAmount && (
          <p className="text-slate-500 text-sm mb-6">
            <strong className="text-blue-600">{usdcAmount} USDC</strong> has been sent to your wallet.
          </p>
        )}
        {!success && error && (
          <p className="text-red-500 text-sm mb-6">{error}</p>
        )}
        <button
          onClick={onDone}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl px-6 py-2.5 transition-colors"
        >
          Back to dashboard
        </button>
      </div>
    </div>
  )
}

export default function App() {
  const { isAuthenticated, isInitializing, currentView, refreshBalance } = useWallet()
  const [depositState, setDepositState] = useState<
    | { phase: 'verifying' }
    | { phase: 'result'; success: boolean; usdcAmount?: string; error?: string }
    | null
  >(null)

  // Handle Paystack callback: ?reference=xxx appended to our origin URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const reference = params.get('reference') || params.get('trxref')
    if (!reference) return

    // Clean the URL immediately so a refresh doesn't re-trigger
    window.history.replaceState({}, '', window.location.pathname)

    setDepositState({ phase: 'verifying' })
    fetch(`/api/deposit/verify?reference=${encodeURIComponent(reference)}`)
      .then((r) => r.json())
      .then((data: { success?: boolean; usdcAmount?: string; error?: string }) => {
        if (data.success) {
          refreshBalance()
          setDepositState({ phase: 'result', success: true, usdcAmount: data.usdcAmount })
        } else {
          setDepositState({ phase: 'result', success: false, error: data.error ?? 'Verification failed' })
        }
      })
      .catch(() => setDepositState({ phase: 'result', success: false, error: 'Could not verify payment' }))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (depositState?.phase === 'verifying') return <DepositVerifying />
  if (depositState?.phase === 'result') {
    return (
      <DepositResult
        success={depositState.success}
        usdcAmount={depositState.usdcAmount}
        error={depositState.error}
        onDone={() => setDepositState(null)}
      />
    )
  }

  if (isInitializing) return <InitializingScreen />
  if (!isAuthenticated) return <LoginScreen />

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar />
      <div className="flex-1 overflow-hidden flex flex-col">
        <main className="flex-1 overflow-hidden">
          {currentView === 'dashboard' ? <Dashboard /> : currentView === 'vault' ? <VaultView /> : <Terminal />}
        </main>
        <BottomNav />
      </div>
    </div>
  )
}
