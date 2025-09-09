export interface FeatureFlags {
  messageReadReceipts: boolean
  messageThreading: boolean
  batchReadMarking: boolean
  readReceiptsInGroupsOnly: boolean
}

export const features: FeatureFlags = {
  messageReadReceipts: process.env.NEXT_PUBLIC_ENABLE_READ_RECEIPTS === 'true',
  messageThreading: process.env.NEXT_PUBLIC_ENABLE_THREADING === 'true',
  batchReadMarking: process.env.NEXT_PUBLIC_ENABLE_BATCH_READ === 'true',
  readReceiptsInGroupsOnly: process.env.NEXT_PUBLIC_READ_RECEIPTS_GROUPS_ONLY === 'true',
}

export function useFeature(feature: keyof FeatureFlags): boolean {
  // For client components, these are baked at build-time via NEXT_PUBLIC_ vars
  return features[feature] || false
}

