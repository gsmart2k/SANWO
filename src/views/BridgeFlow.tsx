import { useState } from 'react'
import { ArrowRight, Loader2, AlertCircle, CheckCircle2, ExternalLink } from 'lucide-react'
import { useWallet } from '../context/WalletContext'

interface ChainConfig {
  id: string
  label: string
  chainId: string  // hex
  chainName: string
  nativeCurrency: { name: string; symbol: string; decimals: number }
  rpcUrls: string[]
  blockExplorerUrls: string[]
}

const SOURCE_CHAINS: ChainConfig[] = [
  {
    id: 'Ethereum_Sepolia', label: 'Ethereum Sepolia',
    chainId: '0xaa36a7', chainName: 'Ethereum Sepolia',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://rpc.sepolia.org'],
    blockExplorerUrls: ['https://sepolia.etherscan.io'],
  },
  {
    id: 'Base_Sepolia', label: 'Base Sepolia',
    chainId: '0x14a34', chainName: 'Base Sepolia',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://sepolia.base.org'],
    blockExplorerUrls: ['https://sepolia-explorer.base.org'],
  },
  {
    id: 'Arbitrum_Sepolia', label: 'Arbitrum Sepolia',
    chainId: '0x66eee', chainName: 'Arbitrum Sepolia',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://sepolia-rollup.arbitrum.io/rpc'],
    blockExplorerUrls: ['https://sepolia.arbiscan.io'],
  },
  {
    id: 'Avalanche_Fuji', label: 'Avalanche Fuji',
    chainId: '0xa869', chainName: 'Avalanche Fuji',
    nativeCurrency: { name: 'AVAX', symbol: 'AVAX', decimals: 18 },
    rpcUrls: ['https://api.avax-test.network/ext/bc/C/rpc'],
    blockExplorerUrls: ['https://testnet.snowtrace.io'],
  },
  {
    id: 'Polygon_Amoy_Testnet', label: 'Polygon Amoy',
    chainId: '0x13882', chainName: 'Polygon Amoy',
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    rpcUrls: ['https://rpc-amoy.polygon.technology'],
    blockExplorerUrls: ['https://www.oklink.com/amoy'],
  },
]

type SourceChainId = ChainConfig['id']

type BridgeStatus =
  | { step: 'idle' }
  | { step: 'estimating' }
  | { step: 'ready'; fee: string }
  | { step: 'bridging'; progress: string }
  | { step: 'done'; txHash?: string; explorerUrl?: string }
  | { step: 'error'; message: string }

interface Props {
  onBack: () => void
}

export default function BridgeFlow({ onBack }: Props) {
  const { connectedAddress } = useWallet()
  const [sourceChain, setSourceChain] = useState<SourceChainId>('Ethereum_Sepolia')
  const [amount, setAmount] = useState('')
  const [status, setStatus] = useState<BridgeStatus>({ step: 'idle' })

  const hasMetaMask = typeof window !== 'undefined' && 'ethereum' in window

  async function ensureChain(provider: any, chain: ChainConfig) { // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chain.chainId }] })
    } catch {
      // Chain not added yet — add it first, which also switches
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: chain.chainId,
          chainName: chain.chainName,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: chain.rpcUrls,
          blockExplorerUrls: chain.blockExplorerUrls,
        }],
      })
    }
  }

  async function handleEstimate() {
    if (!amount || parseFloat(amount) <= 0) return
    setStatus({ step: 'estimating' })
    try {
      const { BridgeKit } = await import('@circle-fin/bridge-kit')
      const { createViemAdapterFromProvider } = await import('@circle-fin/adapter-viem-v2')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const provider = (window as any).ethereum
      await provider.request({ method: 'eth_requestAccounts' })
      const chain = SOURCE_CHAINS.find(c => c.id === sourceChain)!
      await ensureChain(provider, chain)

      const adapter = await createViemAdapterFromProvider({ provider }) as any // eslint-disable-line @typescript-eslint/no-explicit-any
      const kit = new BridgeKit()

      const estimate = await kit.estimate({
        from: { adapter, chain: sourceChain as any }, // eslint-disable-line @typescript-eslint/no-explicit-any
        to: { chain: 'Arc_Testnet', recipientAddress: connectedAddress!, useForwarder: true },
        amount,
      })

      // Sum forwarder relay fees (deducted from minted amount)
      const totalFee = (estimate.fees as Array<{ type: string; amount: string }>)
        .filter((f) => f.type === 'forwarder')
        .reduce((sum, f) => sum + parseFloat(f.amount), 0)
        .toFixed(4)

      setStatus({ step: 'ready', fee: totalFee })
    } catch (err) {
      setStatus({ step: 'error', message: err instanceof Error ? err.message : 'Estimation failed' })
    }
  }

  async function handleBridge() {
    setStatus({ step: 'bridging', progress: 'Requesting wallet connection…' })
    try {
      const { BridgeKit } = await import('@circle-fin/bridge-kit')
      const { createViemAdapterFromProvider } = await import('@circle-fin/adapter-viem-v2')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const provider = (window as any).ethereum
      await provider.request({ method: 'eth_requestAccounts' })

      setStatus({ step: 'bridging', progress: 'Adding chain to wallet…' })
      const chain = SOURCE_CHAINS.find(c => c.id === sourceChain)!
      await ensureChain(provider, chain)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const adapter = await createViemAdapterFromProvider({ provider }) as any
      const kit = new BridgeKit()

      setStatus({ step: 'bridging', progress: 'Please confirm the transaction in your wallet…' })

      const result = await kit.bridge({
        from: { adapter, chain: sourceChain as any }, // eslint-disable-line @typescript-eslint/no-explicit-any
        to: { chain: 'Arc_Testnet', recipientAddress: connectedAddress!, useForwarder: true },
        amount,
      })

      if (result.state === 'error') {
        const failedStep = result.steps?.find(
          (s: { state: string; errorMessage?: string }) => s.state === 'error'
        )
        throw new Error(failedStep?.errorMessage ?? 'Bridge failed')
      }

      const mintStep = result.steps?.find(
        (s: { name: string; txHash?: string; explorerUrl?: string }) => s.name.toLowerCase() === 'mint'
      )
      setStatus({ step: 'done', txHash: mintStep?.txHash, explorerUrl: mintStep?.explorerUrl })
    } catch (err) {
      setStatus({ step: 'error', message: err instanceof Error ? err.message : 'Bridge failed' })
    }
  }

  if (status.step === 'done') {
    return (
      <div className="text-center py-10">
        <CheckCircle2 size={48} className="text-green-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-slate-900 mb-2">Bridge complete!</h3>
        <p className="text-slate-500 text-sm mb-1">
          {amount} USDC is arriving at your Arc wallet.
        </p>
        <p className="text-slate-400 text-xs mb-6">
          It may take a few seconds to appear in your balance.
        </p>
        {(status.explorerUrl || status.txHash) && (
          <a
            href={status.explorerUrl ?? `https://testnet.arcscan.app/tx/${status.txHash}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-blue-600 text-sm hover:underline mb-6"
          >
            View on explorer <ExternalLink size={13} />
          </a>
        )}
        <div className="mt-2">
          <button
            onClick={onBack}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl px-6 py-2.5 text-sm transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={onBack}
        className="text-sm text-slate-500 hover:text-slate-700 mb-5 flex items-center gap-1 transition-colors"
      >
        ← Back
      </button>

      <h2 className="text-xl font-bold text-slate-900 mb-1">Bridge USDC to Arc</h2>
      <p className="text-slate-400 text-sm mb-6">
        Move USDC from another testnet chain into your Sanwo wallet via CCTP v2.
      </p>

      {!hasMetaMask && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 mb-5 flex items-start gap-2">
          <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
          <span>No browser wallet detected. Install MetaMask or Coinbase Wallet to bridge from another chain.</span>
        </div>
      )}

      <div className="space-y-4">
        {/* Source chain */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <label className="text-sm font-semibold text-slate-700 block mb-3">Source chain</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {SOURCE_CHAINS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => { setSourceChain(id); setStatus({ step: 'idle' }) }}
                className={`py-2 px-3 rounded-lg text-xs font-medium transition-colors text-left ${
                  sourceChain === id
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Amount */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <label className="text-sm font-semibold text-slate-700 block mb-2">Amount (USDC)</label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            placeholder="0.00"
            value={amount}
            onChange={(e) => { setAmount(e.target.value); setStatus({ step: 'idle' }) }}
            className="w-full text-2xl font-bold text-slate-900 bg-transparent outline-none placeholder-slate-300"
          />
        </div>

        {/* Route summary */}
        <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4 flex items-center gap-3 text-sm text-slate-600">
          <span className="font-medium">{SOURCE_CHAINS.find(c => c.id === sourceChain)?.label}</span>
          <ArrowRight size={16} className="text-slate-400 flex-shrink-0" />
          <span className="font-medium text-blue-600">Arc Testnet</span>
          <span className="ml-auto text-xs text-slate-400">via CCTP v2</span>
        </div>

        {/* Fee estimate */}
        {status.step === 'ready' && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Relay fee</span>
              <span className="font-semibold text-slate-800">{status.fee} USDC</span>
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-slate-500">You receive (approx)</span>
              <span className="font-semibold text-green-700">
                {Math.max(0, parseFloat(amount) - parseFloat(status.fee || '0')).toFixed(4)} USDC
              </span>
            </div>
          </div>
        )}

        {/* Error */}
        {status.step === 'error' && (
          <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-700 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
            <span>{status.message}</span>
          </div>
        )}

        {/* Bridging progress */}
        {status.step === 'bridging' && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-700 flex items-center gap-2">
            <Loader2 size={14} className="animate-spin flex-shrink-0" />
            <span>{status.progress}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          {status.step !== 'ready' && status.step !== 'bridging' && (
            <button
              onClick={handleEstimate}
              disabled={!hasMetaMask || !amount || parseFloat(amount) <= 0 || status.step === 'estimating'}
              className="flex-1 flex items-center justify-center gap-2 border border-blue-200 text-blue-600 font-medium rounded-xl py-3 text-sm transition-colors hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {status.step === 'estimating' ? <Loader2 size={14} className="animate-spin" /> : null}
              {status.step === 'estimating' ? 'Estimating…' : 'Estimate fee'}
            </button>
          )}
          <button
            onClick={handleBridge}
            disabled={!hasMetaMask || !amount || parseFloat(amount) <= 0 || status.step === 'bridging' || status.step === 'estimating'}
            className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl py-3 text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {status.step === 'bridging' ? <Loader2 size={14} className="animate-spin" /> : null}
            {status.step === 'bridging' ? 'Bridging…' : 'Bridge USDC'}
          </button>
        </div>

        <p className="text-xs text-slate-400 text-center">
          Powered by Circle CCTP v2 · Fast transfer (~8–20s) via Circle's Orbit relayer
        </p>
      </div>
    </div>
  )
}
