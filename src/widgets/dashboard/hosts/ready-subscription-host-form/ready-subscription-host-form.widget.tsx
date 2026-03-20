import {
    CreateHostCommand,
    GetConfigProfilesCommand,
    UpdateHostCommand
} from '@remnawave/backend-contract'
import { notifications } from '@mantine/notifications'
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
    TextInput
} from '@mantine/core'
import { useMutation, useQuery } from '@tanstack/react-query'
import { TbPinned, TbPinnedFilled } from 'react-icons/tb'
import { useEffect, useMemo, useState } from 'react'

import {
    externalVlessQueryKey,
    fetchExternalVlessPresets,
    type ExternalVlessNode,
    type ExternalVlessPreset
} from '@widgets/dashboard/hosts/external-vless-manager'
import { HostSelectInboundFeature } from '@features/ui/dashboard/hosts/host-select-inbound/host-select-inbound.feature'
import { type ExtendedHost } from '@shared/api/hooks/hosts/hosts.extended.schema'
import { resolveCountryCode } from '@shared/utils/misc/resolve-country-code'
import { QueryKeys } from '@shared/api/hooks'
import { instance, queryClient } from '@shared/api'

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
                message: 'Ready-хост создан'
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
                message: 'Ready-хост обновлен'
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
        return selectedPreset.nodes.filter((node: ExternalVlessNode) => {
            if (!normalizedSearch) {
                return true
            }

            return [
                node.displayName,
                node.countryLabel,
                node.bridgeLabel,
                node.originalRemark
            ]
                .join(' ')
                .toLowerCase()
                .includes(normalizedSearch)
        })
    }, [search, selectedPreset])

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
        setSelectedNodeIds((prev) =>
            prev.includes(nodeUuid) ? prev : [...prev, nodeUuid]
        )
        setPinnedNodeIds((prev) =>
            prev.includes(nodeUuid)
                ? prev.filter((item) => item !== nodeUuid)
                : [...prev, nodeUuid]
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

    const isSubmitting =
        createReadyHostMutation.isPending || updateReadyHostMutation.isPending

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
                                Выбери категорию, отметь конкретные серверы и закрепи обязательные.
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

                    <ScrollArea.Autosize mah={460}>
                        <Table highlightOnHover stickyHeader>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th w={48}>Вкл</Table.Th>
                                    <Table.Th w={48}>Pin</Table.Th>
                                    <Table.Th>Сервер</Table.Th>
                                    <Table.Th>Страна</Table.Th>
                                    <Table.Th>Ping</Table.Th>
                                    <Table.Th>Мост</Table.Th>
                                    <Table.Th>Статус</Table.Th>
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
                                                    <Text fw={600} size="sm">
                                                        {node.displayName}
                                                    </Text>
                                                    <Text c="dimmed" size="xs">
                                                        {node.originalRemark}
                                                    </Text>
                                                </Stack>
                                            </Table.Td>
                                            <Table.Td>
                                                <Group gap={6} wrap="nowrap">
                                                    <Box>{resolveCountryCode(node.countryCode || '')}</Box>
                                                    <Text size="sm">{node.countryLabel}</Text>
                                                </Group>
                                            </Table.Td>
                                            <Table.Td>
                                                <Badge
                                                    color={node.isAlive ? 'teal' : 'red'}
                                                    variant="light"
                                                >
                                                    {node.latencyMs ? `${node.latencyMs} ms` : 'таймаут'}
                                                </Badge>
                                            </Table.Td>
                                            <Table.Td>
                                                <Text size="sm">{node.bridgeLabel}</Text>
                                            </Table.Td>
                                            <Table.Td>
                                                <Badge
                                                    color={node.isAlive ? 'teal' : 'gray'}
                                                    variant="outline"
                                                >
                                                    {node.isAlive ? 'жив' : 'мертв'}
                                                </Badge>
                                            </Table.Td>
                                        </Table.Tr>
                                    )
                                })}
                            </Table.Tbody>
                        </Table>
                    </ScrollArea.Autosize>
                </Stack>
            </Card>

            <Group justify="flex-end">
                <Button loading={isFetching || isSubmitting} onClick={submit}>
                    {mode === 'edit' ? 'Сохранить ready-хост' : 'Добавить ready-хост'}
                </Button>
            </Group>
        </Stack>
    )
}
