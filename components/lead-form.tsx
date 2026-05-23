'use client'

import { useActionState, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { config } from '@/lead-control-hub.config'
import { submitLeadAction, type SubmitLeadResult } from '@/app/qualificacao/actions'

const INITIAL: SubmitLeadResult | null = null

const inputClass =
    'flex w-full min-w-0 flex-1 rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 ' +
    'dark:border-border-dark dark:bg-surface-dark dark:text-white dark:placeholder:text-[#5a7b88] ' +
    'h-12 lg:h-14 px-4 text-base font-normal leading-normal shadow-sm transition-all ' +
    'focus:border-primary focus:outline-0 focus:ring-0 dark:focus:border-primary'

const labelClass = 'mb-1.5 block text-sm font-semibold text-slate-700 dark:text-text-secondary'

function maskCnpj(v: string): string {
    return v.replace(/\D/g, '').slice(0, 14)
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2')
}

export function LeadForm() {
    const [state, formAction, pending] = useActionState(submitLeadAction, INITIAL)
    const [done, setDone] = useState(false)
    const [cnpj, setCnpj] = useState('')
    const searchParams = useSearchParams()
    const leadSource =
        searchParams?.get('source')?.trim() ||
        searchParams?.get('utm_source')?.trim() ||
        'organic'

    useEffect(() => {
        if (state?.ok) setDone(true)
    }, [state])

    if (done) {
        return (
            <div className="mx-auto max-w-md rounded-2xl border border-border-dark bg-surface-dark p-10 text-center shadow-2xl shadow-primary/10">
                <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                </div>
                <h2 className="text-2xl font-black text-white">Solicitação recebida!</h2>
                <p className="mt-2 text-sm text-text-secondary">
                    Nosso time entrará em contato pelo WhatsApp em breve.
                </p>
                {state?.whatsappUrl && (
                    <a
                        href={state.whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-success px-6 py-3.5 font-bold text-white shadow-xl shadow-success/30 transition-all duration-200 hover:scale-[1.02] hover:bg-success/90"
                    >
                        Falar agora pelo WhatsApp
                    </a>
                )}
                <Link
                    href="/"
                    className="mt-4 block text-sm text-text-secondary hover:text-primary"
                >
                    ← Voltar ao site
                </Link>
            </div>
        )
    }

    return (
        <form action={formAction} className="mx-auto w-full max-w-lg">
            <input type="hidden" name="lead_source" value={leadSource} />
            <div className="rounded-2xl border border-border-dark bg-surface-dark p-6 shadow-2xl shadow-primary/10 sm:p-8">
                <div className="mb-6">
                    <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                        🎯 Pré-cadastro qualificado
                    </span>
                    <h1 className="mt-3 text-2xl font-black text-white sm:text-3xl">
                        Comece a organizar seu restaurante
                    </h1>
                    <p className="mt-2 text-sm text-text-secondary">
                        Preencha em ~40 segundos. Nossa equipe entra em contato pelo WhatsApp.
                    </p>
                </div>

                <div className="space-y-4">
                    <Field label="Seu nome" name="name" required />
                    <Field label="Nome do restaurante" name="organizationName" required />
                    <label className="block">
                        <span className={labelClass}>
                            CNPJ do restaurante <span className="text-text-secondary font-normal">(opcional)</span>
                        </span>
                        <input
                            name="cnpj"
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            value={cnpj}
                            onChange={(e) => setCnpj(maskCnpj(e.target.value))}
                            placeholder="00.000.000/0000-00"
                            maxLength={18}
                            className={inputClass}
                        />
                    </label>
                    <Field label="E-mail" name="email" type="email" required />
                    <Field label="WhatsApp (DDD + número)" name="phone" type="tel" required placeholder="11999999999" />

                    <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-2">
                            <Field label="Cidade" name="city" />
                        </div>
                        <Field label="UF" name="state" maxLength={2} />
                    </div>

                    <div className="my-2 h-px bg-border-dark" />

                    <div className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                        Sobre seu restaurante
                    </div>

                    {config.customFields.map((field) => (
                        <CustomField key={field.name} field={field} />
                    ))}
                </div>

                {state?.error && (
                    <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                        {state.error}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={pending}
                    className="mt-6 flex h-12 w-full cursor-pointer items-center justify-center rounded-lg bg-primary px-4 text-base font-bold tracking-[0.015em] text-[#111e22] shadow-[0_4px_14px_0_rgba(19,182,236,0.39)] transition-all duration-200 hover:bg-[#0ea5d6] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 lg:h-14"
                >
                    {pending ? 'Enviando…' : 'Enviar solicitação'}
                </button>

                <p className="mt-4 text-center text-xs text-text-secondary">
                    Já tem conta?{' '}
                    <Link href="/login" className="font-semibold text-primary hover:underline">
                        Entrar
                    </Link>
                </p>
            </div>
        </form>
    )
}

function Field(props: {
    label: string
    name: string
    type?: string
    required?: boolean
    placeholder?: string
    maxLength?: number
}) {
    return (
        <label className="block">
            <span className={labelClass}>
                {props.label} {props.required && <span className="text-primary">*</span>}
            </span>
            <input
                name={props.name}
                type={props.type ?? 'text'}
                required={props.required}
                placeholder={props.placeholder}
                maxLength={props.maxLength}
                className={inputClass}
            />
        </label>
    )
}

function CustomField({
    field,
}: {
    field: (typeof config.customFields)[number]
}) {
    const labelEl = (
        <span className={labelClass}>
            {field.label ?? field.name} {field.required && <span className="text-primary">*</span>}
        </span>
    )

    if (field.type === 'select' || field.type === 'segmented') {
        return (
            <label className="block">
                {labelEl}
                <select
                    name={field.name}
                    required={field.required}
                    defaultValue=""
                    className={inputClass}
                >
                    <option value="" disabled>
                        Selecione…
                    </option>
                    {field.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                            {o.label}
                        </option>
                    ))}
                </select>
                {field.helper && <span className="mt-1 block text-xs text-text-secondary">{field.helper}</span>}
            </label>
        )
    }

    if (field.type === 'textarea') {
        return (
            <label className="block">
                {labelEl}
                <textarea
                    name={field.name}
                    required={field.required}
                    placeholder={field.placeholder}
                    rows={4}
                    className={
                        inputClass.replace('h-12 lg:h-14', 'min-h-[96px] py-3') + ' resize-y'
                    }
                />
                {field.helper && <span className="mt-1 block text-xs text-text-secondary">{field.helper}</span>}
            </label>
        )
    }

    if (field.type === 'boolean') {
        return (
            <label className="flex items-center gap-2 text-sm text-white">
                <input type="checkbox" name={field.name} value="true" className="h-4 w-4 accent-primary" />
                {field.label ?? field.name}
            </label>
        )
    }

    const inputType = field.type === 'email' ? 'email' : field.type === 'tel' ? 'tel' : 'text'
    return (
        <label className="block">
            {labelEl}
            <input name={field.name} type={inputType} required={field.required} className={inputClass} />
        </label>
    )
}
