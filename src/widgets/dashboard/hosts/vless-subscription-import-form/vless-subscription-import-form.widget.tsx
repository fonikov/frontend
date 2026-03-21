import { GetConfigProfilesCommand } from '@remnawave/backend-contract'
import { Button, Group, Stack, Switch, Text, TextInput, Textarea } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useState } from 'react'

import { HostSelectInboundFeature } from '@features/ui/dashboard/hosts/host-select-inbound/host-select-inbound.feature'
import { queryClient } from '@shared/api'
import { QueryKeys, useImportHostsFromVlessSubscription } from '@shared/api/hooks'
import { ImportVlessSubscriptionRequestSchema } from '@shared/api/hooks/hosts/import-vless-subscription.schema'

type TConfigProfiles = GetConfigProfilesCommand.Response['response']['configProfiles']

type TProps = {
    configProfiles: TConfigProfiles
    onSubmitted: () => void
}

const normalizeTag = (value: string) => value.trim().toUpperCase()

export function VlessSubscriptionImportFormWidget({ configProfiles, onSubmitted }: TProps) {
    const [configProfileUuid, setConfigProfileUuid] = useState<string | null>(null)
    const [configProfileInboundUuid, setConfigProfileInboundUuid] = useState<string | null>(null)
    const [input, setInput] = useState('')
    const [tag, setTag] = useState('')
    const [isDisabled, setIsDisabled] = useState(false)
    const [isHidden, setIsHidden] = useState(false)

    const importMutation = useImportHostsFromVlessSubscription({
        mutationFns: {
            onSuccess: async (data) => {
                await queryClient.refetchQueries({
                    queryKey: QueryKeys.hosts.getAllHosts.queryKey
                })
                await queryClient.refetchQueries({
                    queryKey: QueryKeys.hosts.getAllTags.queryKey
                })

                notifications.show({
                    color: 'teal',
                    title: 'Import complete',
                    message: `Created ${data.createdCount} hosts, skipped ${data.skippedCount}.`
                })

                onSubmitted()
            }
        }
    })

    const handleSubmit = () => {
        if (!configProfileUuid || !configProfileInboundUuid) {
            notifications.show({
                color: 'red',
                message: 'Select config profile and inbound first.'
            })
            return
        }

        if (!input.trim()) {
            notifications.show({
                color: 'red',
                message: 'Paste a subscription URL or raw VLESS payload.'
            })
            return
        }

        importMutation.mutate({
            variables: {
                inbound: {
                    configProfileUuid,
                    configProfileInboundUuid
                },
                input: input.trim(),
                isDisabled,
                isHidden,
                tag: normalizeTag(tag) || null
            } satisfies typeof ImportVlessSubscriptionRequestSchema._type
        })
    }

    return (
        <Stack gap="md">
            <Stack gap={4}>
                <Text fw={700}>Import VLESS subscription into regular hosts</Text>
                <Text c="dimmed" size="sm">
                    This creates normal host entries in the shared hosts list. After import you can
                    reorder, disable, edit, and group them the same way as any other host.
                </Text>
            </Stack>

            <HostSelectInboundFeature
                activeConfigProfileInbound={configProfileInboundUuid || undefined}
                activeConfigProfileUuid={configProfileUuid || undefined}
                configProfiles={configProfiles}
                onSaveInbound={(nextInboundUuid, nextConfigProfileUuid) => {
                    setConfigProfileUuid(nextConfigProfileUuid)
                    setConfigProfileInboundUuid(nextInboundUuid)
                }}
            />

            <TextInput
                label="Host tag"
                onChange={(event) => setTag(event.currentTarget.value)}
                placeholder="IMPORTED_VLESS"
                value={tag}
            />

            <Group grow>
                <Switch
                    checked={isDisabled}
                    label="Create imported hosts as disabled"
                    onChange={(event) => setIsDisabled(event.currentTarget.checked)}
                />
                <Switch
                    checked={isHidden}
                    label="Hide imported hosts from subscriptions"
                    onChange={(event) => setIsHidden(event.currentTarget.checked)}
                />
            </Group>

            <Textarea
                autosize
                label="Subscription URL or raw payload"
                minRows={10}
                onChange={(event) => setInput(event.currentTarget.value)}
                placeholder="Paste https://... subscription URL, base64 payload, or raw vless:// lines"
                value={input}
            />

            <Text c="dimmed" size="xs">
                Imported entries are created as regular hosts. External credentials from the source
                subscription are not used as your panel credentials.
            </Text>

            <Group justify="flex-end">
                <Button loading={importMutation.isPending} onClick={handleSubmit}>
                    Import into hosts
                </Button>
            </Group>
        </Stack>
    )
}
