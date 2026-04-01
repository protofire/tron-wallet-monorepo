import { useEffect, type ReactElement } from 'react'
import { SafeShieldDisplay } from './components/SafeShieldDisplay'
import { useSafeShield } from './SafeShieldContext'
import { SAFE_SHIELD_EVENTS, trackEvent } from '@/services/analytics'
import { useHypernativeOAuth, useIsHypernativeEligible } from '@/features/hypernative'
import useChainId from '@/hooks/useChainId'
import { isTronChain } from '@/utils/tron'

const SafeShieldWidget = (): ReactElement | null => {
  const chainId = useChainId()
  const { recipient, contract, threat, deadlock, safeTx, safeAnalysis, addToTrustedList } = useSafeShield()
  const hypernativeAuth = useHypernativeOAuth()
  const { isHypernativeEligible, isHypernativeGuard, loading: eligibilityLoading } = useIsHypernativeEligible()
  const showHnInfo = !eligibilityLoading && isHypernativeEligible
  const showHnActiveStatus = !eligibilityLoading && isHypernativeGuard
  const isTron = isTronChain(chainId)

  // Track when a transaction flow is started
  useEffect(() => {
    if (!isTron) {
      trackEvent(SAFE_SHIELD_EVENTS.TRANSACTION_STARTED)
    }
  }, [isTron])

  // Safe Shield analysis is not available on Tron chains
  if (isTron) return null

  return (
    <SafeShieldDisplay
      data-testid="safe-shield-widget"
      recipient={recipient}
      contract={contract}
      threat={threat}
      deadlock={deadlock}
      safeTx={safeTx}
      hypernativeAuth={!eligibilityLoading && isHypernativeEligible ? hypernativeAuth : undefined}
      showHypernativeInfo={showHnInfo}
      showHypernativeActiveStatus={showHnActiveStatus}
      safeAnalysis={safeAnalysis}
      onAddToTrustedList={addToTrustedList}
    />
  )
}

export default SafeShieldWidget
