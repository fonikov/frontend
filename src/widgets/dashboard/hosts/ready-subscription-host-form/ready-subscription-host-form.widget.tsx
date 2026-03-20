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
    ScrollArea,
    SegmentedControl,
    SimpleGrid,
    Stack,
    Switch,
    Table,
    Text,
    TextInput,
    Tooltip
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
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

type TConfigProfiles = GetConfigProfilesCommand.Response['response']['configProfiles']

type TProps = {
    configProfiles: TConfigProfiles
    host?: ExtendedHost | null
    mode: 'create' | 'edit'
    onSubmitted: () => void
}

const PRESET_TITLES: Record<string, string> = {
    'auto-black': 'Black List',
    'auto-white-ru-ip': 'White List RU IP',
    'auto-white-foreign-ip': 'White List EN IP'
}

const normalizeTag = (value: string) => value.trim().toUpperCase()
const formatLatency = (latencyMs: null | number) => (latencyMs === null ? 'н/д' : `${latencyMs} ms`)
const compactCountryLabel = (node: ExternalVlessNode) =>
    (node.countryCode || node.countryLabel || 'N/A').toUpperCase()
const compactBridgeLabel = (bridgeLabel: string) =>
    bridgeLabel
        .split('/')
        .map((part) => part.trim())
        .filter(Boolean)
        .slice(0, 3)
        .join(' / ')
const hasPreferredProbeSuccess = (node: ExternalVlessNode) => {
    if (node.tcpLatencyMs === null) {
        return false
    }

    if (node.transportProbe === 'NONE') {
        return true
    }

    return node.transportLatencyMs !== null
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
        case 'TLS':
            return 'TLS/SNI'
        default:
            return 'TLS/SNI'
    }
}
const renderProbeTooltip = (node: ExternalVlessNode) => (
    <Stack gap={2}>
        <Text size="xs">IP:port: {formatLatency(node.tcpLatencyMs)}</Text>
        <Text size="xs">
            {getTransportProbeLabel(node)}:{' '}
            {node.transportProbe === 'NONE' ? 'не требуется' : formatLatency(node.transportLatencyMs)}
        </Text>
        <Text size="xs">Итог: {formatLatency(node.latencyMs)}</Text>
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
    const [autoReplace, setAutoReplace] = useState(true)
    const [activeNodeLimit, setActiveNodeLimit] = useState(1)
    const [isDisabled, setIsDisabled] = useState(false)
    const [isHidden, setIsHidden] = useState(false)
    const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
    const [pinnedNodeIds, setPinnedNodeIds] = useState<string[]>([])
    const [search, setSearch] = useState('')

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

    const filteredNodes = useMemo(() => {
        if (!selectedPreset) {
            return []
        }

        const normalizedSearch = search.trim().toLowerCase()
        return selectedPreset.nodes
            .filter((node: ExternalVlessNode) => {
                if (!normalizedSearch) {
                    return true
                }

                return [node.displayName, node.countryLabel, node.bridgeLabel, node.originalRemark]
                    .join(' ')
                    .toLowerCase()
                    .includes(normalizedSearch)
            })
            .sort((a, b) => {
                const selectedDelta =
                    Number(selectedNodeIds.includes(b.uuid)) - Number(selectedNodeIds.includes(a.uuid))
                if (selectedDelta !== 0) {
                    return selectedDelta
                }

                const pinnedDelta =
                    Number(pinnedNodeIds.includes(b.uuid)) - Number(pinnedNodeIds.includes(a.uuid))
                if (pinnedDelta !== 0) {
                    return pinnedDelta
                }

                const enabledDelta = Number(b.isEnabled) - Number(a.isEnabled)
                if (enabledDelta !== 0) {
                    return enabledDelta
                }

                const fullProbeDelta =
                    Number(hasPreferredProbeSuccess(b)) - Number(hasPreferredProbeSuccess(a))
                if (fullProbeDelta !== 0) {
                    return fullProbeDelta
                }

                const aliveDelta = Number(b.isAlive) - Number(a.isAlive)
                if (aliveDelta !== 0) {
                    return aliveDelta
                }

                const latencyA = a.latencyMs ?? Number.MAX_SAFE_INTEGER
                const latencyB = b.latencyMs ?? Number.MAX_SAFE_INTEGER
                return latencyA - latencyB
            })
    }, [search, selectedPreset, selectedNodeIds, pinnedNodeIds])

    const toggleNode = (nodeUuid: string) => {
        setSelectedNodeIds((prev) =>
            prev.includes(nodeUuid)
                ? prev.filter((item) => item !== nodeUuid)
                : [...prev, nodeUuid]
        )
        setPinnedNodeIds((prev) =>
            selectedNodeIds.includes(nodeUuid) ? prev.filter((item) => item !== nodeUuid) : prev
        )
    }

    const togglePinned = (nodeUuid: string) => {
        setSelectedNodeIds((prev) => (prev.includes(nodeUuid) ? prev : [...prev, nodeUuid]))
        setPinnedNodeIds((prev) =>
            prev.includes(nodeUuid) ? prev.filter((item) => item !== nodeUuid) : [...prev, nodeUuid]
        )
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
                    isPinned: pinnedNodeIds.includes(nodeUuid)
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
                    placeholder="White RU основной"
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
                            max={10}
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

                    <Switch
                        checked={isHidden}
                        label="Скрыть хост из подписки"
                        onChange={(event) => setIsHidden(event.currentTarget.checked)}
                    />

                    <TextInput
                        label="Поиск по серверам"
                        onChange={(event) => setSearch(event.currentTarget.value)}
                        placeholder="Страна, мост, remark"
                        value={search}
                    />

                    <Divider />

                    <ScrollArea.Autosize mah={560}>
                        <Table.ScrollContainer minWidth={1220}>
                            <Table highlightOnHover stickyHeader withColumnBorders>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th w={48}>Вкл</Table.Th>
                                        <Table.Th w={48}>Pin</Table.Th>
                                        <Table.Th w={320}>Сервер</Table.Th>
                                        <Table.Th w={150}>Страна</Table.Th>
                                        <Table.Th w={150}>Пинг</Table.Th>
                                        <Table.Th w={220}>Мост</Table.Th>
                                        <Table.Th w={100}>Статус</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {filteredNodes.map((node: ExternalVlessNode) => {
                                        const isSelected = selectedNodeIds.includes(node.uuid)
                                        const isPinned = pinnedNodeIds.includes(node.uuid)

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
                                                    <Stack gap={2}>
                                                        <Text fw={600} lineClamp={1} size="sm">
                                                            {node.displayName}
                                                        </Text>
                                                        <Text c="dimmed" lineClamp={1} size="xs">
                                                            {node.originalRemark}
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
                                                    <Tooltip label={renderProbeTooltip(node)} multiline withArrow>
                                                        <Badge
                                                            color={getLatencyColor(node)}
                                                            variant="light"
                                                        >
                                                            {formatLatency(node.latencyMs)}
                                                        </Badge>
                                                    </Tooltip>
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
