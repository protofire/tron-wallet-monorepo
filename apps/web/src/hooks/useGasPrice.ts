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
  // viem-transport handles actual energy/bandwidth fees — this is for UI display only.
  const tronGasPrice = useMemo<GasFeeParams | undefined>(() => {
    if (!isTronChain(chainId)) return undefined
    return {
      maxFeePerGas: 420n, // Tron energy price in sun (~420 sun per energy unit)
      maxPriorityFeePerGas: 0n,
    } as GasFeeParams
  }, [chainId])

  if (isTronChain(chainId)) {
    return [tronGasPrice, undefined, false]
  }

  return [gasPrice, gasPriceError, gasPriceLoading]
}

export default useGasPrice
