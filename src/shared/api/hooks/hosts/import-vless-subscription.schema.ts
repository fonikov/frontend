import { z } from 'zod'

export const ImportVlessSubscriptionRequestSchema = z.object({
    inbound: z.object({
        configProfileUuid: z.string().uuid(),
        configProfileInboundUuid: z.string().uuid()
    }),
    input: z.string().min(1),
    isDisabled: z.boolean().optional().default(false),
    isHidden: z.boolean().optional().default(false),
    tag: z.string().regex(/^[A-Z0-9_:]+$/).max(32).nullable().optional()
})

export const ImportVlessSubscriptionResponseSchema = z.object({
    response: z.object({
        createdCount: z.number().int().nonnegative(),
        parsedCount: z.number().int().nonnegative(),
        skippedCount: z.number().int().nonnegative()
    })
})
