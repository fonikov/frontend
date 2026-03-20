import {
    GetAllHostTagsCommand,
    GetConfigProfilesCommand
} from '@remnawave/backend-contract'

import { ExtendedHost } from '@shared/api/hooks/hosts/hosts.extended.schema'

export interface IProps {
    configProfiles: GetConfigProfilesCommand.Response['response']['configProfiles'] | undefined
    hosts: ExtendedHost[] | undefined
    hostTags: GetAllHostTagsCommand.Response['response']['tags'] | undefined
    selectedHosts: string[]
    setSelectedHosts: React.Dispatch<React.SetStateAction<string[]>>
}
