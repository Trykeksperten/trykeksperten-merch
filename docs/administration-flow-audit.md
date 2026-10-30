# Smerch: dagligt ordrearbejde og automatik

Kontrol og lokal implementering: 23. oktober 2026.

## Udgivelsesstatus

Denne gennemgang bygger på den eksisterende kode, Gateway-manual version 2.2.2 (august 2026), eksisterende tests og brugerens dokumenterede forløb for PF-ordre 7886901. De afgrænsede administrationsændringer er nu **pushet og udrullet** i commit `4a0ad2e42f655a5ea4fcaa3192c3d79a48bafd1f`. Render-release `dep-dbdr6lcs728c7382q1ag` er live. Den præcise produktionspakke er kontrolleret med **343 tests, 0 fejl**, med produktionsafhængigheder og uden databasekoden. Den større lokale pakke har 357 beståede tests inklusive databasearbejdet. Ingen rigtig ordre, PF-godkendelse, kundemail eller betaling er udført i denne gennemgang.

Den større, tidligere byggede SQLite-backend er fortsat lokal og inaktiv. Disse forbedringer kan arbejde med den eksisterende JSON-lagring; de kræver ikke, at produktionsdatabasen migreres nu. Arbejdsmappen indeholder også tidligere ændringer. Hele arbejdsmappen må derfor ikke udgives som én ukontrolleret ændring.

Kundebetaling forbliver lukket. Kundens korrektursvar udløser hverken PF-frigivelse eller hævning. Eksisterende krav om afsendelse af alle varer før hævning er bevaret. En reservation er ikke en betaling, og kvittering kræver registreret betaling og betalingsdato.

## 1. Kortlægning: hvad eksisterede allerede?

| Område | Eksisterende implementering før denne gennemgang | Mangel / unødvendigt manuelt arbejde |
| --- | --- | --- |
| Ordreoverblik | Søgning, skjulte testordrer, mockups, status, næste ansvarlige og dato/tid | Funktioner var spredt over oversigt, betalingsdetaljer og PF-indbakke; ingen selvstændig daglig leverings- og fejlvisning |
| Ordredetaljer | Produkter, tryk, farver, originalfiler, mockups, kundekontakt og historik | Flere store sektioner stod åbne samtidig; PF-registreringens ordvalg lignede vareafsendelse |
| Dokumenter | Fakturagrundlag, forsendelsesbekræftelse og kvittering med redigering, validering og gemte PDF-snapshots | Ingen ordrebekræftelse i samme PDF-værktøj; ingen tydeligt nummererede versioner i JSON-lagring eller direkte afsendelse af den valgte PDF |
| Korrektur | Filvalidering, versionshistorik, personligt 30-dages link, kundesvar, kommentarer/bilag, tid og versionskontrol | Automatisk modtagelse kræver et reelt opsat relæ; ingen offentlig PF-godkendelses-API i manualen |
| Korrekturmail | Branded invitation, svarmail, intern notifikation til korrektur@smerch.dk og højst to påmindelser efter 48 timer | Ingen samlet indstilling; SMTP-fejl blev tidligere genforsøgt uden at kende leveringsresultatet |
| PF-opdateringer | Autentificerede POST-callbacks for confirmation/status/shipment, messageId-deduplikering, tracking gemt og vist på ordre/kundeopslag | Ingen automatisk forsendelsesmail. Genlevering med nyt messageId kunne duplikere leverancer; afsendte vareantal blev ikke bevaret |
| Kundekommunikation | Intern note, email med gennemgang og særskilt genudsendelse af eksisterende dokumenter | Uklare grænser mellem generering, afsendelse og produktionsgodkendelse |

## 2. Enklere struktur, nu implementeret lokalt

Daglig navigation: **I dag → Alle ordrer → Korrekturer → Produktion → Leveringer → Fejl og mangler**.

- I dag viser opgaver med ansvarlig, næste skridt, produkt/antal, kendt mockup, ordrenummer samt dato/tid. Betalingsproblemer, manglende tracking og blokerede forløb løftes frem. Betalingsordrer uden PF-tilknytning vises særskilt.
- Statistik, produkter, virksomheder, marketing, integration og automatik ligger i en sekundær menu.
- Ordren har foldbare sektioner for dokumenter, beskedstatus, kundekontakt og historik. Den aktuelle ordre og næste handling er fortsat primære.
- Forsendelsesmail i kladde, fejl eller ukendt leveringsstatus vises på dagsoversigten og på ordren. Manglende tracking markeres også før en mail kan sendes.
- Kundens godkendelse og PF’s bekræftelse er adskilte. Efter manuel godkendelse på PF’s korrekturside kan medarbejderen bruge **Registrér PF-godkendelse**. Én formular registrerer den udførte overførsel og PF-bekræftelsen via de eksisterende validerede endpoints. Det er fortsat en medarbejderregistrering, ikke en API-kvittering fra PF. Feltet må ikke bruges blot fordi kunden har godkendt.

## 3. Dokumenter og afsendelse

Knapperne åbner automatisk udfyldte udkast for:

1. Ordrebekræftelse.
2. Fakturagrundlag til manuel oprettelse i e-conomic.
3. Forsendelsesbekræftelse.
4. Kvittering, kun efter registreret betaling.

Forløb: **Åbn udkast → gennemse/ret → kontrollér → generér PDF → hent eller gennemse og send den konkrete version**.

### Oplysninger og rettelser

Afsenderen er Smerch med virksomhedens juridiske oplysninger. Kunde/firma, faktureringsadresse, kontaktperson, CVR/EAN, reference, produkter, antal, priser, fragt, moms og bemærkninger udfyldes fra ordre og virksomhedsindstillinger. Tomme påkrævede felter markeres ved gennemgang; der opfindes ingen kreditfrist, faktureringsadresse eller varebeskrivelse.

Rettelser i formularen gælder **kun dokumentversionen**. Ordre og kunde ændres ikke. Dette står ved formularen. Den særskilte knap til at gemme virksomhedsindstillinger ændrer fælles standardoplysninger for fremtidige dokumenter; den er navngivet særskilt. Der er ingen implicit synkronisering tilbage til kunde eller ordre.

### Versions- og afsendelseshistorik

- Uforanderlige PDF-snapshots med versionsnummer pr. dokumenttype.
- Opret rettet version tager udgangspunkt i det gemte dokument. Den tidligere PDF beholdes.
- Samme genereringsreference med samme indhold returnerer samme dokument, også ved samtidige klik. Ændret indhold kræver ny reference.
- En ordreændring siden åbning af formularen afviser en forældet gennemgang.
- Gennemse og send viser modtager, emne og tekst. Bilaget er præcis den valgte PDF-version og regenereres ikke ved afsendelse.
- Fakturagrundlag har særskilt bogholdermodtager og må ikke sendes via kundekategorien. Bogholderadresse kan gemmes i virksomhedsindstillinger. Den er ikke gættet.
- Afsendelseshistorik viser modtager, tidspunkt, status og dokumentversion med link til det faktiske bilag. Et SMTP-resultat er accept hos mailserveren, ikke bevis for placering i modtagerens indbakke.
- Den endelige faktura og fakturanummer oprettes fortsat manuelt i e-conomic. Ingen ny e-conomic-integration er aktiveret.

Ved flere leverancer kan medarbejderen vælge den konkrete forsendelse. Dokumentet anvender de dokumenterede afsendte antal fra denne levering. Manglende eller tvetydige antal skal gennemgås; et samlet komplet-flag må ikke gøre den sidste delleverance til hele ordren.

## 4. Konkrete svar om PF

Kilde: `/Users/joakimsarsgaard/Downloads/gateway_manual.pdf`, version 2.2.2. Relevant: s.16 CommunicationEmail, s.28–29 status, s.30–34 ASN og JSON-eksempel. Det lokale kodegrundlag er `lib/pf-gateway.mjs`, `lib/pf-callback.mjs`, `lib/pf-orders.mjs` og callback-ruterne i `server.mjs`.

| Spørgsmål | Dokumenteret / eksisterende svar |
| --- | --- |
| Ordrestatus? | Ja, POST StatusChangedNotification med bl.a. PROCESSING, STALLED, PARTIAL SHIPPED, SHIPPED, COMPLETED og CANCELLED samt eventuel forventet afsendelsesdato. Koden gemmer PF-status og hændelsen. |
| Produktion? | PROCESSING og andre generelle statuskoder findes. Manualen dokumenterer ikke et detaljeret produktionsforløb eller en særskilt bekræftelse af korrekturgodkendelse. PROCESSING må ikke antages at være en godkendelseskvittering. |
| E-proof? | CommunicationEmail bruges til PF’s ordrekommunikation og skal være PF Store-bruger. Smerchs sikrede proof-inbox findes, men en mail/PDF bliver ikke automatisk koblet på blot fordi endpointet eksisterer. Et valideret relæ skal levere ordre-reference, besked-id og fil. |
| Transportør, trackingnummer og link? | Ja, i ShipmentNotification/ASN: carrier, shipDate, trackAndTrace.trackingId og trackingURL. Desuden item med SKU/quantity og reference med shipmentID/pickTicket i JSON-eksemplet. |
| Webhooks eller opslag? | Indgående POST-callbacks, direkte Basic Auth eller signeret relæ efter konfiguration. Der er ikke løbende polling af ordrestatus/e-proof i denne implementering. Pris-/lagerfeeds er en separat mekanisme. |
| Gemmes felterne? | Ja, samlet shipment på PF-ordre samt kopi på checkout. Nu bevares desuden konkrete leverancer, reference, SKU og afsendte antal. |
| Sender Smerch automatisk ved afsendelse? | Ikke før denne ændring. Nu findes en persistent kø og worker. Standard er gennemgang; automatisk afsendelse skal vælges aktivt efter PF-mailafklaring. |
| Sender PF til kunden? | Ikke dokumenteret entydigt for denne konto. CommunicationEmail er ordrekontakten, men det beviser ikke, at alle øvrige kunde-/transportørbeskeder er deaktiveret. Skal bekræftes hos PF. |
| Automatisk korrekturgodkendelse hos PF? | Ingen offentlig funktion fundet i den tilgængelige Gateway-manual. Der er ikke opfundet et endpoint eller automatiseret klik på PF’s godkendelsesknap. |

Koden har modtagere til disse beskedtyper; det er ikke i sig selv dokumentation for, at PF har aktiveret alle abonnementer for kontoen. En rigtig ASN med tracking er **ikke** modtaget eller afprøvet mod PF i denne gennemgang. Tidligere skærmbilleder for 7886901 dokumenterer ordrebekræftelse/status og manuel korrektur, ikke fuldt afsendelsesflow.

## 5. Automatisk forsendelsesflow

**Autentificeret ASN → ordrematch → gem/afstem leverance → opret mailudkast → gennemgang eller automatisk mail → gem afsendelsesresultat**.

- Hele ASN’er med flere ordrer behandles pr. ordre.
- Samme messageId behandles kun én gang. Samme leverance med nyt messageId samles desuden på stabil PF-forsendelsesreference eller trackingidentitet, så den ikke giver en ny mail.
- Der findes én køpost pr. ordre/leverance. Gentagne callbacks, samtidige sendeklik og workerkørsler sender ikke en allerede registreret sendt besked igen.
- Delleverancer har hver sin besked; teksten oplyser, at resten følger. Der opfindes ikke afsendte antal, hvis PF ikke har leveret dem.
- Ugyldige antal, ukendte SKU’er, overlevering eller modstridende komplet-flag giver afklaringsstatus. En sådan levering må ikke fremstå klar til hævning.
- Manglende transportør, gyldig dato eller gyldigt trackingnummer/link blokerer mailen. Senere korrektion med samme forsendelsesreference kan klargøre den oprindelige køpost.
- En køpost, der allerede er sendt, ændrer ikke indhold eller sender igen, fordi tracking senere ændres. En ny kundebesked om rettelsen er en bevidst manuel handling.
- Manglende SMTP-opsætning giver en synlig fejl og mulighed for genforsøg.
- Usikkert SMTP-resultat eller afbrudt afsendelse bliver `uncertain`. Systemet kan ikke love exactly-once hos SMTP. Der sker intet automatisk genforsøg. Medarbejderen skal afstemme mailkontoen og bekræfte, at beskeden ikke blev sendt, før genforsøg. Et stabilt Message-ID medsendes.
- Gamle historiske leverancer uden de nye stabile nøgler bliver ikke automatisk udsendt som nye kundemails alene ved installation. De kan fortsat behandles manuelt med eksisterende tracking-/kontaktværktøjer.

## 6. Korrekturflow og automatikindstillinger

Én samlet side har valg for:

| Hændelse | Standard | Mulige valg |
| --- | --- | --- |
| Ordrebekræftelse efter reservation | Automatisk, som hidtil | Automatisk / gennemgå og send |
| Kvittering til kunden for korrektursvar | Automatisk, som hidtil | Automatisk / gennemgå og send |
| Intern besked om kundens korrektursvar | Automatisk til korrektur@smerch.dk, som hidtil | Automatisk / gennemgå og send |
| Forsendelsesmail | Gennemgang | Gennemgang / automatisk, når PF’s kundemails er bekræftet deaktiveret |
| Ny e-proof via sikret indbakke | Gennemgang | Gennemgang / opret personligt link og send automatisk |
| Korrekturpåmindelser | Til, som hidtil | Til / fra; 48-timers interval, højst to påmindelser pr. aktiv invitation |

Aktivering af automatisk forsendelsesmail kan også behandle eksisterende klargjorte køposter. Det står på indstillingssiden. Indstillingen for PF-kundemails ændrer ikke PF’s konto; den registrerer medarbejderens afklaring hos PF.

Et nyt e-proof matches kun på en entydig Smerch-ordrereference og valideret fil. Ukendt ordre eller ugyldig fil afvises. Genlevering af samme besked/fil skaber ikke en ny korrekturversion. En ny fil får ny version og ophæver tidligere kundegodkendelse og gamle links. Automatisk udsendelse sker kun efter aktivt valg og en korrekt modtaget fil; eksterne links kan ikke erstatte selve PDF’en i denne automatik.

Godkendelse gemmes med konkret version, filhash, tidspunkt og kundens svar. En forældet godkendelse kan ikke frigive den nye version. En inaktiv betalingsreservation blokerer produktionsfrigivelse. Ingen korrekturhandling kalder capture.

Ordrebekræftelser og korrekturbeskeder har nu også en synlig ukendt-leveringstilstand frem for blinde SMTP-genforsøg. Manuelle beskeder og dokumentafsendelse bevarer eksisterende idempotens og afsendelseshistorik.

## 7. Test og resterende aktivering

**357 tests bestået, 0 fejl.** Den samlede testpakke er kørt efter backendændringerne. Efterfølgende ændring i PF-formularens klientvisning er syntakskontrolleret; de anvendte serverendpoints indgår i den beståede pakke.

Dækker bl.a. dokumentrettelser uden ordreændring, uforanderlige PDF-versioner, samtidige genereringer/afsendelser, valgt historisk bilag, forkert modtagerkategori, kundeadgang/CSRF, nye korrekturversioner, reservation og hævning, præcis ASN-form, gentagne og forsinkede callbacks uden tab af kendt tracking, flere ordrer/leverancer, manglende/ugyldig tracking, modsatrettede antal, mailfejl, manuel afstemning og automatikkens standarder. Tests benytter syntetiske data og falske SMTP-transporter.

Browserkontrol med separat lokal datasamling: login, dagsoversigt, produktionsfilter, automatikindstillinger, udfyldt dokument, dokumentrettelse, gennemgang, PDF-generering og versionshistorik. PDF-demo er renderet og kontrolleret visuelt. Ingen rigtig mail sendt.

### Prioriteret næste driftstrin

1. Udført: 24 afgrænsede filer udgivet mod aktuel live-kode. SQLite er holdt ude, og kundebetaling er fortsat lukket. Verificeret privat backup af 90 filer er taget før udrulning. Live-kontrol: health 200, kundebetaling afvist med 503, personale-API uden login afvist med 401. Ordre og checkout for 7886901 er uændrede sammenlignet med backup; mailafsendelser er uændrede.
2. Bekræft med PF, at kontoens confirmation/status/shipment-callbacks går til den tilsigtede HTTPS-adresse og godkendte authform. Afprøv en rigtig ASN uden at oprette en ny ordre eller hæve penge.
3. Afklar PF’s og transportørens eventuelle direkte kundemails. Vælg derefter mailpolitik. Start med gennemgang.
4. Etablér/verificér mail/PDF-relæ for indgående korrekturer. Uden relæ bruges den eksisterende manuelle upload og ét valg om udsendelse til kunden.
5. Afstem bogholderens adresse, virksomhedsstandarder og betalingsbetingelser. Fakturaer bliver fortsat oprettet i e-conomic.
6. Kontroller SMTP-accept og faktisk modtagelse på en aftalt intern testadresse, før nye automatiske kundemails aktiveres. Denne gennemgang har ikke sendt produktionsmails.

Den fremtidige direkte frigivelse til PF kræver en af PF bekræftet kanal/API. Den større databaserulning kræver separat backup, migrationstest og afstemning; den er ikke en forudsætning for at få et enklere dagligt ordreoverblik.
