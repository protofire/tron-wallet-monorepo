import type { WalletInit } from '@web3-onboard/common'
import { createEIP1193Provider } from '@web3-onboard/common'
import type { Chain } from '@safe-global/store/gateway/AUTO_GENERATED/chains'
import { getRpcServiceUrl } from '@/hooks/wallets/web3'
import { isTronChain } from '@/utils/tron'
import { numberToHex } from '@/utils/hex'
import { translateTronError } from '@/utils/tron-errors'

export const TRONLINK_MODULE_LABEL = 'TronLink'

declare global {
  interface Window {
    tronLink?: {
      ready: boolean
      request: (args: { method: string; params?: unknown }) => Promise<unknown>
      tronWeb?: TronWebInstance
    }
    tronWeb?: TronWebInstance
  }
}

interface TronWebInstance {
  ready: boolean
  defaultAddress?: {
    base58: string
    hex: string
  }
  trx: {
    sign: (message: string) => Promise<string>
    signMessageV2: (message: string) => Promise<string>
  }
  toHex: (value: string) => string
  address: {
    fromHex: (hex: string) => string
    toHex: (base58: string) => string
  }
  fullNode?: { host: string }
}

let currentChainId = ''

const TronLinkModule = (chainId: Chain['chainId'], rpcUri: Chain['rpcUri']): WalletInit => {
  currentChainId = chainId

  return () => {
    // Only show TronLink for Tron chains
    if (!isTronChain(chainId)) {
      return null
    }

    return {
      label: TRONLINK_MODULE_LABEL,
      getIcon: async () => (await import('./icon')).default,
      getInterface: async () => {
        const tronLink = window.tronLink
        const tronWeb = tronLink?.tronWeb || window.tronWeb

        if (!tronLink || !tronWeb) {
          throw new Error('TronLink extension not found. Please install TronLink.')
        }

        if (!tronWeb.ready || !tronWeb.defaultAddress?.hex) {
          // Request connection
          try {
            await tronLink.request({ method: 'tron_requestAccounts' })
          } catch (error) {
            throw new Error(translateTronError(error, currentChainId))
          }
        }

        const getAddress = (): string => {
          const addr = tronWeb.defaultAddress?.hex
          if (!addr) throw new Error('TronLink not connected')
          // Convert Tron hex (41-prefixed) to 0x format
          return '0x' + addr.slice(2)
        }

        const _rpcUrl = getRpcServiceUrl(rpcUri as Parameters<typeof getRpcServiceUrl>[0])
        const chainChangedListeners = new Set<(chainId: string) => void>()

        // Import and create viem-transport backed provider
        const { tronWeb: createTronWebTransport } = await import('@wirexapp/viem-transport')

        // @ts-expect-error — TronWebInstance is a browser extension subset of TronWebLike; cast is safe at runtime
        const viemTransport = createTronWebTransport(tronWeb as Parameters<typeof createTronWebTransport>[0], {
          chainId: Number(currentChainId),
          signatureCompatibility: {
            useEthereumPrefix: false, // Shasta v1.4.1 uses Tron prefix
            adjustVValue: true,
            vValueOffset: 31, // v > 30 path in Safe.sol
          },
        })

        return {
          provider: createEIP1193Provider(
            {
              on: (event: string, listener: (...args: unknown[]) => void) => {
                if (event === 'chainChanged') {
                  chainChangedListeners.add(listener as (chainId: string) => void)
                }
                // TronLink fires events on window
                if (event === 'accountsChanged' && typeof window !== 'undefined') {
                  const handler = (e: MessageEvent) => {
                    if (e.data?.message?.action === 'setAccount') {
                      listener([getAddress()])
                    }
                    if (e.data?.message?.action === 'disconnect') {
                      listener([])
                    }
                  }
                  window.addEventListener('message', handler)
                }
              },

              request: async (request: { method: string; params?: unknown[] }) => {
                // Use the viem-transport for RPC calls
                const transport = viemTransport({
                  chain: { id: Number(currentChainId) } as Parameters<
                    ReturnType<typeof createTronWebTransport>
                  >[0]['chain'],
                  retryCount: 0,
                })

                return transport.request({ method: request.method, params: request.params } as Parameters<
                  typeof transport.request
                >[0])
              },

              disconnect: () => {
                // TronLink doesn't have a disconnect method
              },
            },
            {
              eth_chainId: async () => numberToHex(Number(currentChainId)),
              eth_accounts: async () => [getAddress() as `0x${string}`],
              eth_requestAccounts: async () => {
                await tronLink.request({ method: 'tron_requestAccounts' })
                return [getAddress() as `0x${string}`]
              },

              // @ts-expect-error – onboard types expect specific params
              wallet_switchEthereumChain: async ({ params }: { params: [{ chainId: string }] }) => {
                const newChainId = parseInt(params[0].chainId, 16).toString()
                if (isTronChain(newChainId)) {
                  currentChainId = newChainId
                  chainChangedListeners.forEach((listener) => listener(numberToHex(Number(currentChainId))))
                }
              },
            },
          ),
        }
      },
      platforms: ['desktop'],
    }
  }
}

export default TronLinkModule
