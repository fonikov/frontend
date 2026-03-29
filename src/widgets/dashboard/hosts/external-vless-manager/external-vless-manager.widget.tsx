import {
    Badge,
    Button,
    Card,
    Group,
    NumberInput,
    SimpleGrid,
    Stack,
    Switch,
    Table,
    Text,
    TextInput,
    Textarea,
    Tooltip,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { useHostsStoreFilters } from '@entities/dashboard'
import { instance, queryClient } from '@shared/api'

export type ExternalVlessNode = {
    address: string
    aliasRemark: null | string
    bridgeLabel: string
    countryCode: null | string
    countryLabel: string
    countryName: null | string
    customTags: string[]
    displayCountry: null | string
    displayName: string
    effectiveTags: string[]
    isAlive: boolean
    isEnabled: boolean
    isManual: boolean
    isPinned: boolean
    isSelectedForSubscription: boolean
    latencyMs: null | number
    network: string
    originalRemark: string
    priority: number
    rawUri: string
    remarkTags: string[]
    resolvedAddress: null | string
    security: string
    sourcePosition: number
    tcpLatencyMs: null | number
    transportLatencyMs: null | number
    transportProbe: 'HTTPS' | 'NONE' | 'REALITY' | 'TLS'
    uuid: string
}

export type ExternalVlessPreset = {
    availableCountries: string[]
    countryMode: string
    isEnabled: boolean
    lastSyncedAt: null | string
    name: string
    nodes: ExternalVlessNode[]
    selectedNodesCount: number
    selectionLimit: number
    slug: string
    sourceUrls: string[]
    totalNodesCount: number
    uniqueCountries: boolean
    uuid: string
}

type ExternalVlessResponse = {
    response: ExternalVlessPreset[]
}

type TProps = {
    variant?: 'active' | 'full'
}

type ManualDraft = {
    rawUri: string
}

export const externalVlessQueryKey = ['external-vless', 'presets']

export const fetchExternalVlessPresets = async () => {
    const response = await instance.get<ExternalVlessResponse>('/api/external-vless/presets')
    return response.data.response
}

const normalizeTagString = (value: string) =>
    [...new Set(value.split(/[,\s;]+/).map((tag) => tag.trim().toUpperCase()).filter(Boolean))]
const formatLatency = (latencyMs: null | number) => (latencyMs === null ? 'н/д' : `${latencyMs} ms`)
const getPreferredDisplayedLatency = (node: ExternalVlessNode) => {
    if (node.transportProbe !== 'NONE' && node.transportLatencyMs !== null) {
        return node.transportLatencyMs
    }

    return node.tcpLatencyMs ?? node.latencyMs
}
const compactCountry = (node: ExternalVlessNode) =>
    (node.countryCode || node.countryLabel || 'N/A').toUpperCase()
const compactBridge = (bridgeLabel: string) =>
    bridgeLabel
        .split('/')
        .map((part) => part.trim())
        .filter(Boolean)
        .slice(0, 3)
        .join(' / ')
const getProbePriority = (node: ExternalVlessNode) => {
    if (node.transportProbe !== 'NONE' && node.transportLatencyMs !== null) {
        return 3
    }

    if (node.transportProbe === 'NONE' && node.tcpLatencyMs !== null) {
        return 2
    }

    if (node.tcpLatencyMs !== null) {
        return 1
    }

    return 0
}
const hasPreferredProbeSuccess = (node: ExternalVlessNode) => {
    return getProbePriority(node) >= 2
}
const getLatencyColor = (node: ExternalVlessNode) => {
    if (hasPreferredProbeSuccess(node)) {
        return 'teal'
    }

    if (node.isAlive) {
        return 'yellow'
    }

    return 'red'
}
const getTransportProbeLabel = (node: ExternalVlessNode) => {
    switch (node.transportProbe) {
        case 'HTTPS':
            return 'TLS/SNI (HTTPS)'
        case 'REALITY':
            return 'REALITY'
        case 'TLS':
            return 'TLS/SNI'
        default:
            return 'Transport probe'
    }
}
const getTransportProbeValue = (node: ExternalVlessNode) =>
    node.transportProbe === 'NONE'
        ? 'не применяется'
        : node.transportLatencyMs === null
          ? 'не прошел'
          : formatLatency(node.transportLatencyMs)
const renderProbeTooltip = (node: ExternalVlessNode) => (
    <Stack gap={2}>
        <Text size="xs">
            {getTransportProbeLabel(node)}: {getTransportProbeValue(node)}
        </Text>
        <Text size="xs">IP:port: {formatLatency(node.tcpLatencyMs)}</Text>
        <Text size="xs">Итог: {formatLatency(getPreferredDisplayedLatency(node))}</Text>
    </Stack>
)

const ActiveEmptyState = () => (
    <Card padding="lg" radius="md" withBorder>
        <Text fw={600}>Ready subscriptions are enabled, but no active nodes are selected yet.</Text>
        <Text c="dimmed" mt={4} size="sm">
            Open the ready subscriptions tab in Add Host or wait for the scheduler sync to fill the
            top pools.
        </Text>
    </Card>
)

export function ReadySubscriptionsPanelWidget({ variant = 'full' }: TProps) {
    const filters = useHostsStoreFilters()
    const isActiveVariant = variant === 'active'
    const [manualDrafts, setManualDrafts] = useState<Record<string, ManualDraft>>({})

    const { data, isFetching } = useQuery({
        queryKey: externalVlessQueryKey,
        queryFn: fetchExternalVlessPresets
    })

    const refresh = async () => {
        await queryClient.invalidateQueries({ queryKey: externalVlessQueryKey })
    }

    const syncMutation = useMutation({
        mutationFn: async () => instance.post('/api/external-vless/actions/sync'),
        onSuccess: async () => {
            notifications.show({
                color: 'teal',
                message: 'Ready subscriptions synced'
            })
            await refresh()
        }
    })

    const presetMutation = useMutation({
        mutationFn: async (params: { uuid: string; payload: Partial<ExternalVlessPreset> }) =>
            instance.patch(`/api/external-vless/presets/${params.uuid}`, params.payload),
        onSuccess: refresh
    })

    const nodeMutation = useMutation({
        mutationFn: async (params: { uuid: string; payload: Partial<ExternalVlessNode> }) =>
            instance.patch(`/api/external-vless/nodes/${params.uuid}`, params.payload),
        onSuccess: refresh
    })

    const createManualNodeMutation = useMutation({
        mutationFn: async (params: { presetUuid: string; rawUri: string }) =>
            instance.post(`/api/external-vless/presets/${params.presetUuid}/manual-nodes`, {
                rawUri: params.rawUri
            }),
        onSuccess: async (_, variables) => {
            setManualDrafts((prev) => ({
                ...prev,
                [variables.presetUuid]: { rawUri: '' }
            }))
            await refresh()
        }
    })

    const activePresets = (data || [])
        .filter((preset) => preset.isEnabled)
        .map((preset) => ({
            ...preset,
            nodes: preset.nodes.filter((node) => {
                if (!node.isSelectedForSubscription) {
                    return false
                }

                if (filters.configProfileUuid || filters.inboundUuid) {
                    return false
                }

                if (!filters.hostTag) {
                    return true
                }

                return node.effectiveTags.includes(filters.hostTag.toUpperCase())
            })
        }))
        .filter((preset) => preset.nodes.length > 0)

    const visiblePresets = isActiveVariant ? activePresets : data || []

    return (
        <Stack gap="md" mb={isActiveVariant ? 'md' : 0}>
            <Group justify="space-between" wrap="wrap">
                <div>
                    <Text fw={700} size={isActiveVariant ? 'md' : 'lg'}>
                        {isActiveVariant ? 'Ready subscriptions in hosts' : 'Ready subscriptions'}
                    </Text>
                    <Text c="dimmed" size="sm">
                        {isActiveVariant
                            ? 'These auto-selected nodes are already part of the active subscription output.'
                            : 'Three managed pools: BLACK, White RU, and White Foreign. You can rename nodes, add your own tags, and inspect every config before it reaches the top list.'}
                    </Text>
                </div>

                <Button
                    loading={syncMutation.isPending || isFetching}
                    onClick={() => syncMutation.mutate()}
                    variant={isActiveVariant ? 'light' : 'filled'}
                >
                    Sync now
                </Button>
            </Group>

            {isActiveVariant && visiblePresets.length === 0 && <ActiveEmptyState />}

            {!isActiveVariant && (
                <SimpleGrid cols={{ base: 1, xl: 1 }}>
                    {visiblePresets.map((preset) => (
                        <Card key={preset.uuid} padding="lg" radius="md" withBorder>
                            <Stack gap="md">
                                <Group justify="space-between" wrap="wrap">
                                    <div>
                                        <Group gap="xs">
                                            <Text fw={700}>{preset.name}</Text>
                                            <Badge color={preset.isEnabled ? 'teal' : 'gray'} variant="light">
                                                {preset.slug}
                                            </Badge>
                                            <Badge variant="outline">
                                                {preset.selectedNodesCount}/{preset.selectionLimit} active
                                            </Badge>
                                        </Group>
                                        <Text c="dimmed" lineClamp={2} size="xs">
                                            {preset.sourceUrls.join(' | ')}
                                        </Text>
                                        <Text c="dimmed" size="xs">
                                            Countries: {preset.availableCountries.join(', ') || 'auto'}
                                        </Text>
                                        <Text c="dimmed" size="xs">
                                            Last sync:{' '}
                                            {preset.lastSyncedAt
                                                ? new Date(preset.lastSyncedAt).toLocaleString()
                                                : 'never'}
                                        </Text>
                                    </div>

                                    <Switch
                                        checked={preset.isEnabled}
                                        label="Enabled"
                                        onChange={(event) =>
                                            presetMutation.mutate({
                                                uuid: preset.uuid,
                                                payload: { isEnabled: event.currentTarget.checked }
                                            })
                                        }
                                    />
                                </Group>

                                <Group align="flex-end" grow>
                                    <TextInput
                                        defaultValue={preset.name}
                                        key={`${preset.uuid}-${preset.name}`}
                                        label="Preset name"
                                        onBlur={(event) => {
                                            const nextValue = event.currentTarget.value.trim()
                                            if (nextValue && nextValue !== preset.name) {
                                                presetMutation.mutate({
                                                    uuid: preset.uuid,
                                                    payload: { name: nextValue }
                                                })
                                            }
                                        }}
                                    />

                                    <NumberInput
                                        defaultValue={preset.selectionLimit}
                                        key={`${preset.uuid}-${preset.selectionLimit}`}
                                        label="Top hosts limit"
                                        max={10}
                                        min={1}
                                        onBlur={(event) => {
                                            const nextValue = Number(event.currentTarget.value)
                                            if (
                                                Number.isFinite(nextValue) &&
                                                nextValue !== preset.selectionLimit
                                            ) {
                                                presetMutation.mutate({
                                                    uuid: preset.uuid,
                                                    payload: { selectionLimit: nextValue }
                                                })
                                            }
                                        }}
                                    />
                                </Group>

                                <Group align="flex-end">
                                    <Textarea
                                        autosize
                                        label="Add manual vless://"
                                        minRows={2}
                                        onChange={(event) => {
                                            setManualDrafts((prev) => ({
                                                ...prev,
                                                [preset.uuid]: {
                                                    rawUri: event.currentTarget.value
                                                }
                                            }))
                                        }}
                                        placeholder="Paste vless:// URI"
                                        style={{ flex: 1 }}
                                        value={manualDrafts[preset.uuid]?.rawUri || ''}
                                    />
                                    <Button
                                        loading={createManualNodeMutation.isPending}
                                        onClick={() => {
                                            const rawUri = manualDrafts[preset.uuid]?.rawUri?.trim()
                                            if (!rawUri) {
                                                return
                                            }

                                            createManualNodeMutation.mutate({
                                                presetUuid: preset.uuid,
                                                rawUri
                                            })
                                        }}
                                    >
                                        Add
                                    </Button>
                                </Group>

                                <PresetNodesTable
                                    isActiveVariant={false}
                                    nodeMutation={nodeMutation.mutate}
                                    nodes={preset.nodes}
                                />
                            </Stack>
                        </Card>
                    ))}
                </SimpleGrid>
            )}

            {isActiveVariant &&
                visiblePresets.map((preset) => (
                    <Card key={preset.uuid} padding="lg" radius="md" withBorder>
                        <Stack gap="md">
                            <Group justify="space-between" wrap="wrap">
                                <div>
                                    <Group gap="xs">
                                        <Text fw={700}>{preset.name}</Text>
                                        <Badge color="teal" variant="light">
                                            {preset.nodes.length} shown
                                        </Badge>
                                    </Group>
                                    <Text c="dimmed" size="xs">
                                        Auto-detected countries: {preset.availableCountries.join(', ') || 'auto'}
                                    </Text>
                                </div>

                                <Badge variant="outline">
                                    Top {preset.selectionLimit}
                                </Badge>
                            </Group>

                            <PresetNodesTable
                                isActiveVariant
                                nodeMutation={nodeMutation.mutate}
                                nodes={preset.nodes}
                            />
                        </Stack>
                    </Card>
                ))}
        </Stack>
    )
}

type TTableProps = {
    isActiveVariant: boolean
    nodeMutation: (params: { payload: Partial<ExternalVlessNode>; uuid: string }) => void
    nodes: ExternalVlessNode[]
}

function PresetNodesTable({ nodes, nodeMutation, isActiveVariant }: TTableProps) {
    const sortedNodes = [...nodes].sort((a, b) => {
        const selectedDelta = Number(b.isSelectedForSubscription) - Number(a.isSelectedForSubscription)
        if (selectedDelta !== 0) {
            return selectedDelta
        }

        const enabledDelta = Number(b.isEnabled) - Number(a.isEnabled)
        if (enabledDelta !== 0) {
            return enabledDelta
        }

        const pinnedDelta = Number(b.isPinned) - Number(a.isPinned)
        if (pinnedDelta !== 0) {
            return pinnedDelta
        }

        const probePriorityDelta = getProbePriority(b) - getProbePriority(a)
        if (probePriorityDelta !== 0) {
            return probePriorityDelta
        }

        const aliveDelta = Number(b.isAlive) - Number(a.isAlive)
        if (aliveDelta !== 0) {
            return aliveDelta
        }

        const latencyA = getPreferredDisplayedLatency(a) ?? Number.MAX_SAFE_INTEGER
        const latencyB = getPreferredDisplayedLatency(b) ?? Number.MAX_SAFE_INTEGER
        return latencyA - latencyB
    })

    return (
        <Table.ScrollContainer minWidth={isActiveVariant ? 1060 : 1280}>
            <Table highlightOnHover striped withColumnBorders>
                <Table.Thead>
                    <Table.Tr>
                        {!isActiveVariant && <Table.Th>Use</Table.Th>}
                        <Table.Th>Top</Table.Th>
                        <Table.Th>Pin</Table.Th>
                        <Table.Th w={150}>Latency</Table.Th>
                        <Table.Th w={150}>Country</Table.Th>
                        <Table.Th w={220}>Bridge</Table.Th>
                        <Table.Th>Alias</Table.Th>
                        <Table.Th>Custom tags</Table.Th>
                        <Table.Th>Detected tags</Table.Th>
                        <Table.Th>Mode</Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {sortedNodes.map((node) => (
                        <Table.Tr key={node.uuid}>
                            {!isActiveVariant && (
                                <Table.Td>
                                    <Switch
                                        checked={node.isEnabled}
                                        onChange={(event) =>
                                            nodeMutation({
                                                uuid: node.uuid,
                                                payload: {
                                                    isEnabled: event.currentTarget.checked
                                                }
                                            })
                                        }
                                    />
                                </Table.Td>
                            )}
                            <Table.Td>
                                <Badge color={node.isSelectedForSubscription ? 'teal' : 'gray'} variant="light">
                                    {node.isSelectedForSubscription ? 'active' : 'reserve'}
                                </Badge>
                            </Table.Td>
                            <Table.Td>
                                <Switch
                                    checked={node.isPinned}
                                    onChange={(event) =>
                                        nodeMutation({
                                            uuid: node.uuid,
                                            payload: {
                                                isPinned: event.currentTarget.checked
                                            }
                                        })
                                    }
                                />
                            </Table.Td>
                            <Table.Td>
                                <Tooltip label={renderProbeTooltip(node)} multiline withArrow>
                                    <Badge color={getLatencyColor(node)} variant="light">
                                        {formatLatency(getPreferredDisplayedLatency(node))}
                                    </Badge>
                                </Tooltip>
                            </Table.Td>
                            <Table.Td>
                                <Badge variant="light">{compactCountry(node)}</Badge>
                            </Table.Td>
                            <Table.Td>
                                <Badge variant="outline">{compactBridge(node.bridgeLabel)}</Badge>
                            </Table.Td>
                            <Table.Td miw={240}>
                                <TextInput
                                    defaultValue={node.aliasRemark ?? ''}
                                    key={`${node.uuid}-alias-${node.aliasRemark ?? ''}`}
                                    onBlur={(event) => {
                                        const nextValue = event.currentTarget.value
                                        if (nextValue !== (node.aliasRemark ?? '')) {
                                            nodeMutation({
                                                uuid: node.uuid,
                                                payload: { aliasRemark: nextValue }
                                            })
                                        }
                                    }}
                                    placeholder={node.displayName}
                                />
                            </Table.Td>
                            <Table.Td miw={220}>
                                <TextInput
                                    defaultValue={node.customTags.join(', ')}
                                    key={`${node.uuid}-tags-${node.customTags.join('|')}`}
                                    onBlur={(event) => {
                                        const nextValue = normalizeTagString(event.currentTarget.value)

                                        if (
                                            JSON.stringify(nextValue) !==
                                            JSON.stringify(node.customTags)
                                        ) {
                                            nodeMutation({
                                                uuid: node.uuid,
                                                payload: { customTags: nextValue }
                                            })
                                        }
                                    }}
                                    placeholder="BLACK, WHITE-RU, VK"
                                />
                            </Table.Td>
                            <Table.Td maw={320}>
                                <Group gap={4}>
                                    {node.effectiveTags.map((tag) => (
                                        <Badge key={`${node.uuid}-${tag}`} size="xs" variant="light">
                                            {tag}
                                        </Badge>
                                    ))}
                                </Group>
                                <Text c="dimmed" lineClamp={2} mt={4} size="xs">
                                    {node.originalRemark}
                                </Text>
                            </Table.Td>
                            <Table.Td>
                                <Badge variant="outline">{node.isManual ? 'manual' : 'auto'}</Badge>
                            </Table.Td>
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>
        </Table.ScrollContainer>
    )
}

export const ExternalVlessManagerWidget = ReadySubscriptionsPanelWidget
