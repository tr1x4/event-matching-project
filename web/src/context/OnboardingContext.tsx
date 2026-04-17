import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type InterestModalVariant = 'wizard' | 'picker'
export type MatchWeightsModalVariant = 'wizard' | 'picker'

type OnboardingState = {
  interestsModalOpen: boolean
  interestModalVariant: InterestModalVariant
  openInterestsModal: (variant?: InterestModalVariant) => void
  closeInterestsModal: () => void
  /** После успешного сохранения профиля в мастере: открыть выбор интересов */
  notifyProfileWizardFinished: () => void
  matchWeightsModalOpen: boolean
  matchWeightsModalVariant: MatchWeightsModalVariant
  openMatchWeightsModal: (variant?: MatchWeightsModalVariant) => void
  closeMatchWeightsModal: () => void
}

const OnboardingContext = createContext<OnboardingState | null>(null)

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [interestsModalOpen, setInterestsModalOpen] = useState(false)
  const [interestModalVariant, setInterestModalVariant] =
    useState<InterestModalVariant>('picker')
  const [matchWeightsModalOpen, setMatchWeightsModalOpen] = useState(false)
  const [matchWeightsModalVariant, setMatchWeightsModalVariant] =
    useState<MatchWeightsModalVariant>('picker')

  const openInterestsModal = useCallback((variant: InterestModalVariant = 'picker') => {
    setInterestModalVariant(variant)
    setInterestsModalOpen(true)
  }, [])

  const closeInterestsModal = useCallback(() => {
    setInterestsModalOpen(false)
  }, [])

  const notifyProfileWizardFinished = useCallback(() => {
    setInterestModalVariant('wizard')
    setInterestsModalOpen(true)
  }, [])

  const openMatchWeightsModal = useCallback((variant: MatchWeightsModalVariant = 'picker') => {
    setMatchWeightsModalVariant(variant)
    setMatchWeightsModalOpen(true)
  }, [])

  const closeMatchWeightsModal = useCallback(() => {
    setMatchWeightsModalOpen(false)
  }, [])

  const value = useMemo(
    () => ({
      interestsModalOpen,
      interestModalVariant,
      openInterestsModal,
      closeInterestsModal,
      notifyProfileWizardFinished,
      matchWeightsModalOpen,
      matchWeightsModalVariant,
      openMatchWeightsModal,
      closeMatchWeightsModal,
    }),
    [
      interestsModalOpen,
      interestModalVariant,
      openInterestsModal,
      closeInterestsModal,
      notifyProfileWizardFinished,
      matchWeightsModalOpen,
      matchWeightsModalVariant,
      openMatchWeightsModal,
      closeMatchWeightsModal,
    ],
  )

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>
}

export function useOnboarding(): OnboardingState {
  const ctx = useContext(OnboardingContext)
  if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider')
  return ctx
}
