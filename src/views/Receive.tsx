import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useWallet } from '../context/WalletContext'

export default function Receive() {
  const { connectedAddress } = useWallet()
  const [copied, setCopied] = useState(false)

  async function copyAddress() {
    if (!connectedAddress) return
    await navigator.clipboard.writeText(connectedAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!connectedAddress) {
    return <p className="text-slate-400 text-sm">Wallet not connected.</p>
  }

  return (
    <div className="max-w-md">
      <h2 className="text-xl font-semibold text-slate-900 mb-6">Receive USDC</h2>

      <div className="bg-white rounded-2xl border border-slate-100 p-8 flex flex-col items-center gap-6">
        {/* QR Code */}
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
          <QRCodeSVG
            value={connectedAddress}
            size={200}
            bgColor="#ffffff"
            fgColor="#0f172a"
            level="M"
          />
        </div>

        {/* Address display */}
        <div className="w-full">
          <p className="text-xs text-slate-400 uppercase tracking-wider font-medium mb-2 text-center">
            Your wallet address
          </p>
          <div className="bg-slate-50 rounded-xl border border-slate-100 px-4 py-3">
            <p className="text-slate-800 text-sm font-mono break-all text-center leading-relaxed">
              {connectedAddress}
            </p>
          </div>
        </div>

        {/* Copy button */}
        <button
          onClick={copyAddress}
          className={`flex items-center gap-2 font-medium rounded-xl px-6 py-3 transition-all ${
            copied
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {copied ? (
            <>
              <Check size={16} /> Copied!
            </>
          ) : (
            <>
              <Copy size={16} /> Copy address
            </>
          )}
        </button>

        <p className="text-xs text-slate-400 text-center">
          Send only USDC on Arc Testnet to this address.
        </p>
      </div>
    </div>
  )
}
