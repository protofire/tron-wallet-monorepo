import { useHasFeature } from '@/hooks/useChains'
import useChainId from '@/hooks/useChainId'
import { FEATURES } from '@safe-global/utils/utils/chains'
import { isTronChain } from '@/utils/tron'

export function useIsCounterfactualEnabled(): boolean | undefined {
  const chainId = useChainId()
  const hasFeature = useHasFeature(FEATURES.COUNTERFACTUAL)

  // Tron counterfactual flow is not ready yet — the dashboard can't reliably
  // load undeployed Safe info before CGW indexes it, causing redirect loops.
  if (isTronChain(chainId)) return false

  return hasFeature
}
