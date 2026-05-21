import { useState, useRef, useEffect, useCallback } from 'react'
import { useWallet, relativeTime } from '../context/WalletContext'
import { truncateAddress } from '../lib/arcConfig'
import { streamClaude } from '../lib/claudeApi'
import { useVault } from '../hooks/useVault'

interface TerminalLine {
  id: string
  text: string
  type: 'user' | 'assistant' | 'system' | 'error'
}

let lineCounter = 0
function makeId() {
  return String(++lineCounter)
}

const HELP_TEXT = `Available commands:
  send [amount] usdc to [address]   Send USDC (opens confirm screen)
  send [amount] to [address]        Same as above
  balance                           Show USDC balance
  receive / my address              Show your wallet address
  history / show history            Last 5 transactions
  vault / my vaults                 Show vault summary
  help                              Show this help
  clear                             Clear terminal

Any other input is sent to the AI assistant.`

type ParsedCommand =
  | { type: 'send'; amount: string; to: string }
  | { type: 'balance' }
  | { type: 'receive' }
  | { type: 'history' }
  | { type: 'vault' }
  | { type: 'help' }
  | { type: 'clear' }
  | { type: 'unknown' }

function parseCommand(input: string): ParsedCommand {
  const raw = input.trim()
  const lower = raw.toLowerCase()

  // send [amount] [usdc] to [address or email]
  const sendMatch = raw.match(/^send\s+(\d+(?:\.\d+)?)\s+(?:usdc\s+)?to\s+(\S+)$/i)
  if (sendMatch) {
    const to = sendMatch[2]
    const isAddr = /^0x[0-9a-fA-F]+$/.test(to)
    const isEmailAddr = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)
    if (isAddr || isEmailAddr) return { type: 'send', amount: sendMatch[1], to }
  }

  if (lower === 'balance' || lower === 'check balance') return { type: 'balance' }
  if (lower === 'receive' || lower === 'my address') return { type: 'receive' }
  if (lower === 'history' || lower === 'show history') return { type: 'history' }
  if (lower === 'vault' || lower === 'my vaults' || lower === 'vaults') return { type: 'vault' }
  if (lower === 'help') return { type: 'help' }
  if (lower === 'clear') return { type: 'clear' }

  return { type: 'unknown' }
}

export default function Terminal() {
  const { connectedAddress, usdcBalance, transactions, setCurrentView, setDashboardTab, setSendPreset } = useWallet()
  const { vaults } = useVault()

  const [lines, setLines] = useState<TerminalLine[]>([
    {
      id: makeId(),
      type: 'system',
      text: 'SANWO Terminal v1.0 — Arc Testnet | USDC Payments',
    },
    {
      id: makeId(),
      type: 'system',
      text: `Wallet: ${connectedAddress ? truncateAddress(connectedAddress) : 'not connected'}`,
    },
    { id: makeId(), type: 'system', text: "Type 'help' for available commands." },
    { id: makeId(), type: 'system', text: '─'.repeat(52) },
  ])
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [historyIdx, setHistoryIdx] = useState(-1)
  const [isStreaming, setIsStreaming] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  function appendLine(text: string, type: TerminalLine['type']) {
    setLines((prev) => [...prev, { id: makeId(), text, type }])
  }

  function updateLastAssistantLine(text: string) {
    setLines((prev) => {
      const copy = [...prev]
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i].type === 'assistant') {
          copy[i] = { ...copy[i], text }
          return copy
        }
      }
      return [...copy, { id: makeId(), text, type: 'assistant' }]
    })
  }

  const handleSend = useCallback(
    (cmd: { type: 'send'; amount: string; to: string }) => {
      const label = cmd.to.startsWith('0x') ? truncateAddress(cmd.to) : cmd.to
      appendLine(`Routing to dashboard: send ${cmd.amount} USDC → ${label}`, 'system')
      setSendPreset({ to: cmd.to, amount: cmd.amount })
      setDashboardTab('send')
      setCurrentView('dashboard')
    },
    [setSendPreset, setDashboardTab, setCurrentView]
  )

  async function executeCommand(raw: string) {
    const cmd = parseCommand(raw)

    switch (cmd.type) {
      case 'clear':
        setLines([{ id: makeId(), type: 'system', text: 'Terminal cleared.' }])
        return

      case 'balance':
        appendLine(`Balance: ${usdcBalance} USDC`, 'assistant')
        return

      case 'receive':
        appendLine(
          connectedAddress ? `Your address: ${connectedAddress}` : 'Wallet not connected.',
          'assistant'
        )
        return

      case 'history': {
        const recent = transactions.slice(0, 5)
        if (recent.length === 0) {
          appendLine('No transactions found.', 'assistant')
          return
        }
        for (const tx of recent) {
          const dir = tx.direction === 'received' ? '↓ recv' : '↑ sent'
          const sign = tx.direction === 'received' ? '+' : '-'
          appendLine(
            `${dir}  ${sign}${tx.amount} USDC  ${truncateAddress(tx.direction === 'received' ? tx.from : tx.to)}  ${relativeTime(tx.timestamp)}`,
            'assistant'
          )
        }
        return
      }

      case 'vault': {
        const active = vaults.filter((v) => !['withdrawn', 'broken_early'].includes(v.status))
        const totalLocked = active.reduce((sum, v) => sum + parseFloat(v.amount), 0)
        if (active.length === 0) {
          appendLine('No active vaults. Go to the Vault tab to create one.', 'assistant')
          return
        }
        appendLine(`${active.length} active vault${active.length !== 1 ? 's' : ''} · ${totalLocked.toFixed(2)} USDC locked`, 'assistant')
        for (const vault of active) {
          const daysLeft = Math.max(0, Math.ceil((new Date(vault.unlockDate).getTime() - Date.now()) / 86_400_000))
          const label = vault.name ?? 'Unnamed vault'
          const unlockStr = new Date(vault.unlockDate).toLocaleDateString()
          appendLine(`  ${label}  |  ${vault.amount} USDC  |  ${daysLeft}d left  |  unlocks ${unlockStr}  |  ${vault.status}`, 'assistant')
        }
        return
      }

      case 'help':
        for (const line of HELP_TEXT.split('\n')) {
          appendLine(line, 'system')
        }
        return

      case 'send':
        handleSend(cmd)
        return

      case 'unknown':
      default: {
        // Fall through to Claude
        setIsStreaming(true)
        appendLine('', 'assistant') // placeholder line
        let accumulated = ''
        try {
          // Resolve unique counterparty addresses to SANWO emails
          const uniqueAddresses = [...new Set(
            transactions.map((tx) => (tx.direction === 'sent' ? tx.to : tx.from).toLowerCase())
          )]
          const addressBook: Record<string, string> = {}
          await Promise.all(
            uniqueAddresses.map(async (addr) => {
              try {
                const res = await fetch(`/api/users/reverse-lookup?address=${addr}`)
                if (res.ok) {
                  const { email } = await res.json() as { email: string }
                  addressBook[addr] = email
                }
              } catch { /* ignore */ }
            })
          )
          for await (const chunk of streamClaude(raw, connectedAddress ?? '', usdcBalance, transactions, addressBook, vaults)) {
            accumulated += chunk
            updateLastAssistantLine(accumulated)
          }
        } catch (err) {
          updateLastAssistantLine(
            `Error: ${err instanceof Error ? err.message : String(err)}`
          )
        } finally {
          setIsStreaming(false)
        }
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const raw = input.trim()
    if (!raw || isStreaming) return

    appendLine(`$ ${raw}`, 'user')
    setHistory((prev) => [raw, ...prev])
    setHistoryIdx(-1)
    setInput('')

    await executeCommand(raw)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const next = Math.min(historyIdx + 1, history.length - 1)
      setHistoryIdx(next)
      setInput(history[next] ?? '')
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = Math.max(historyIdx - 1, -1)
      setHistoryIdx(next)
      setInput(next === -1 ? '' : (history[next] ?? ''))
    }
  }

  const lineColors: Record<TerminalLine['type'], string> = {
    user: 'text-[#00ff88]',
    assistant: 'text-terminal-white',
    system: 'text-terminal-gray',
    error: 'text-red-400',
  }

  return (
    <div
      className="h-full flex flex-col bg-terminal-bg font-mono text-sm"
      onClick={() => inputRef.current?.focus()}
    >
      {/* Output area */}
      <div className="flex-1 overflow-y-auto px-5 pt-5 pb-2 terminal-scroll space-y-0.5">
        {lines.map((line) => (
          <div key={line.id} className={`leading-6 whitespace-pre-wrap ${lineColors[line.type]}`}>
            {line.text || ' '}
          </div>
        ))}
        {isStreaming && (
          <span className="inline-block w-2 h-4 bg-[#00ff88] cursor-blink align-middle" />
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 border-t border-slate-800 px-5 py-3"
      >
        <span className="text-[#00ff88] select-none">$</span>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isStreaming}
          autoFocus
          spellCheck={false}
          autoComplete="off"
          className="flex-1 bg-transparent text-[#00ff88] placeholder-terminal-gray outline-none caret-[#00ff88] disabled:opacity-50"
          placeholder={isStreaming ? 'AI is responding…' : 'Type a command or ask anything…'}
        />
      </form>
    </div>
  )
}
