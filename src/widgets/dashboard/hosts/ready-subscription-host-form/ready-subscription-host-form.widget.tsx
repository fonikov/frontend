import {
    CreateHostCommand,
    GetConfigProfilesCommand,
    UpdateHostCommand
} from '@remnawave/backend-contract'
import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Card,
    Checkbox,
    Divider,
    Group,
    NumberInput,
    Select,
    ScrollArea,
    SegmentedControl,
    SimpleGrid,
    Stack,
    Switch,
    Table,
    Text,
    TextInput,
    Textarea,
    Tooltip
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { TbPinned, TbPinnedFilled } from 'react-icons/tb'

import { HostSelectInboundFeature } from '@features/ui/dashboard/hosts/host-select-inbound/host-select-inbound.feature'
import { type ExtendedHost } from '@shared/api/hooks/hosts/hosts.extended.schema'
import { QueryKeys } from '@shared/api/hooks'
import { instance, queryClient } from '@shared/api'
import { resolveCountryCode } from '@shared/utils/misc/resolve-country-code'
import {
    externalVlessQueryKey,
    fetchExternalVlessPresets,
    type ExternalVlessNode,
    type ExternalVlessPreset
} from '@widgets/dashboard/hosts/external-vless-manager'

const READY_HOST_ADDRESS = 'ready-subscription.local'
const INITIAL_VISIBLE_READY_HOST_ROWS = 200
const VISIBLE_READY_HOST_ROWS_STEP = 200
const extractVlessUris = (value: string) =>
    Array.from(
        new Set(
            (value.match(/vless:\/\/[^\s]+/gi) || [])
                .map((item) => item.trim())
                .filter(Boolean)
        )
    )

type TConfigProfiles = GetConfigProfilesCommand.Response['response']['configProfiles']

type TProps = {
    configProfiles: TConfigProfiles
    host?: ExtendedHost | null
    mode: 'create' | 'edit'
    onSubmitted: () => void
}

const PRESET_TITLES: Record<string, string> = {
    'auto-black': 'Black List',
    'auto-white-ru-ip': 'White List'
}
const ALL_SOURCES_VALUE = '__all__'
const MANUAL_SOURCE_VALUE = '__manual__'

const getReadyNodeSourceUrl = (node: ExternalVlessNode, preset: ExternalVlessPreset | null) => {
    if (node.isManual) {
        return null
    }

    const sourceIndex = Math.floor(node.sourcePosition / 10_000)
    return preset?.sourceUrls[sourceIndex] || null
}

const getReadyNodeSourceLabel = (node: ExternalVlessNode, preset: ExternalVlessPreset | null) => {
    if (node.isManual) {
        return 'manual'
    }

    return getReadyNodeSourceUrl(node, preset) || 'unknown source'
}

const normalizeTag = (value: string) => value.trim().toUpperCase()
const formatLatency = (latencyMs: null | number) => (latencyMs === null ? 'н/д' : `${latencyMs} ms`)
const getPreferredDisplayedLatency = (node: ExternalVlessNode) => {
    if (node.transportProbe !== 'NONE' && node.transportLatencyMs !== null) {
        return node.transportLatencyMs
    }

    return node.tcpLatencyMs ?? node.latencyMs
}
const compactCountryLabel = (node: ExternalVlessNode) =>
    (node.countryCode || node.countryLabel || 'N/A').toUpperCase()
const compactBridgeLabel = (bridgeLabel: string) =>
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

export function ReadySubscriptionHostFormWidget({
    configProfiles,
    host,
    mode,
    onSubmitted
}: TProps) {
    const [remark, setRemark] = useState('')
    const [tag, setTag] = useState('')
    const [presetUuid, setPresetUuid] = useState<string | null>(null)
    const [configProfileUuid, setConfigProfileUuid] = useState<string | null>(null)
    const [configProfileInboundUuid, setConfigProfileInboundUuid] = useState<string | null>(null)
    const [autoReplace, setAutoReplace] = useState(false)
    const [activeNodeLimit, setActiveNodeLimit] = useState(1)
    const [isDisabled, setIsDisabled] = useState(false)
    const [isHidden, setIsHidden] = useState(false)
    const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
    const [pinnedNodeIds, setPinnedNodeIds] = useState<string[]>([])
    const [search, setSearch] = useState('')
    const [sourceFilter, setSourceFilter] = useState<string>(ALL_SOURCES_VALUE)
    const [visibleNodeCount, setVisibleNodeCount] = useState(INITIAL_VISIBLE_READY_HOST_ROWS)
    const [manualImportInput, setManualImportInput] = useState('')
    const deferredSearch = useDeferredValue(search)
    const tableViewportRef = useRef<HTMLDivElement | null>(null)

    const { data: presets, isFetching } = useQuery({
        queryKey: externalVlessQueryKey,
        queryFn: fetchExternalVlessPresets
    })

    const invalidateHosts = async () => {
        await queryClient.refetchQueries({
            queryKey: QueryKeys.hosts.getAllHosts.queryKey
        })
        await queryClient.refetchQueries({
            queryKey: QueryKeys.hosts.getAllTags.queryKey
        })
    }

    const createReadyHostMutation = useMutation({
        mutationFn: async (payload: CreateHostCommand.Request) =>
            instance.post(CreateHostCommand.TSQ_url, payload),
        onSuccess: async () => {
            await invalidateHosts()
            notifications.show({
                color: 'teal',
                message: 'Готовый хост создан'
            })
            onSubmitted()
        }
    })

    const updateReadyHostMutation = useMutation({
        mutationFn: async (payload: UpdateHostCommand.Request) =>
            instance.patch(UpdateHostCommand.TSQ_url, payload),
        onSuccess: async () => {
            await invalidateHosts()
            notifications.show({
                color: 'teal',
                message: 'Готовый хост обновлен'
            })
            onSubmitted()
        }
    })

    const createManualNodeMutation = useMutation({
        mutationFn: async (params: { presetUuid: string; rawUri: string }) =>
            instance.post(`/api/external-vless/presets/${params.presetUuid}/manual-nodes`, {
                rawUri: params.rawUri
            })
    })

    useEffect(() => {
        if (!presets || presets.length === 0) {
            return
        }

        if (mode === 'edit' && host?.readySubscription) {
            setRemark(host.remark)
            setTag(host.tag || '')
            setPresetUuid(host.readySubscription.presetUuid)
            setConfigProfileUuid(host.inbound.configProfileUuid)
            setConfigProfileInboundUuid(host.inbound.configProfileInboundUuid)
            setAutoReplace(host.readySubscription.autoReplace)
            setActiveNodeLimit(host.readySubscription.activeNodeLimit)
            setIsDisabled(host.isDisabled)
            setIsHidden(host.isHidden)
            setSelectedNodeIds(
                host.readySubscription.selectedNodes
                    .map((node) => node.uuid)
                    .filter((uuid): uuid is string => Boolean(uuid))
            )
            setPinnedNodeIds(
                host.readySubscription.selectedNodes
                    .filter((node) => node.isPinned && node.uuid)
                    .map((node) => node.uuid as string)
            )
            return
        }

        if (mode === 'create' && !presetUuid) {
            setPresetUuid(presets[0].uuid)
        }
    }, [host, mode, presetUuid, presets])

    const selectedPreset = useMemo(
        () => presets?.find((preset) => preset.uuid === presetUuid) || null,
        [presetUuid, presets]
    )
    const selectedNodeIdSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds])
    const pinnedNodeIdSet = useMemo(() => new Set(pinnedNodeIds), [pinnedNodeIds])
    const initialSelectedNodeIdSet = useMemo(() => {
        if (mode !== 'edit' || !host?.readySubscription || host.readySubscription.presetUuid !== presetUuid) {
            return new Set<string>()
        }

        return new Set(
            host.readySubscription.selectedNodes
                .map((node) => node.uuid)
                .filter((uuid): uuid is string => Boolean(uuid))
        )
    }, [host, mode, presetUuid])
    const initialPinnedNodeIdSet = useMemo(() => {
        if (mode !== 'edit' || !host?.readySubscription || host.readySubscription.presetUuid !== presetUuid) {
            return new Set<string>()
        }

        return new Set(
            host.readySubscription.selectedNodes
                .filter((node) => node.isPinned && node.uuid)
                .map((node) => node.uuid as string)
        )
    }, [host, mode, presetUuid])
    const sourceFilterOptions = useMemo(() => {
        if (!selectedPreset) {
            return [{ label: 'Все источники', value: ALL_SOURCES_VALUE }]
        }

        const options = [{ label: 'Все источники', value: ALL_SOURCES_VALUE }]

        if (selectedPreset.nodes.some((node) => node.isManual)) {
            options.push({
                label: 'Manual',
                value: MANUAL_SOURCE_VALUE
            })
        }

        for (const sourceUrl of selectedPreset.sourceUrls) {
            options.push({
                label: sourceUrl,
                value: sourceUrl
            })
        }

        return options
    }, [selectedPreset])

    const filteredNodes = useMemo(() => {
        if (!selectedPreset) {
            return []
        }

        const normalizedSearch = deferredSearch.trim().toLowerCase()
        return selectedPreset.nodes
            .filter((node: ExternalVlessNode) => {
                const nodeSourceUrl = getReadyNodeSourceUrl(node, selectedPreset)

                if (sourceFilter === MANUAL_SOURCE_VALUE && !node.isManual) {
                    return false
                }

                if (
                    sourceFilter !== ALL_SOURCES_VALUE &&
                    sourceFilter !== MANUAL_SOURCE_VALUE &&
                    nodeSourceUrl !== sourceFilter
                ) {
                    return false
                }

                if (!normalizedSearch) {
                    return true
                }

                return [
                    node.displayName,
                    node.countryLabel,
                    node.bridgeLabel,
                    node.originalRemark,
                    node.address,
                    node.resolvedAddress || '',
                    node.uuid,
                    node.rawUri,
                    nodeSourceUrl || '',
                    node.isManual ? 'manual' : ''
                ]
                    .join(' ')
                    .toLowerCase()
                    .includes(normalizedSearch)
            })
            .sort((a, b) => {
                const initialSelectedDelta =
                    Number(initialSelectedNodeIdSet.has(b.uuid)) - Number(initialSelectedNodeIdSet.has(a.uuid))
                if (initialSelectedDelta !== 0) {
                    return initialSelectedDelta
                }

                const initialPinnedDelta =
                    Number(initialPinnedNodeIdSet.has(b.uuid)) - Number(initialPinnedNodeIdSet.has(a.uuid))
                if (initialPinnedDelta !== 0) {
                    return initialPinnedDelta
                }

                const enabledDelta = Number(b.isEnabled) - Number(a.isEnabled)
                if (enabledDelta !== 0) {
                    return enabledDelta
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
    }, [deferredSearch, initialPinnedNodeIdSet, initialSelectedNodeIdSet, selectedPreset, sourceFilter])

    const visibleNodes = useMemo(() => {
        if (filteredNodes.length <= visibleNodeCount) {
            return filteredNodes
        }

        return filteredNodes.filter(
            (node, index) =>
                index < visibleNodeCount ||
                selectedNodeIdSet.has(node.uuid) ||
                pinnedNodeIdSet.has(node.uuid)
        )
    }, [filteredNodes, pinnedNodeIdSet, selectedNodeIdSet, visibleNodeCount])

    useEffect(() => {
        setVisibleNodeCount(INITIAL_VISIBLE_READY_HOST_ROWS)
    }, [deferredSearch, presetUuid, sourceFilter])

    useEffect(() => {
        setSourceFilter(ALL_SOURCES_VALUE)
    }, [presetUuid])

    const loadMoreVisibleNodes = () => {
        setVisibleNodeCount((prev) =>
            Math.min(filteredNodes.length, prev + VISIBLE_READY_HOST_ROWS_STEP)
        )
    }

    const toggleNode = (nodeUuid: string) => {
        const isSelected = selectedNodeIdSet.has(nodeUuid)

        setSelectedNodeIds((prev) =>
            isSelected ? prev.filter((item) => item !== nodeUuid) : [...prev, nodeUuid]
        )

        if (isSelected) {
            setPinnedNodeIds((prev) => prev.filter((item) => item !== nodeUuid))
        }
    }

    const togglePinned = (nodeUuid: string) => {
        setSelectedNodeIds((prev) => (selectedNodeIdSet.has(nodeUuid) ? prev : [...prev, nodeUuid]))
        setPinnedNodeIds((prev) =>
            pinnedNodeIdSet.has(nodeUuid)
                ? prev.filter((item) => item !== nodeUuid)
                : [...prev, nodeUuid]
        )
    }

    const importManualNodes = async () => {
        if (!presetUuid) {
            notifications.show({
                color: 'red',
                message: 'Select a ready subscription preset first.'
            })
            return
        }

        const rawUris = extractVlessUris(manualImportInput)

        if (rawUris.length === 0) {
            notifications.show({
                color: 'red',
                message: 'Paste at least one vless:// URI.'
            })
            return
        }

        try {
            for (const rawUri of rawUris) {
                await createManualNodeMutation.mutateAsync({
                    presetUuid,
                    rawUri
                })
            }

            const refreshedPresets = await queryClient.fetchQuery({
                queryKey: externalVlessQueryKey,
                queryFn: fetchExternalVlessPresets
            })

            const refreshedPreset = refreshedPresets.find((preset) => preset.uuid === presetUuid)
            const importedNodes =
                refreshedPreset?.nodes.filter(
                    (node) => node.isManual && rawUris.includes(node.rawUri)
                ) || []

            if (importedNodes.length > 0) {
                setSelectedNodeIds((prev) =>
                    Array.from(new Set([...prev, ...importedNodes.map((node) => node.uuid)]))
                )
                setSourceFilter(MANUAL_SOURCE_VALUE)

                if (!remark.trim()) {
                    setRemark(
                        selectedPreset?.name ||
                            importedNodes[0].displayName ||
                            importedNodes[0].originalRemark ||
                            'Imported ready host'
                    )
                }
            }

            setManualImportInput('')

            notifications.show({
                color: 'teal',
                message:
                    rawUris.length === 1
                        ? 'VLESS imported into ready subscription and selected for this host.'
                        : `${rawUris.length} VLESS URIs imported into ready subscription and selected for this host.`
            })
        } catch (error) {
            notifications.show({
                color: 'red',
                message:
                    error instanceof Error
                        ? error.message
                        : 'Failed to import VLESS into ready subscription.'
            })
        }
    }

    const submit = () => {
        if (!remark.trim()) {
            notifications.show({
                color: 'red',
                message: 'Нужно указать название хоста'
            })
            return
        }

        if (!presetUuid) {
            notifications.show({
                color: 'red',
                message: 'Нужно выбрать категорию готовой подписки'
            })
            return
        }

        if (!configProfileUuid || !configProfileInboundUuid) {
            notifications.show({
                color: 'red',
                message: 'Нужно выбрать Config Profile и inbound'
            })
            return
        }

        if (selectedNodeIds.length === 0) {
            notifications.show({
                color: 'red',
                message: 'Нужно выбрать хотя бы один сервер'
            })
            return
        }

        const payload = {
            sourceType: 'READY_SUBSCRIPTION' as const,
            remark: remark.trim(),
            address: READY_HOST_ADDRESS,
            port: 0,
            path: '',
            sni: '',
            host: '',
            inbound: {
                configProfileUuid,
                configProfileInboundUuid
            },
            tag: normalizeTag(tag) || null,
            isDisabled,
            isHidden,
            readySubscription: {
                presetUuid,
                autoReplace,
                activeNodeLimit: Math.max(1, activeNodeLimit),
                selectedNodes: selectedNodeIds.map((nodeUuid) => ({
                    nodeUuid,
                    isPinned: pinnedNodeIdSet.has(nodeUuid)
                }))
            }
        }

        if (mode === 'edit' && host) {
            updateReadyHostMutation.mutate({
                uuid: host.uuid,
                ...payload
            } as UpdateHostCommand.Request)
            return
        }

        createReadyHostMutation.mutate(payload as CreateHostCommand.Request)
    }

    const isSubmitting = createReadyHostMutation.isPending || updateReadyHostMutation.isPending

    return (
        <Stack gap="md">
            <SimpleGrid cols={{ base: 1, md: 2 }}>
                <TextInput
                    label="Название хоста"
                    onChange={(event) => setRemark(event.currentTarget.value)}
                    description="Используй #x или #х, чтобы при нескольких активных серверах получить #1, #2, #3..."
                    placeholder="White RU #x"
                    value={remark}
                />
                <TextInput
                    label="Тег хоста"
                    onChange={(event) => setTag(event.currentTarget.value)}
                    placeholder="WHITE_RU"
                    value={tag}
                />
            </SimpleGrid>

            <HostSelectInboundFeature
                activeConfigProfileInbound={configProfileInboundUuid || undefined}
                activeConfigProfileUuid={configProfileUuid || undefined}
                configProfiles={configProfiles}
                onSaveInbound={(nextInboundUuid, nextConfigProfileUuid) => {
                    setConfigProfileUuid(nextConfigProfileUuid)
                    setConfigProfileInboundUuid(nextInboundUuid)
                }}
            />

            <Card padding="lg" radius="md" withBorder>
                <Stack gap="md">
                    <Group justify="space-between" wrap="wrap">
                        <div>
                            <Text fw={700}>Готовая подписка</Text>
                            <Text c="dimmed" size="sm">
                                Выбери категорию, отметь серверы и закрепи обязательные.
                            </Text>
                        </div>
                        <Badge variant="light">Выбрано: {selectedNodeIds.length}</Badge>
                    </Group>

                    <SegmentedControl
                        data={(presets || []).map((preset: ExternalVlessPreset) => ({
                            label: PRESET_TITLES[preset.slug] || preset.name,
                            value: preset.uuid
                        }))}
                        onChange={setPresetUuid}
                        value={presetUuid || undefined}
                    />

                    <SimpleGrid cols={{ base: 1, md: 3 }}>
                        <NumberInput
                            label="Активных серверов у хоста"
                            max={Math.max(1, selectedNodeIds.length)}
                            min={1}
                            onChange={(value) => setActiveNodeLimit(Number(value) || 1)}
                            value={activeNodeLimit}
                        />
                        <Switch
                            checked={autoReplace}
                            label="Автозамена при падении"
                            onChange={(event) => setAutoReplace(event.currentTarget.checked)}
                        />
                        <Switch
                            checked={isDisabled}
                            label="Отключить хост"
                            onChange={(event) => setIsDisabled(event.currentTarget.checked)}
                        />
                    </SimpleGrid>

                    <Group align="flex-end">
                        <Textarea
                            autosize
                            description="Imports vless:// URIs as manual nodes inside the selected ready subscription preset and selects them for this host."
                            label="Import to ready subscription"
                            minRows={3}
                            onChange={(event) => setManualImportInput(event.currentTarget.value)}
                            placeholder="Paste one or more vless:// URIs"
                            style={{ flex: 1 }}
                            value={manualImportInput}
                        />
                        <Button
                            disabled={!presetUuid || !manualImportInput.trim()}
                            loading={createManualNodeMutation.isPending}
                            onClick={() => {
                                void importManualNodes()
                            }}
                            variant="light"
                        >
                            Import
                        </Button>
                    </Group>

                    <Switch
                        checked={isHidden}
                        label="Скрыть хост из подписки"
                        onChange={(event) => setIsHidden(event.currentTarget.checked)}
                    />

                    <TextInput
                        label="Поиск по серверам"
                        onChange={(event) => setSearch(event.currentTarget.value)}
                        placeholder="Страна, мост, remark, IP, UUID"
                        value={search}
                    />
                    <Select
                        clearable={false}
                        data={sourceFilterOptions}
                        label="Источник"
                        onChange={(value) => setSourceFilter(value || ALL_SOURCES_VALUE)}
                        value={sourceFilter}
                    />

                    {filteredNodes.length > visibleNodes.length && (
                        <Text c="dimmed" size="sm">
                            Показано {visibleNodes.length} из {filteredNodes.length}. Выбранные и
                            закреплённые серверы всегда остаются в списке, остальное можно сузить поиском.
                        </Text>
                    )}

                    <Divider />

                    <ScrollArea.Autosize
                        mah={560}
                        onScrollPositionChange={({ y }) => {
                            const viewport = tableViewportRef.current
                            if (!viewport) {
                                return
                            }

                            const remaining =
                                viewport.scrollHeight - (y + viewport.clientHeight)

                            if (remaining <= 120 && visibleNodes.length < filteredNodes.length) {
                                loadMoreVisibleNodes()
                            }
                        }}
                        viewportRef={tableViewportRef}
                    >
                        <Table.ScrollContainer minWidth={1220}>
                            <Table highlightOnHover stickyHeader withColumnBorders>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th w={48}>Вкл</Table.Th>
                                        <Table.Th w={48}>Pin</Table.Th>
                                        <Table.Th w={150}>Пинг</Table.Th>
                                        <Table.Th w={320}>Сервер</Table.Th>
                                        <Table.Th w={150}>Страна</Table.Th>
                                        <Table.Th w={220}>Мост</Table.Th>
                                        <Table.Th w={100}>Статус</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {visibleNodes.map((node: ExternalVlessNode) => {
                                        const isSelected = selectedNodeIdSet.has(node.uuid)
                                        const isPinned = pinnedNodeIdSet.has(node.uuid)

                                        return (
                                            <Table.Tr key={node.uuid}>
                                                <Table.Td>
                                                    <Checkbox
                                                        checked={isSelected}
                                                        onChange={() => toggleNode(node.uuid)}
                                                    />
                                                </Table.Td>
                                                <Table.Td>
                                                    <ActionIcon
                                                        color={isPinned ? 'yellow' : 'gray'}
                                                        onClick={() => togglePinned(node.uuid)}
                                                        variant="subtle"
                                                    >
                                                        {isPinned ? (
                                                            <TbPinnedFilled size={18} />
                                                        ) : (
                                                            <TbPinned size={18} />
                                                        )}
                                                    </ActionIcon>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Tooltip label={renderProbeTooltip(node)} multiline withArrow>
                                                        <Badge
                                                            color={getLatencyColor(node)}
                                                            variant="light"
                                                        >
                                                            {formatLatency(getPreferredDisplayedLatency(node))}
                                                        </Badge>
                                                    </Tooltip>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Stack gap={2}>
                                                        <Text fw={600} lineClamp={1} size="sm">
                                                            {node.displayName}
                                                        </Text>
                                                        <Text c="dimmed" lineClamp={1} size="xs">
                                                            {node.originalRemark}
                                                        </Text>
                                                        <Text c="dimmed" lineClamp={1} size="xs">
                                                            Source: {getReadyNodeSourceLabel(node, selectedPreset)}
                                                        </Text>
                                                    </Stack>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Group gap={6} wrap="nowrap">
                                                        <Box>{resolveCountryCode(node.countryCode || '')}</Box>
                                                        <Text size="sm">{compactCountryLabel(node)}</Text>
                                                    </Group>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Text lineClamp={1} size="sm">
                                                        {compactBridgeLabel(node.bridgeLabel)}
                                                    </Text>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Badge
                                                        color={node.isAlive ? 'teal' : 'gray'}
                                                        variant="outline"
                                                    >
                                                        {node.isAlive ? 'онлайн' : 'оффлайн'}
                                                    </Badge>
                                                </Table.Td>
                                            </Table.Tr>
                                        )
                                    })}
                                </Table.Tbody>
                            </Table>
                        </Table.ScrollContainer>
                    </ScrollArea.Autosize>
                </Stack>
            </Card>

            <Group justify="flex-end">
                <Button loading={isFetching || isSubmitting} onClick={submit}>
                    {mode === 'edit' ? 'Сохранить готовый хост' : 'Добавить готовый хост'}
                </Button>
            </Group>
        </Stack>
    )
}
