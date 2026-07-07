# Pepo – Opsætningsguide

Denne guide tager dig fra "intet oprettet" til en kørende app (registreringsside + adminsystem) på din egen computer.

---

## 1. Opret Supabase-projekt

1. Gå til [supabase.com](https://supabase.com) og opret en konto (gratis).
2. Klik "New project". Vælg et navn (fx `pepo`), en region tæt på Danmark (fx Frankfurt), og en database-adgangskode — gem den et sikkert sted, du får ikke brug for den i denne guide, men Supabase kan spørge om den senere.
3. Under "Security" kan du blive spurgt om "Enable automatic RLS" — slå den til. Det er Supabases anbefalede sikkerhedsindstilling og påvirker ikke noget i denne guide.
4. Vent 1-2 minutter mens projektet oprettes.

## 2. Kør database-schemaet

I **SQL Editor** i venstremenuen, kør disse filer i rækkefølge — hver fil i sin egen nye query (klik "New query" før du indsætter næste fil):

1. `pepo-database-schema.sql` — selve tabellerne
2. `pepo-seed.sql` — udfylder de 10 arbejdskategorier
3. `pepo-admin-rls.sql` — adgangsregler så admin-brugere kan se og godkende freelancere

> Bygger du fra bunden (nyt Supabase-projekt)? Så indeholder filerne ovenfor allerede alle rettelser, og du kan springe migrationsfilerne i "Migrationer" nederst i denne guide over.

## 3. Opret storage-bucket til profilbilleder

1. Gå til **Storage** i venstremenuen → **New bucket**.
2. Navn: `profile-images`. Slå **Public bucket** til. Klik "Create bucket".
3. Gå tilbage til **SQL Editor**, klik **"New query"**, indsæt indholdet af `pepo-storage-setup.sql`, og klik **Run**.

## 4. Hent dine API-nøgler

Du skal bruge tre værdier fra to forskellige steder i Supabase-dashboardet:

**Project URL** — gå til **Integrations** (stik-ikonet i venstremenuen) → **Data API**. Under "API URL" står en adresse i stil med `https://xxxxxxxx.supabase.co/rest/v1/`. Brug kun delen FØR `/rest/v1/`, altså `https://xxxxxxxx.supabase.co` → sæt den som `NEXT_PUBLIC_SUPABASE_URL`.

**De to nøgler** — gå til **Project Settings** (tandhjulet) → **API Keys**:
- **Publishable key** (starter med `sb_publishable_...`) → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Secret key** (starter med `sb_secret_...`, klik øjet for at se den) → `SUPABASE_SERVICE_ROLE_KEY`

   ⚠️ **Secret key er hemmelig** — den giver fuld adgang til databasen uden om alle sikkerhedsregler. Del den aldrig, og læg den aldrig i en fil der uploades til GitHub eller lignende. Den er gemt i Supabase, så du kan altid finde den igen her — du behøver ikke skrive den ned andre steder.

## 5. Sæt miljøvariabler op

1. I `webapp`-mappen: kopiér filen `.env.local.example` til en ny fil ved navn `.env.local`.
2. Åbn `.env.local` og indsæt de tre værdier fra trin 4.

## 6. Installér Node.js (hvis du ikke har det)

Download og installér fra [nodejs.org](https://nodejs.org) (vælg LTS-versionen), hvis du ikke allerede har Node.js på din computer.

## 7. Kør appen lokalt

Åbn en terminal, naviger til `webapp`-mappen, og kør:

```
npm install
npm run dev
```

Åbn `http://localhost:3000` — registreringssiden. Åbn `http://localhost:3000/admin` — adminsystemet (kræver login, se nedenfor).

---

## Admin-login

Der findes én admin-konto: **kasper@hjortenfeldt.com**. Adgangskoden sættes/nulstilles via en mail fra Supabase (Authentication → Users → klik på brugeren → "Send password recovery"), da Supabase-dashboardet ikke tillader at sætte en adgangskode direkte.

**Ny admin-bruger tilføjes sådan:**
1. Authentication → Users → "Add user" i Supabase-dashboardet, opret med email (ingen adgangskode nødvendig, brug "Send password recovery" bagefter).
2. Kør i SQL Editor: `insert into admin_users (id, full_name, email) values ('<UID fra trin 1>', 'Navn', 'email@...');`

---

## Fejlfinding

**"Vælg mindst én arbejdskategori" vises ikke noget at vælge mellem** — seed-scriptet i trin 2 er nok ikke kørt. Tjek `work_categories`-tabellen i Table Editor.

**Fejl om manglende miljøvariabler ved `npm run dev`** — tjek at `.env.local` findes (ikke kun `.env.local.example`) og at alle tre værdier er udfyldt.

**Billedupload fejler** — tjek at bucketen `profile-images` findes og er sat til Public, og at `pepo-storage-setup.sql` er kørt.

**"Din konto har ikke adgang til adminsystemet" ved login** — kontoen findes i Supabase Auth, men mangler en tilsvarende række i `admin_users`. Se "Admin-login" ovenfor.

---

## Hvad sker der, når nogen udfylder registreringsformularen?

Formularen sender data til en "server action" (`app/actions.ts`), som kører på serveren, ikke i browseren. Den opretter en login-konto (uden adgangskode — fremtidigt login sker via et link sendt på email), gemmer profiloplysningerne med status "afventer godkendelse", kobler de valgte arbejdskategorier på, og uploader profilbilledet hvis der er valgt et. Intet af dette er synligt for brugeren — de ser bare bekræftelsesskærmen.

## Hvad sker der i adminsystemet?

Admin logger ind med email/adgangskode (`app/admin/login`). Herefter kan admin se alle ansøgninger under **Freelancere**, filtrere på status, åbne en profil i detalje, og godkende/afvise. Under **Kunder** kan admin oprette, redigere og slette kunder — enten som firmakunde (firmanavn + CVR) eller privatkunde (kun kontaktperson). I modsætning til registreringssiden bruger adminsystemet IKKE service role-nøglen til at læse/skrive data — det bruger admins egen indloggede session, og adgangen er styret af RLS-regler i databasen (`pepo-admin-rls.sql`). Det betyder adgangsstyringen håndhæves af databasen selv, ikke kun af koden.

---

## Migrationer

Disse filer retter databasen til efter schemaet oprindeligt blev kørt (kun relevant for det allerede kørende Pepo-projekt — spring dem over ved en frisk opsætning, da rettelserne allerede er indbygget i filerne i trin 2):

1. `pepo-migration-clients-privatkunder.sql` — gør `clients.name` valgfrit
2. `pepo-migration-clients-cvr.sql` — tilføjer `cvr_number` til `clients`
3. `pepo-migration-normalize-phone.sql` — fjerner mellemrum fra eksisterende telefonnumre
4. `pepo-migration-clients-rls.sql` — adgangsregler så admin kan se/oprette/redigere/slette kunder
