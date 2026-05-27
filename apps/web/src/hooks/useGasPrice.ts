import { useCallback, useMemo } from 'react'
import { type AsyncResult } from '@safe-global/utils/hooks/useAsync'
import { useCurrentChain } from './useChains'
import { useWeb3ReadOnly } from './wallets/web3'
import { useDefaultGasPrice, type GasFeeParams } from '@safe-global/utils/hooks/useDefaultGasPrice'
import useChainId from './useChainId'
import { isTronChain } from '@/utils/tron'

const useGasPrice = (isSpeedUp: boolean = false): AsyncResult<GasFeeParams> => {
  const chain = useCurrentChain()
  const provider = useWeb3ReadOnly()
  const chainId = useChainId()

  const logError = useCallback((e: string) => {
    console.error(e)
  }, [])

  const [gasPrice, gasPriceError, gasPriceLoading] = useDefaultGasPrice(chain, provider, {
    isSpeedUp,
    withPooling: true,
    logError,
  })

  // Tron: eth_feeHistory is not supported, provide a display-only default gas price.
  // 420 sun/energy matches the current mainnet `getEnergyFee` chain parameter,
  // so the price term is realistic. Combined with the gasLimit constant in
  // useGasLimit (25_000 energy for typical Safe owner-management ops) this
  // renders ~10.5 TRX, close to what TronLink will actually charge
  // (BUG-07 / GSD-12881). Actual fees are computed and burned at execution
  // time by viem-transport — this hook is for the pre-sign UI hint only.
  const tronGasPrice = useMemo<GasFeeParams | undefined>(() => {
    if (!isTronChain(chainId)) return undefined
    return {
      maxFeePerGas: 420n, // Tron energy price in sun (matches getEnergyFee on mainnet)
      maxPriorityFeePerGas: 0n,
    } as GasFeeParams
  }, [chainId])

  if (isTronChain(chainId)) {
    return [tronGasPrice, undefined, false]
  }

  return [gasPrice, gasPriceError, gasPriceLoading]
}

export default useGasPrice
