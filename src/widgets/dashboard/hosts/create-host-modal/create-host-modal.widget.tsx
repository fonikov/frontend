import { CreateHostCommand, SECURITY_LAYERS } from '@remnawave/backend-contract'
import { zodResolver } from 'mantine-form-zod-resolver'
import { notifications } from '@mantine/notifications'
import { useTranslation } from 'react-i18next'
import { PiListChecks } from 'react-icons/pi'
import { useForm } from '@mantine/form'
import { Drawer, Tabs } from '@mantine/core'
import { useState } from 'react'

import { MODALS, useModalClose, useModalState } from '@entities/dashboard/modal-store'
import { BaseHostForm } from '@shared/ui/forms/hosts/base-host-form'
import { BaseOverlayHeader } from '@shared/ui/overlays/base-overlay-header'
import {
    QueryKeys,
    useCreateHost,
    useGetConfigProfiles,
    useGetInternalSquads,
    useGetNodes,
    useGetSubscriptionTemplates
} from '@shared/api/hooks'
import { queryClient } from '@shared/api'
import { VlessSubscriptionImportFormWidget } from '@widgets/dashboard/hosts/vless-subscription-import-form'

export const CreateHostModalWidget = () => {
    const { t } = useTranslation()

    const { isOpen } = useModalState(MODALS.CREATE_HOST_MODAL)
    const close = useModalClose(MODALS.CREATE_HOST_MODAL)

    const { data: configProfiles } = useGetConfigProfiles()
    const { data: nodes } = useGetNodes()
    const { data: internalSquads } = useGetInternalSquads()
    const { data: templates } = useGetSubscriptionTemplates()

    const [advancedOpened, setAdvancedOpened] = useState(false)
    const [activeTab, setActiveTab] = useState<string | null>('manual')

    const form = useForm<CreateHostCommand.Request>({
        mode: 'uncontrolled',
        name: 'create-host-form',
        validateInputOnBlur: true,
        onValuesChange: (values) => {
            if (typeof values.vlessRouteId === 'string' && values.vlessRouteId === '') {
                form.setFieldValue('vlessRouteId', null)
            }
        },
        validate: zodResolver(CreateHostCommand.RequestSchema),
        initialValues: {
            securityLayer: SECURITY_LAYERS.DEFAULT,
            port: 0,
            remark: '',
            address: '',
            inbound: {
                configProfileUuid: '',
                configProfileInboundUuid: ''
            }
        }
    })

    const handleClose = () => {
        close()
        setAdvancedOpened(false)
        setActiveTab('manual')

        form.reset()
        form.resetDirty()
        form.resetTouched()
    }

    const { mutate: createHost, isPending: isCreateHostPending } = useCreateHost({
        mutationFns: {
            onSuccess: async () => {
                handleClose()
                await queryClient.refetchQueries({
                    queryKey: QueryKeys.hosts.getAllTags.queryKey
                })
            }
        }
    })

    const handleSubmit = form.onSubmit(async (values) => {
        if (!values.inbound.configProfileInboundUuid || !values.inbound.configProfileUuid) {
            notifications.show({
                title: t('create-host-modal.widget.error'),
                message: t('create-host-modal.widget.please-select-the-config-profile-and-inbound'),
                color: 'red'
            })
            return null
        }

        let xHttpExtraParams
        let muxParams
        let sockoptParams

        try {
            xHttpExtraParams =
                values.xHttpExtraParams === ''
                    ? null
                    : JSON.parse(values.xHttpExtraParams as unknown as string)
        } catch {
            xHttpExtraParams = null
        }

        try {
            muxParams =
                values.muxParams === '' ? null : JSON.parse(values.muxParams as unknown as string)
        } catch {
            muxParams = null
        }

        try {
            sockoptParams =
                values.sockoptParams === ''
                    ? null
                    : JSON.parse(values.sockoptParams as unknown as string)
        } catch {
            sockoptParams = null
        }

        createHost({
            variables: {
                ...values,
                isDisabled: !values.isDisabled,
                sockoptParams,
                muxParams,
                xHttpExtraParams,
                inbound: {
                    configProfileInboundUuid: values.inbound.configProfileInboundUuid,
                    configProfileUuid: values.inbound.configProfileUuid
                }
            }
        })

        return null
    })

    form.watch('inbound.configProfileInboundUuid', ({ value }) => {
        const { configProfileUuid } = form.getValues().inbound
        if (!configProfileUuid) {
            return
        }

        const configProfile = configProfiles?.configProfiles.find(
            (configProfileItem) => configProfileItem.uuid === configProfileUuid
        )
        if (configProfile) {
            form.setFieldValue(
                'port',
                configProfile.inbounds.find((inbound) => inbound.uuid === value)?.port ?? 0
            )
        }
    })

    return (
        <Drawer
            keepMounted={false}
            onClose={handleClose}
            opened={isOpen}
            overlayProps={{ backgroundOpacity: 0.6, blur: 0 }}
            padding="lg"
            position="right"
            size="min(1400px, 96vw)"
            title={
                <BaseOverlayHeader
                    IconComponent={PiListChecks}
                    iconVariant="gradient-teal"
                    title={t('create-host-modal.widget.new-host')}
                />
            }
        >
            <Tabs keepMounted onChange={setActiveTab} value={activeTab}>
                <Tabs.List grow mb="md">
                    <Tabs.Tab value="manual">Manual host</Tabs.Tab>
                    <Tabs.Tab value="ready">VLESS subscription import</Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="manual">
                    <BaseHostForm
                        advancedOpened={advancedOpened}
                        configProfiles={configProfiles?.configProfiles ?? []}
                        form={form}
                        handleSubmit={handleSubmit}
                        internalSquads={internalSquads?.internalSquads ?? []}
                        isSubmitting={isCreateHostPending}
                        nodes={nodes!}
                        setAdvancedOpened={setAdvancedOpened}
                        subscriptionTemplates={templates?.templates ?? []}
                    />
                </Tabs.Panel>

                <Tabs.Panel value="ready">
                    <VlessSubscriptionImportFormWidget
                        configProfiles={configProfiles?.configProfiles ?? []}
                        onSubmitted={handleClose}
                    />
                </Tabs.Panel>
            </Tabs>
        </Drawer>
    )
}
