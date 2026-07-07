# Pepo – Webapp

Next.js-app (TypeScript, App Router, Tailwind v4, Supabase) med Pepos registreringsside og adminsystem.

**Kom i gang:** se [SETUP.md](./SETUP.md) — trin-for-trin fra "intet oprettet" til kørende app.

## Struktur

**Registreringsside** (offentlig, `/`)
- `app/page.tsx` — henter arbejdskategorier fra Supabase
- `app/actions.ts` — server actions: opretter login, profil, kategorier og profilbillede
- `components/RegistrationForm.tsx` — det 4-trins registreringsflow (matcher `Prototyper/Pepo – Oprettelsesflow.html`)

**Adminsystem** (kræver login, `/admin`)
- `app/admin/login/` — login-side (email + adgangskode)
- `app/admin/(protected)/layout.tsx` — beskyttet layout: tjekker session + admin_users-medlemskab
- `app/admin/(protected)/freelancers/` — ansøgningsoversigt, filtre, godkend/afvis (matcher `Prototyper/Pepo – Admin freelancere.html`)
- `app/admin/(protected)/clients/` — kundeoversigt, opret/rediger/slet (matcher `Prototyper/Pepo – Admin kunder.html`)
- `components/admin/` — sidebar, freelancer-liste/detaljepanel og kunde-liste/formular
- `lib/format.ts` — delte formateringshjælpere (fx `normalizePhone`, der fjerner mellemrum fra telefonnumre ved gem)
- `proxy.ts` — beskytter alle `/admin`-ruter, kræver gyldig session (Next.js 16-konventionen — hed tidligere "middleware.ts")

**Fælles**
- `lib/supabase/client.ts` — browser-klient (anon-nøgle)
- `lib/supabase/admin.ts` — service role-klient (kun registreringsflowet, aldrig i browseren)
- `lib/supabase/server.ts` — session-bundet server-klient (adminsystemet, respekterer RLS)
- `app/globals.css` — designtokens fra det godkendte designsystem

## Kommandoer

```bash
npm install       # installér afhængigheder
npm run dev        # kør lokalt på http://localhost:3000
npm run build       # produktions-build
npm run lint        # tjek kodekvalitet
```
