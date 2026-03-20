import { HostsSchema } from '@remnawave/backend-contract'
import { z } from 'zod'

export const ReadySubscriptionNodeSchema = z.object({
    uuid: z.string().uuid().nullable(),
    dedupeKey: z.string(),
    displayName: z.string(),
    originalRemark: z.string(),
    countryCode: z.string().nullable(),
    countryLabel: z.string(),
    latencyMs: z.number().int().nullable(),
    isAlive: z.boolean(),
    isPinned: z.boolean(),
    isAutoReplacement: z.boolean(),
    bridgeLabel: z.string(),
    effectiveTags: z.array(z.string())
})

export const ExtendedHostSchema = HostsSchema.extend({
    sourceType: z.enum(['MANUAL', 'READY_SUBSCRIPTION']).default('MANUAL'),
    readySubscription: z
        .object({
            presetUuid: z.string().uuid(),
            presetName: z.string(),
            presetSlug: z.string(),
            autoReplace: z.boolean(),
            activeNodeLimit: z.number().int(),
            selectedNodes: z.array(ReadySubscriptionNodeSchema),
            activeNodes: z.array(ReadySubscriptionNodeSchema)
        })
        .nullable()
        .default(null)
})

export const ExtendedGetAllHostsResponseSchema = z.object({
    response: z.array(ExtendedHostSchema)
})

export type ExtendedHost = z.infer<typeof ExtendedHostSchema>
