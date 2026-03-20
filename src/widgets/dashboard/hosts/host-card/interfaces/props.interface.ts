import {
    GetAllNodesCommand,
    GetConfigProfilesCommand
} from '@remnawave/backend-contract'

import { ExtendedHost } from '@shared/api/hooks/hosts/hosts.extended.schema'

export interface IProps {
    configProfiles: GetConfigProfilesCommand.Response['response']['configProfiles'] | undefined
    isDragOverlay?: boolean
    isHighlighted?: boolean
    isSelected?: boolean
    item: ExtendedHost
    nodes: GetAllNodesCommand.Response['response']
    onSelect?: () => void
}
