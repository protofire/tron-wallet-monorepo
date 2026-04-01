import { useMemo } from 'react'
import useChainId from '@/hooks/useChainId'
import { useAppSelector } from '@/store'
import { selectTronAddressFormat } from '@/store/settingsSlice'
import { isTronChain, toTronBase58Sync, formatTronShortAddress } from '@/utils/tron'

type TronAddressResult = {
  displayAddress: string
  shortAddress: string
  copyAddress: string
  isTron: boolean
}

const useTronAddress = (hexAddress: string, chainIdOverride?: string): TronAddressResult => {
  const currentChainId = useChainId()
  const chainId = chainIdOverride ?? currentChainId
  const tronFormat = useAppSelector(selectTronAddressFormat)

  return useMemo(() => {
    if (!isTronChain(chainId)) {
      return {
        displayAddress: hexAddress,
        shortAddress: hexAddress,
        copyAddress: hexAddress,
        isTron: false,
      }
    }

    if (tronFormat === 'hex') {
      return {
        displayAddress: hexAddress,
        shortAddress: hexAddress,
        copyAddress: hexAddress,
        isTron: true,
      }
    }

    const base58 = toTronBase58Sync(hexAddress)
    return {
      displayAddress: base58,
      shortAddress: formatTronShortAddress(base58),
      copyAddress: base58,
      isTron: true,
    }
  }, [hexAddress, chainId, tronFormat])
}

export default useTronAddress
