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
    Textarea
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { instance, queryClient } from '@shared/api'

type ExternalVlessNode = {
    aliasRemark: null | string
    countryCode: null | string
    displayCountry: null | string
    isAlive: boolean
    isEnabled: boolean
    isManual: boolean
    isPinned: boolean
    latencyMs: null | number
    originalRemark: string
    priority: number
    rawUri: string
    remarkTags: string[]
    uuid: string
}

type ExternalVlessPreset = {
    isEnabled: boolean
    lastSyncedAt: null | string
    name: string
    nodes: ExternalVlessNode[]
    selectionLimit: number
    slug: string
    sourceUrls: string[]
    uuid: string
}

type ExternalVlessResponse = {
    response: ExternalVlessPreset[]
}

const queryKey = ['external-vless', 'presets']

export function ExternalVlessManagerWidget() {
    const [manualUris, setManualUris] = useState<Record<string, string>>({})

    const { data, isFetching } = useQuery({
        queryKey,
        queryFn: async () => {
            const response = await instance.get<ExternalVlessResponse>('/api/external-vless/presets')
            return response.data.response
        }
    })

    const refresh = async () => {
        await queryClient.invalidateQueries({ queryKey })
    }

    const syncMutation = useMutation({
        mutationFn: async () => instance.post('/api/external-vless/actions/sync'),
        onSuccess: async () => {
            notifications.show({
                color: 'teal',
                message: 'External VLESS presets synced'
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
            setManualUris((prev) => ({ ...prev, [variables.presetUuid]: '' }))
            await refresh()
        }
    })

    return (
        <Stack gap="md" mb="lg">
            <Group justify="space-between">
                <div>
                    <Text fw={700} size="lg">
                        External VLESS
                    </Text>
                    <Text c="dimmed" size="sm">
                        Sync public VLESS feeds, keep your aliases, and expose only the best nodes.
                    </Text>
                </div>

                <Button loading={syncMutation.isPending || isFetching} onClick={() => syncMutation.mutate()}>
                    Sync presets
                </Button>
            </Group>

            <SimpleGrid cols={{ base: 1, xl: 2 }}>
                {(data || []).map((preset) => (
                    <Card key={preset.uuid} padding="lg" radius="md" withBorder>
                        <Stack gap="md">
                            <Group justify="space-between" wrap="wrap">
                                <div>
                                    <Group gap="xs">
                                        <Text fw={700}>{preset.name}</Text>
                                        <Badge color={preset.isEnabled ? 'teal' : 'gray'} variant="light">
                                            {preset.slug}
                                        </Badge>
                                    </Group>
                                    <Text c="dimmed" lineClamp={1} size="xs">
                                        {preset.sourceUrls.join(' | ')}
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
                                    label="Top hosts limit"
                                    max={25}
                                    min={1}
                                    onBlur={(event) => {
                                        const nextValue = Number(event.currentTarget.value)
                                        if (Number.isFinite(nextValue) && nextValue !== preset.selectionLimit) {
                                            presetMutation.mutate({
                                                uuid: preset.uuid,
                                                payload: { selectionLimit: nextValue }
                                            })
                                        }
                                    }}
                                />
                            </Group>

                            <Stack gap="xs">
                                <Text fw={600} size="sm">
                                    Manual add
                                </Text>
                                <Group align="flex-end">
                                    <Textarea
                                        autosize
                                        minRows={2}
                                        onChange={(event) =>
                                            setManualUris((prev) => ({
                                                ...prev,
                                                [preset.uuid]: event.currentTarget.value
                                            }))
                                        }
                                        placeholder="Paste vless:// URI"
                                        style={{ flex: 1 }}
                                        value={manualUris[preset.uuid] || ''}
                                    />
                                    <Button
                                        loading={createManualNodeMutation.isPending}
                                        onClick={() => {
                                            const rawUri = (manualUris[preset.uuid] || '').trim()
                                            if (!rawUri) return
                                            createManualNodeMutation.mutate({ presetUuid: preset.uuid, rawUri })
                                        }}
                                    >
                                        Add
                                    </Button>
                                </Group>
                            </Stack>

                            <Table.ScrollContainer minWidth={900}>
                                <Table highlightOnHover striped withColumnBorders>
                                    <Table.Thead>
                                            <Table.Tr>
                                                <Table.Th>Use</Table.Th>
                                                <Table.Th>Pin</Table.Th>
                                                <Table.Th>Latency</Table.Th>
                                                <Table.Th>Country</Table.Th>
                                                <Table.Th>Alias</Table.Th>
                                                <Table.Th>Original</Table.Th>
                                                <Table.Th>Tags</Table.Th>
                                            <Table.Th>Mode</Table.Th>
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {preset.nodes.map((node) => (
                                            <Table.Tr key={node.uuid}>
                                                <Table.Td>
                                                    <Switch
                                                        checked={node.isEnabled}
                                                        onChange={(event) =>
                                                            nodeMutation.mutate({
                                                                uuid: node.uuid,
                                                                payload: {
                                                                    isEnabled: event.currentTarget.checked
                                                                }
                                                            })
                                                        }
                                                    />
                                                </Table.Td>
                                                <Table.Td>
                                                    <Switch
                                                        checked={node.isPinned}
                                                        onChange={(event) =>
                                                            nodeMutation.mutate({
                                                                uuid: node.uuid,
                                                                payload: {
                                                                    isPinned: event.currentTarget.checked
                                                                }
                                                            })
                                                        }
                                                    />
                                                </Table.Td>
                                                <Table.Td>
                                                    <Badge
                                                        color={node.isAlive ? 'teal' : 'red'}
                                                        variant="light"
                                                    >
                                                        {node.isAlive
                                                            ? `${node.latencyMs ?? '?'} ms`
                                                            : 'offline'}
                                                    </Badge>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Badge variant="light">
                                                        {node.countryCode || node.displayCountry || 'UNK'}
                                                    </Badge>
                                                </Table.Td>
                                                <Table.Td miw={220}>
                                                    <TextInput
                                                        defaultValue={node.aliasRemark ?? ''}
                                                        onBlur={(event) => {
                                                            const nextValue = event.currentTarget.value
                                                            if (nextValue !== (node.aliasRemark ?? '')) {
                                                                nodeMutation.mutate({
                                                                    uuid: node.uuid,
                                                                    payload: { aliasRemark: nextValue }
                                                                })
                                                            }
                                                        }}
                                                        placeholder="Alias in subscription"
                                                    />
                                                </Table.Td>
                                                <Table.Td maw={280}>
                                                    <Text lineClamp={2} size="sm">
                                                        {node.originalRemark}
                                                    </Text>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Group gap={4}>
                                                        {node.remarkTags.map((tag) => (
                                                            <Badge key={tag} size="xs" variant="light">
                                                                {tag}
                                                            </Badge>
                                                        ))}
                                                    </Group>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Badge variant="outline">
                                                        {node.isManual ? 'manual' : 'auto'}
                                                    </Badge>
                                                </Table.Td>
                                            </Table.Tr>
                                        ))}
                                    </Table.Tbody>
                                </Table>
                            </Table.ScrollContainer>
                        </Stack>
                    </Card>
                ))}
            </SimpleGrid>
        </Stack>
    )
}
