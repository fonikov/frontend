import { ALPN, FINGERPRINTS, SECURITY_LAYERS } from '@remnawave/backend-contract'

type TAlpn = (typeof ALPN)[keyof typeof ALPN]
type TFingerprint = (typeof FINGERPRINTS)[keyof typeof FINGERPRINTS]
type TSecurityLayer = (typeof SECURITY_LAYERS)[keyof typeof SECURITY_LAYERS]

type TParsedHostFields = {
    address?: string
    allowInsecure?: boolean
    alpn?: TAlpn | null
    fingerprint?: TFingerprint | null
    host?: string
    path?: string
    port?: number
    remark?: string
    securityLayer?: TSecurityLayer
    sni?: string
}

const isKnownEnumValue = <T extends Record<string, string>>(
    enumLike: T,
    value: string | null
): value is T[keyof T] => {
    if (!value) {
        return false
    }

    return Object.values(enumLike).includes(value as T[keyof T])
}

export function parseVlessUri(rawUri: string): TParsedHostFields {
    const normalized = rawUri.trim()

    if (!normalized.toLowerCase().startsWith('vless://')) {
        throw new Error('URI must start with vless://')
    }

    const url = new URL(normalized)
    const params = url.searchParams

    const security = (params.get('security') || 'none').toLowerCase()
    const type = (params.get('type') || 'tcp').toLowerCase()
    const remark = url.hash ? decodeURIComponent(url.hash.slice(1)) : ''
    const host = params.get('host') || params.get('authority') || ''
    const path =
        type === 'grpc'
            ? params.get('serviceName') || params.get('path') || ''
            : params.get('path') || ''
    const insecure = params.get('allowInsecure') || params.get('insecure')
    const securityLayer =
        security === 'tls'
            ? SECURITY_LAYERS.TLS
            : security === 'none'
              ? SECURITY_LAYERS.NONE
              : SECURITY_LAYERS.DEFAULT

    const alpn = params.get('alpn')?.split(',')[0]?.trim() || null
    const fingerprint = params.get('fp')?.trim() || null

    return {
        address: url.hostname || undefined,
        allowInsecure: insecure === '1' || insecure === 'true',
        alpn: isKnownEnumValue(ALPN, alpn) ? alpn : null,
        fingerprint: isKnownEnumValue(FINGERPRINTS, fingerprint) ? fingerprint : null,
        host: host || undefined,
        path: path || undefined,
        port: url.port ? Number(url.port) : undefined,
        remark: remark || undefined,
        securityLayer,
        sni: params.get('sni') || undefined
    }
}
