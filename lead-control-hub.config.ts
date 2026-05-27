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
            name: 'categoria_restaurante',
            label: 'Qual categoria melhor descreve o restaurante?',
            type: 'select',
            required: true,
            options: [
                { value: 'cafeteria', label: 'Cafeteria' },
                { value: 'hamburgueria', label: 'Hamburgueria' },
                { value: 'pizzaria', label: 'Pizzaria' },
                { value: 'churrascaria', label: 'Churrascaria' },
                { value: 'restaurante_luxo', label: 'Restaurante de luxo' },
                { value: 'restaurante_casual', label: 'Restaurante casual' },
                { value: 'fast_food', label: 'Fast food' },
                { value: 'bistro', label: 'Bistrô' },
                { value: 'tematico', label: 'Temático' },
                { value: 'food_truck', label: 'Food Truck' },
                { value: 'gastrobar', label: 'Gastrobar' },
                { value: 'outros', label: 'Outros' },
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
            const categoria = String(lead.custom_fields?.categoria_restaurante ?? '')
            const func = String(lead.custom_fields?.numero_funcionarios ?? '')
            const unidades = String(lead.custom_fields?.numero_unidades ?? '')
            const isMultiUnit = ['2-3', '4-5', '6+'].includes(unidades)
            const hasScale = ['16-50', '50+'].includes(func)
            const isTargetCategory = ['restaurante_luxo', 'restaurante_casual', 'bistro', 'gastrobar', 'churrascaria'].includes(categoria)
            return isTargetCategory && (hasScale || isMultiUnit)
        },
        cold: (lead) => {
            const categoria = String(lead.custom_fields?.categoria_restaurante ?? '')
            const func = String(lead.custom_fields?.numero_funcionarios ?? '')
            const unidades = lead.custom_fields?.numero_unidades
            const isSmallFastFood = categoria === 'fast_food' || categoria === 'food_truck'
            return (
                isSmallFastFood &&
                func === '1-5' &&
                (unidades === '1' || unidades === undefined)
            )
        },
    },
}
