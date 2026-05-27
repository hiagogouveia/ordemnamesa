import type { LeadControlHubConfig } from '@/lib/admin-leads-control-hub/types'

export const config: LeadControlHubConfig = {
    appName: 'Ordem na Mesa',
    entityNoun: 'restaurante',
    panelBasePath: '/control-hub-admin',
    staffTableName: 'ordemnamesa_staff',
    adminEmailsEnv: 'ADMIN_EMAILS',
    whatsappAdminNumber: process.env.WHATSAPP_ADMIN_NUMBER ?? '',

    customFields: [
        {
            name: 'tipo_restaurante',
            label: 'Tipo de restaurante',
            type: 'select',
            required: true,
            options: [
                { value: 'fine_dining', label: 'Fine Dining' },
                { value: 'casual', label: 'Casual / Bistrô' },
                { value: 'fast_food', label: 'Fast Food' },
                { value: 'bar', label: 'Bar / Pub' },
                { value: 'cafeteria', label: 'Cafeteria' },
            ],
        },
        {
            name: 'numero_unidades',
            label: 'Quantidade de unidades',
            type: 'select',
            required: true,
            options: [
                { value: '1', label: '1 unidade' },
                { value: '2-3', label: '2 a 3 unidades' },
                { value: '4-5', label: '4 a 5 unidades' },
                { value: '6+', label: '6 ou mais unidades' },
            ],
        },
        {
            name: 'numero_funcionarios',
            label: 'Nº de funcionários',
            type: 'select',
            required: true,
            options: [
                { value: '1-5', label: '1 a 5' },
                { value: '6-15', label: '6 a 15' },
                { value: '16-50', label: '16 a 50' },
                { value: '50+', label: 'Mais de 50' },
            ],
        },
        {
            name: 'numero_mesas',
            label: 'Nº de mesas',
            type: 'select',
            required: true,
            options: [
                { value: '1-10', label: '1 a 10' },
                { value: '11-30', label: '11 a 30' },
                { value: '31+', label: 'Mais de 31' },
            ],
        },
        {
            name: 'observacoes',
            label: 'Observações (opcional)',
            type: 'textarea',
            required: false,
            placeholder: 'Conte um pouco sobre seu desafio operacional…',
        },
    ],

    whatsappTemplate: (lead) =>
        `Olá! Preenchi o formulário do Ordem na Mesa e quero conhecer 😊\n\nNome: ${lead.name}\nRestaurante: ${lead.organization_name}`,

    leadScoring: {
        hot: (lead) => {
            const tipo = String(lead.custom_fields?.tipo_restaurante ?? '')
            const func = String(lead.custom_fields?.numero_funcionarios ?? '')
            const unidades = String(lead.custom_fields?.numero_unidades ?? '')
            const isMultiUnit = ['2-3', '4-5', '6+'].includes(unidades)
            const isTargetType = ['fine_dining', 'casual'].includes(tipo)
            const hasScale = ['16-50', '50+'].includes(func)
            return isTargetType && (hasScale || isMultiUnit)
        },
        cold: (lead) =>
            lead.custom_fields?.tipo_restaurante === 'fast_food' &&
            lead.custom_fields?.numero_funcionarios === '1-5' &&
            (lead.custom_fields?.numero_unidades === '1' ||
                lead.custom_fields?.numero_unidades === undefined),
    },
}
