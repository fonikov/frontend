import { ALPN, FINGERPRINTS, SECURITY_LAYERS } from '@remnawave/backend-contract'
import { z } from 'zod'

export const ImportHostInputSchema = z.object({
    format: z.enum(['VLESS_URI', 'XRAY_JSON']),
    input: z.string().min(1)
})

export const ImportHostResponseSchema = z.object({
    response: z.object({
        remark: z.string().nullable(),
        address: z.string(),
        port: z.number().int(),
        path: z.string().nullable(),
        sni: z.string().nullable(),
        host: z.string().nullable(),
        alpn: z.nativeEnum(ALPN).nullable(),
        fingerprint: z.nativeEnum(FINGERPRINTS).nullable(),
        allowInsecure: z.boolean(),
        securityLayer: z.nativeEnum(SECURITY_LAYERS)
    })
})

