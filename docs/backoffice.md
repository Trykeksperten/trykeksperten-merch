# Smerch backend – implementering og drift

Status 23. oktober 2026: implementeret og afprøvet lokalt. Produktionsdatabasen er **ikke** migreret eller aktiveret af dette arbejde. Kundebetaling forbliver lukket. Ingen test har sendt en ordre til PF, hævet penge eller sendt rigtig mail.

## Vurdering og arkitektur

Den eksisterende løsning har serverberegnede PF-priser, reserveret kortbetaling, PF-overførsel, versionsstyret korrektur, kundesvar, mockups og PDF-dokumenter. Ordrer og betalinger lå i separate JSON-filer; medarbejdersessioner lå i hukommelsen. Der manglede en samlet model for kunder, manuelle tilbud, roller, produktion og delleverancer.

Den nye kerne genbruger Node-serveren, den eksisterende PDF-skabelon og PF-/betalingsforløbene. SQLite på den eksisterende vedvarende disk passer til én serverproces. Databasen anvender foreign keys, WAL, FULL synchronous, transaktioner, migrationskontrol og optimistiske versionsnumre. Beløb regnes i heltalsøre og procent i basispunkter; multiplikation/afrunding sker med BigInt. Der benyttes DKK og 25 % dansk moms, afrundet pr. linje og fragt.

### Implementeret

- Relationelle tabeller for virksomhed, roller, kunder, produkter, varianter, pristier, tilbud/linjer, ordrer/linjer, filer, korrekturer, produktion, forsendelser/linjer, dokumentversioner, betalingsdokumentation, jobs, beskeder og historik.
- Ordre- og tilbudssnapshots bevarer beskrivelser, variant, antal, priser, tryk, opstart, rabat, fragt og moms. Manglende historiske beskrivelser opfindes ikke.
- Vedvarende, hashbeskyttede sessioner; scrypt-adgangskoder; cookies med HttpOnly/SameSite/Secure i produktion; loginbegrænsning og 180 forespørgsler/minut pr. bruger i den nye API.
- Administrator, salg, produktion, bogholder og kunde. Kunders opslag afgrænses på serveren til deres egen kundeidentitet. Kunder kan ikke ændre priser, se interne noter eller hente fakturagrundlag.
- `/backoffice.html`: kunder, tilbud, produkter/priser, ordrearbejde, fil-/korrekturversioner, produktion, delleverancer, dokumenter, beskeder, brugeradministration og driftsstatus. Adgang fra den eksisterende administrationsmenu.
- Accepterede tilbud konverteres atomisk til én ordre. Skrivehandlinger kræver en idempotensreference; genbrug med andet indhold afvises. Ændringer af eksisterende tilbud/kunder/ordrestater kontrollerer versionsnummer.
- Produktion kræver seneste godkendte korrektur ved personalisering. Den godkendte filversion fastholdes. Ny korrektur efter produktionsstart afvises.
- Delleverancer kan ikke overstige bestilt antal. Først når samtlige linjer er afsendt, markeres ordren fuldt afsendt. En forsendelsesbekræftelse i det nye arbejdsområde bruger den senest registrerede forsendelses konkrete antal.
- Fakturagrundlag, forsendelsesbekræftelse og kvittering genbruger Smerch-layoutet og har forskellige titler. Oplysninger gennemgås før generering. Dokumentversioner gemmes uforanderligt. Endeligt e-conomic-nummer registreres separat med dokumentationsreference.
- Kvittering kræver dokumenteret betaling. PF-betalingsordrer kan ikke manuelt markeres betalt; de bruger eksisterende betalingsudbyders verificerede svar. Manuelle tilbudsordrer kan registreres betalt efter afsendelse med beløb, dato, metode og bilagsreference. Dette hæver ingen penge.
- PDF-generering fra det nye arbejdsområde kører som vedvarende job. Mailjobs skelner intern note, kunde, bogholder og produktion. Et færdigt PDF-dokument fra samme ordre kan vedhæftes. Fakturagrundlag blokeres som kundebilag.
- Kundesvar på nye korrekturer opretter mailjob til korrektur@smerch.dk med ordrelænke. Godkendelse udløser hverken PF-frigivelse eller hævning.

## Opsætning

Kør `npm ci` på serverens Node-version. `better-sqlite3` skal kunne installeres på målplatformen (versionen understøtter Node 20). Lokal test er udført på Node 24; Render bruger aktuelt Node 20.18. Dette skal verificeres i Render-build før aktivering.

| Variabel | Formål |
| --- | --- |
| `SMERCH_DATABASE_ENABLED=1` | Aktiverer SQLite-lagring og nyt arbejdsområde. Uden flag returnerer den nye API 503. |
| `SMERCH_DATA_DIR` | Vedvarende privat datamappe, på Render `/var/data`. |
| `SMERCH_ADMIN_USERNAME` / `SMERCH_ADMIN_PASSWORD_HASH` | Opretter første administrator, hvis denne ikke findes. Hashformat er salt:hash fra scrypt. |
| `NODE_ENV=production` | Sikre sessionscookies. Kræver HTTPS på den offentlige server. |
| `CONTACT_SMTP_*` | Afsendelse af beskeder fra arbejdsområdet. |
| `PROOF_SMTP_*` | Notifikationer om kunders korrektursvar. |
| `SMERCH_CUSTOMER_BASE_URL` | Rodadresse til ordrelænker, normalt https://smerch.dk. |

Hemmeligheder opbevares i hostens miljø, ikke i Git. Første admin oprettes kun én gang; ændring af miljøets passwordhash ændrer ikke en eksisterende databasebruger. Deaktivering af en bruger tilbagekalder alle vedkommendes sessioner. Der er endnu ikke selvbetjent passwordnulstilling eller MFA; disse kræver særskilt implementering før en bred kundeportal åbnes.

## Aktivering på den eksisterende server

1. Udgiv kode og installer afhængigheder med databaseflaget slået fra. Kontrollér build på målplatformen.
2. Tag en **verificeret backup** af hele datamappen med alle skrivere stoppet: webserver, callbacks og baggrundsjob. Lukket checkout alene er ikke tilstrækkeligt. Indkommende callbacks skal kunne genleveres efter vedligeholdelsen.
3. Kør først mod en gendannet kopi: `SMERCH_DATA_DIR=/sti/til/kopi node scripts/migrate-backoffice.mjs --dry-run` og dernæst uden `--dry-run`. Afstem antal ordrer, beløb, betalingsstatus, PF-referencer, mockups, filer og dokumenter. Kontrollér især den rigtige ordre 7886901.
4. Med skrivninger stadig stoppet køres samme migration på den rigtige datamappe. Sæt `SMERCH_DATABASE_ENABLED=1` og genstart serveren.
5. Kontrollér `/health`, log ind, åbn `/backoffice.html`, kontrollér realordren og den eksisterende PF-visning. Kontrollér kundebetalingsspærringen med en uautoriseret forespørgsel. Overvåg afventende callbacks/jobs.
6. Behold JSON-filerne som historisk materiale. De er ikke længere den aktive ordrelagring. **Skift aldrig blot flaget tilbage til 0**: serveren nægter at starte i gammel lagring, når SQLite-filen findes.

Importen er atomisk og markeret som udført i databasen. Senere starter importerer ikke forældede JSON-filer igen. Eksisterende PF-originalfiler, korrekturfiler, legacy-mailkøer og andre private data ligger fortsat under deres eksisterende mapper; hele datamappen skal derfor med i backup. Historiske testordrer forbliver i PF-testvisningen og bliver ikke til bogføringsordrer.

## Status- og adgangsregler

- Tilbud: kladde → sendt → accepteret/afvist; accepteret → ordre. Der kræves acceptreference ved medarbejderregistreret accept. Kunden kan kun acceptere egne udsendte tilbud.
- Betalingsordre: afventer reservation → bekræftet; betaling og produktion har hver sin status. En reservation er ikke en betaling.
- Manuel produktion: afventer → klar → i produktion → afsluttet. Kundeaccept, actor, tidspunkt og korrekturversion lagres.
- Manuel levering: ikke afsendt → delvist afsendt → afsendt, beregnet ud fra linjeantal.
- PF-ordrer: eksisterende PF-/betalingsforløb er fortsat autoritativt. Det nye arbejdsområde viser status og link til originalordren. En komplet PF-underordre fordeles på de tilhørende ordrelinjer; en tvetydig delvis PF-meddelelse opfinder ikke antal. Afsendelsesdokument afventer afstemning, hvis linjeantal mangler.
- De gamle administrationsendpoints kræver fortsat administrator. Nye roller arbejder i det nye arbejdsområde; de har ikke automatisk adgang til alle eksisterende PF-handlinger.
- Nye manuelle tilbudsordrer sendes **ikke automatisk til PF** og får ikke automatisk betalingslink. Det er en bevidst integrationsgrænse, ikke en skjult ordreafsendelse.

## Jobs, fejl og e-mail

Worker kører hvert femte sekund i samme proces. PDF-jobs har højst tre forsøg med forsinkelse. Ændres ordren efter gennemgang, afvises PDF-jobbet: gennemse den aktuelle ordre igen. Et job, der strandede under en genstart, genoptages for PDF'er.

SMTP kan have modtaget en mail, selv om forbindelsen bagefter fejler. Derfor bliver fejl/afbrudte mailjob `uncertain` og **genforsøges ikke automatisk**. Afstem afsendt-mappen/SMTP-loggen, før en ny besked oprettes. Der loves ikke exactly-once SMTP-levering. Et stabilt Message-ID følger beskeden. Intern note opretter aldrig et SMTP-job. Modtager, bilag og tekst kontrolleres i formularen før afsendelse.

Driftssiden viser kø, forsøg og fejlkoder. `/health` kontrollerer også SQLite, når databasefunktionen er aktiv. Der er endnu ikke en ekstern alarmtjeneste; en driftansvarlig skal overvåge sundhed og fejlede/ukendte jobs. Nye fejllogs bruger faste koder uden kundedata eller hemmeligheder.

Den eksisterende PDF-knap på original PF-ordrevisning er bevaret. Når databasen er aktiv, bruger knappen også jobkøen og linker videre til dokumentstatus i arbejdsområdet. Dokumentet gemmes i den fælles databasehistorik. Uden databaseflag er den gamle synkrone funktion bevaret. Eksisterende PF- og ordremailkøer er bevaret; de er ikke omskrevet til den nye jobtabel i denne version.

## Backup og gendannelse

Med alle skrivninger stoppet:

```sh
node scripts/data-backup.mjs create /var/data /backup/smerch-YYYYMMDD --writes-paused
node scripts/data-backup.mjs verify /backup/smerch-YYYYMMDD
node scripts/data-backup.mjs restore /backup/smerch-YYYYMMDD /ny-tom-datamappe
```

Backup indeholder SHA-256-manifest og kopierer hele datamappen, herunder SQLite/WAL-filer og filbilag. Kopi under ændringer afvises. Destination skal være ny og ligge uden for kilden. Start først mod den gendannede mappe, kontrollér SQLite integrity/foreign keys, login, antal og beløb samt et PDF-/filopslag. Gendannelse af database, relationer og snapshots er afprøvet automatisk.

Opret en planlagt, krypteret offsite-backup med retention og regelmæssig restore-prøve hos driftsleverandøren. Dette er **ikke konfigureret** i dette arbejde. Ved rollback må ændringer siden backup ikke tabes: afstem nye betalinger/PF-callbacks før en ældre kopi bliver autoritativ.

## Afgrænsning før produktionsstart

- Én Smerch-virksomhed og én Node-proces på lokal vedvarende disk. Scoping findes i modellen; der er ikke en færdig flerfirma-SaaS eller horisontal skalering.
- Produktregisteret i arbejdsområdet bruges til manuelle tilbud. Eksisterende PF-katalog og prismotor bruges fortsat i webshoppen.
- Det eksisterende virksomhedslogin og den nye kunderolle er separate. Historiske kunder matches ikke automatisk alene på e-mail; administrator vælger korrekt kundetilknytning.
- Upload er PDF/PDF-kompatibel AI, PNG eller JPEG, højst 10 MB. Aktivt PDF-indhold afvises, filer serveres privat. Dette er ikke en antivirus-/CDR-tjeneste; øvrige filformater kræver særskilt behandling.
- PDF til bogholderen er et fakturagrundlag, aldrig en endelig faktura. e-conomic bruges manuelt. Der foretages ingen ny API-integration.
- Kundebetaling er stadig lukket. Hævning ved afsendelse og eksisterende korrekturkrav er ikke lempet.

## Verifikation

Seneste samlede kørsel: **339 tests bestået, 0 fejl**.

`npm test` omfatter adgang og CSRF, login efter genstart, kundeadskillelse, priser/moms/rabat, serverpris mod manipuleret input, tilbud→ordre, idempotens, stale writes, private filer, korrekturversion, produktion, overlevering, delleverancer/PDF-antal, dokumenteret betaling, SMTP-usikkerhed, PF-projektion samt backup/restore. Den eksisterende testpakke for PF, checkout og betalingsspærring er kørt med.

Browserprøve: login, oprettelse af demokunde, tilbud med 10 kasketter + tryk + opstart + fragt = 1.246,13 kr., og statusskift. Kun syntetiske data i separat lokal database. Screenshot: `output/backoffice/tilbud-demo.png`.
