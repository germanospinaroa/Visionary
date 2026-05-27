# Supabase Setup

## Ya configurado en este repo

- Variables de entorno locales en `.env.local`
- Clientes separados:
  - browser
  - server SSR
  - admin service role
- Middleware SSR para cookies de Supabase
- Migraciones SQL para schema `pilot`
- Migración SQL para buckets y políticas de Storage
- Script de provisioning de buckets

## Estado remoto actual

- Buckets provisionados:
  - `survey-images`
  - `question-screenshots`
  - `analysis-artifacts`

## Lo que falta para aplicar el schema remoto

Para ejecutar las migraciones contra Supabase hace falta una de estas dos opciones:

1. `SUPABASE_ACCESS_TOKEN` y proyecto enlazado con Supabase CLI
2. Password de la base de datos para conexión SQL directa

## Comandos cuando tengas acceso CLI

```bash
npx supabase link --project-ref lbscvyjrnrgmpceookxi
npx supabase db push
```

## Archivos de migración

- `supabase/migrations/20251102120000_pilot_base.sql`
- `supabase/migrations/20251102121000_storage_policies.sql`
