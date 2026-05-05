import { redirect } from 'next/navigation'
import { config } from '@/lead-control-hub.config'

export default function ControlHubAdminIndex() {
    redirect(`${config.panelBasePath}/leads`)
}
