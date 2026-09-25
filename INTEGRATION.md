## PF-ordreintegration – 22. september 2026

Server-side ordrekerne, manuel Quickpay-reservation (Stripe bevares til eksisterende ordrer), PF Gateway-overdragelse pr. produktionssted, versionsstyret korrekturindbakke, ejerens godkendelse, kontrolleret hævning og registrering af PF-kvittering er implementeret til test. PF's offentlige Gateway-manual dokumenterer ikke en korrekturgodkendelses-API; det trin er derfor manuelt og sporbart i admin. Live er spærret, indtil PF's leveringskanal, neutral forsendelse, fragt og testadgang er verificeret. Se [PAYMENTS.md](PAYMENTS.md) og [PF-ORDERS.md](PF-ORDERS.md). Ingen liveordre eller livehævning er udført.

## Aktuel status – 21. september 2026

Salgsprisreglen er PF Concepts nettopris × 2,0 for standardvarer og tryk, svarende til cirka 50 % bruttomargin før øvrige omkostninger. Caps og huer beholder den hidtidige effektive varefaktor på × 2,125. Kunden vælger farveantal særskilt for hver placering. Farveafhængige metoder bruger PF's prisrække for det valgte antal; broderi med fast pris tillader flere trådfarver uden ekstra opstart pr. farve. PF's samlede opstartspris for hver trykplacering får 50 % avance og rundes derefter op til nærmeste 50 DKK (fx 220 → 350 og 320 → 500); den ganges ikke yderligere med antal trykfarver. Småordretillæg viderefaktureres separat til kostpris uden avance. Moms beregnes på den samlede salgspris. Fragt er endnu ikke prissat, fordi leverandørens fragtpris mangler; når den tilsluttes, skal den også viderefaktureres uden avance. Det aktuelle prisfeed giver en varepris for 1.884 af 2.532 produkter. De 75 Citizen Green-produkter uden pris vises som “Kommer snart” med produktbillede, men uden design- eller købsmulighed. De øvrige produkter uden matchende SKU-pris skjules fortsat fra shoppen. Når PF leverer en gyldig varepris, skifter det enkelte Citizen Green-produkt automatisk til almindelig pris og købsflow efter næste prissynkronisering. Et direkte designlink til andre uprissatte varer viser en forklaring og et link til specialproduktion. Enkelte produkter kan bevidst vises med “Pris på forespørgsel” via `data/pf-quote-only.json`; listen er tom, indtil ejeren vælger konkrete varer. De går til en forespørgsel med produktnavn og varenummer frem for design/kurv uden pris. Den manglende prisliste ligger i `reports/pf-missing-prices.csv`. Kun varianter med gyldig salgspris kan vælges i designprocessen.

Den lokale købsrejse har nu en fælles PF-kurv. Produkter kan tilføjes med eller uden dekoration, antal kan ændres direkte i kurven, og en vare kan åbnes igen for at rette variant eller design. Serveren genberegner varepris, tryk, opstart/tillæg og moms ud fra leverandørens pristrin; browseren kan ikke indsende egne priser. Hvis et feed, et pristrin eller en prisregel mangler, står der “Pris afventer” i stedet for 0 kr. Kurven kan hentes som JSON, men betaling og ordreafsendelse er ikke aktiveret.

Offentlige danske produkt- og trykfeeds er nu importeret: 187 modeller og 463 SKU-varianter fra de 12 valgte premium-brands samt 12 konkret kuraterede modeller. De kuraterede tilføjelser er kraftige bomuldsbaserede tasker på 320–500 g/m², Rhythm-serien, tre enkle kuglepenne og Spring 500 ml-flasken. WorldSource-produktfeedet er også kontrolleret; det indeholder ingen af de valgte brands. Produktfeedets dato er 15. september, trykfeeds 17. september. Dette er et lokalt snapshot, ikke en aktiv synkronisering. Otte varianter har ingen trykvalg i de hentede feeds. 37 trykvalg mangler både JPG- og SVG-placeringsbillede og vises med en forklaring.

- `/produkter` viser PF-produkter; `/design/pf-<modelCode>` viser variantens egne metoder, placeringer, trykmål og originale placeringsbilleder. `/produkter?demo=1` og tryksager bevarer tidligere demo.
- Favoritter og designs gemmes lokalt i browseren under `pf-selection-v1` og `pf-designs-v1`. Filer ligger i IndexedDB. JSON-download indeholder referencer/filnavne; trykfiler skal vedlægges separat. Ingen ordre sendes.
- Importkommando: `npm run sync:pf`. Den henter fire offentlige produkt- og trykfeeds og erstatter kun snapshot efter fuldført normalisering. Denne fulde katalogimport har ingen automatisk tidsplan. Pris- og lagerfeed genindlæses derimod hver time, når alle tre feedkilder er konfigureret; intervallet kan ændres med `PF_PRICE_SYNC_INTERVAL_MINUTES`. Åbne browsersider kontrollerer prisstatus hvert femte minut.
- AI-serveradapter er implementeret mod OpenAI Images Edits, men ingen livegenerering er testet eller aktiveret. Kopiér `.env.example` til `.env`, indsæt `OPENAI_API_KEY`, og sæt `AI_ENABLED=1` for bevidst aktivering. Genstart lokalserveren efter ændringer. API-brug har separat forbrug. Nøglen sendes aldrig til browseren.
- AI-knappen bruger valgt produktfoto, PF-placeringsbillede og brugerens tekst/PNG/JPG. Den viser kun den aktuelt valgte placering. PDF kan gemmes til tryk, men anvendes ikke af AI. Resultatet er inspiration, ikke korrektur; ingen automatisk genbestilling eller billedgenerering.
- Der mangler stadig kontospecifikke pris-/lagerfeeds, salgsprisregler, betaling og ordreintegration. AI kræver konto/adgang og end-to-end-test med en rigtig API-nøgle. Offentlig drift kræver også brugeradgang og vedvarende rate-/forbrugsstyring; serveren er fortsat bundet til localhost.

Kilder: [PF datafeedmanual](https://thedigitalcatalogue.com/pdf/2025/data_feed_manual.pdf), [OpenAI Images Edits](https://developers.openai.com/api/reference/resources/images/methods/edit).

Nedenstående afsnit beskriver tidligere status og det resterende integrationsarbejde.

# Leverandører og næste skridt

Denne version kører kun lokalt. Der er ingen betaling, ordreafsendelse, mailafsendelse eller leverandørforbindelse.

## Verificeret leverandørgrundlag

- PF Concept beskriver XML/JSON-feeds til produktspecifikationer, billeder, priser og lager samt en Online Gateway API til ordrer: https://www.pfconcept.com/en_nl/general-terms (afsnit 5.3). Adgang, dokumentation, land/valuta, prisgrundlag og printdata skal bekræftes via kundeaftalen.
- Promidata beskriver Promotional Webshop med trykkonfigurator, prisberegning og PF Concept blandt leverandørerne: https://promidata.com/promotionalwebshop.php?lang=en . Promidatas support beskriver også logo-upload, tilbud, prøver og egne produkter: https://promidata.com/support-en . Dette dokumenterer ikke en frit tilgængelig headless API til denne frontend.
- Turtle blev undersøgt på forside, katalog og produkt. Inspirationen er synlig søgning, kategorier, billedbaserede produktkort, farver og tilbudskurv: https://www.turtle.dk/ . Ingen Turtle-aktiver eller tekster er kopieret.

## Datagrænse

`lib/catalog.mjs` er en udskiftelig demodatakilde på serveren. `publicProduct` i `lib/providers.mjs` er en allowlist til browseren. Indkøbspriser og credentials må kun ligge server-side; ingen af dem er konfigureret i demoen. Browseren modtager kun offentlige demopriser.

En fremtidig normaliseret leverandørpost indeholder leverandør-ID, produkt-ID, variant-SKU, tekster, kategorier, billeder, farver/størrelser, materialer, dokumenterede certifikater, lager/tidspunkt, mængdetrin, indkøbspris/valuta og trykbegrænsninger. Egne tekster, kategorier og salgsprisregler opbevares separat som editorial overrides. Offentlige salgspriser skal beregnes af serveren fra godkendte regler før offentliggørelse.

`mergeSnapshot` er en testet, ren forberedelsesfunktion, ikke en aktiv import. Den:
- Bevarer sidste komplette katalog ved fejl, delvise eller tomme feeds.
- Marker manglende produkter som udgåede kun efter et komplet, gyldigt snapshot.
- Afviser dubletter af produkt-ID inden for samme feed.
- Samler produkter på tværs af leverandører kun via verificeret canonicalKey (fx producent/GTIN); navne bruges ikke til automatisk sammenlægning.
- Holder egne tekster og prisregler adskilt fra importen.

Der mangler adapter, database, planlagt synkronisering, driftslogning og fast valg af leverandør for hvert produkt. Et legitimt tomt leverandørfeed kræver eksplicit håndtering, så en fejl ikke tømmer sortimentet.

## Konto og integrationsvalg

Ejeren har bekræftet en PF Concept-konto den 17. september 2026. Direkte PF Concept-integration undersøges først. Kontoens adgang til feeds/Gateway og det præcise API-omfang er endnu ikke bekræftet. Promidata er fortsat en mulighed, ikke et krav.

## Styrende mål: automatisk drift med manuel undtagelseshåndtering

Ejerens præcisering 17. september 2026: webshoppen skal kunne håndtere almindelige køb automatisk med PF Concept som fundament. Ejeren yder support, løser undtagelser og skaffer produkter, kunden ikke finder. Tilbudskurven i prototypen er derfor et midlertidigt trin, ikke den endelige standardrejse.

### To kunderejser

- **Standardprodukt:** vælg en faktisk leverandørvariant → vælg kun understøttet dekoration → beregn servervalideret salgspris → upload trykfil → kundens relevante godkendelser og betaling/faktura → overfør ordre én gang → vis bekræftet status og tracking, hvor integrationen understøtter det.
- **Særligt ønske:** “Kan du ikke finde det?” ved søgning, tomme resultater og kontakt. Indhent produktbeskrivelse, antal, deadline, budget og evt. reference. Opret en sag til ejeren; en sådan sag er ikke automatisk en leverandørordre. En specialvare kan senere blive et godkendt tilbud eller tilføjes kataloget.

### Backend før yderligere udbygning af demo-kataloget

1. Hent officielle PF Concept feed- og Gateway-specifikationer, kontorettigheder samt testmuligheder. Undersøg konkret understøttelse af dekorerede ordrer, trykfiler, korrekturer, status, fragt og direkte levering. Registrér hvad der kan automatiseres, og hvad der kræver manuel håndtering. Promidata er kun et alternativ efter tilsvarende afklaring af adgang og integration med vores frontend.
2. Indfør en varig database og serverlagring af trykfiler. Bevar leverandørprodukt-ID, variant-SKU, dekoration-ID og placering-ID gennem hele kunderejsen. Ingen produkt- eller trykvalg må alene være fritekst i standardordrer.
3. Synkroniser produktsortiment, billeder, varianter, indkøbspriser og tilgængelige trykdata efter dokumenterede intervaller. Ejerens udvalg af brands og egne salgsregler styrer publicering. Lager skal genkontrolleres før ordre, hvis leverandøren understøtter det; ukendt eller forældet datagrundlag sender ordren til manuel afklaring.
4. Beregn salgspriser på serveren ud fra godkendte regler: produkt, mængde, dekoration, opstart, fragt og momsgrundlag. Ingen automatisk ordre ved ukendt total eller utilstrækkeligt datagrundlag. Ændringer efter kundens accept kræver ny accept.
5. Gem ordren før overførsel i en holdbar kø. Brug entydig reference og dokumenteret dubletbeskyttelse; uklart svar/timeout afstemmes mod leverandøren før genforsøg. Et netværksgenforsøg må ikke skabe to indkøb. Tilstande for modtaget, valideret, afventer korrektur/betaling, klar til overførsel, afventer leverandør, bekræftet, afsendt og kræver handling holdes adskilt.
6. Korrektur og produktion skal følge den faktiske leverandørproces. En uploadet fil er ikke automatisk trykklar, og en forhåndsvisning er ikke en godkendt korrektur. Afklar rækkefølgen mellem ordre, korrektur og produktionsfrigivelse i Gateway-dokumentationen.
7. Giv ejeren et overblik over sager, ordrer og synkroniseringsfejl. Send besked ved relevante undtagelser: manglende varer, fejl i trykfil, afvist ordre, prisændring eller uafklaret levering. Kunden får kun leverandørbekræftede statusoplysninger.
8. Afprøv et godkendt ende-til-ende testforløb, inklusive dublerede hændelser, timeout, udsolgt variant og afvist fil, før automatisk drift aktiveres. Ingen rigtige indkøb eller afsendelser er autoriseret blot ved udvikling af prototypen.

**Status:** Dette er implementeringskrav. Ingen af ovenstående driftsfunktioner er tilsluttet endnu. Lokale browserdata og den nuværende Node-server er ikke en produktionsløsning til automatisk ordrebehandling.

## Før rigtige kunder

1. Vælg direkte PF Concept-feed eller afklar med Promidata, om denne frontend kan integreres, eller om deres webshop skal være platformen.
2. Indhent officielle adgangsoplysninger og dokumentation, inklusive brugsret til billeder og produkttekster. Indsæt aldrig nøgler i klientkoden.
3. Fastlæg eget sortiment, tryksagsleverandør, minimumsantal, salgspriser, tryk/opstart, fragt, momspræsentation og levering.
4. Tilføj rigtige kontakt- og virksomhedsoplysninger samt relevante handels- og persondataoplysninger.
5. Implementér backend til varig lagring af tilbud og trykfiler, servervalidering, filkontrol, spambegrænsning og faktisk modtagelse. Vis kun afsendt-status efter bekræftet modtagelse.
6. Aftal korrekturgodkendelse, fakturering/betaling og eventuel automatisk ordreoverførsel separat.

## Lokale data og aktiver

- Kurv: localStorage (`merch-cart-v1`). Logoer: IndexedDB (`trykeksperten-merch`), maks. 5 MB og PNG/JPG/PDF. Kontaktdata holdes kun i fanens hukommelse, indtil brugeren selv henter en tekstfil. Ingen data sendes fra demoformularerne.
- Tekstilbilleder og logo genbruges fra ejerens lokale `nordic-print-studio/KODE/public`. De er illustrationsbilleder i demokataloget, ikke bekræftede PF Concept-produkter. Rettigheder til offentlig brug skal følge ejerens oprindelige aftaler.
- Hero, flaske og mulepose er AI-genererede illustrationsbilleder. Tryksagskort viser egne eksempel-layouts.
- Alle SKU'er, mængdegrænser, priser og trykmuligheder er demo. Lager og levering er ukendt. Ingen certificeringer er angivet.

## Dokumentation modtaget 17. september 2026

### Datafeeds

Kilde: https://thedigitalcatalogue.com/pdf/2025/data_feed_manual.pdf — v3.6.7, maj 2026 (trods 2025 i URL).

Dansk produktfeed findes. Produkt- og trykdata opdateres dagligt, lager to gange dagligt og almindelige produkt-/trykpriser ugentligt. Prisfeeds er kundespecifikke og kræver aktivering. Datamodellen skal bevare modelCode, itemCode og trykkonfigurationer. minDecoQty er ikke nødvendigvis en hård minimumsgrænse; mindre dekorerede ordrer kan udløse tillæg. Faktisk lager og pris må ikke antages ud fra demoen.

### Gateway

Kilde: https://thedigitalcatalogue.com/pdf/2025/gateway_manual.pdf — v2.2.1, juni 2026.

Swagger: https://wsa.pfconcept.com/test/RestGateway/

Separat testmiljø og testlogin kræves. isTest er kun en reference og forhindrer ikke produktion. Gateway omfatter lagerforespørgsler, blanke/dekorerede ordrer og udgående bekræftelser/status/forsendelser. Trykfiler leveres via URL eller særskilt upload. Produktionsklare filer kræver aftale. Første succesrespons kan efterfølges af afvisningsmail; modtagelse er ikke endelig ordrebekræftelse. Lagerprodukter skal adskilles fra WorldSource/PFM-ordrer. Korrekturgodkendelse, callback-sikkerhed og dubletafstemning afklares med PF før implementering.

### Aktivering

Kilde: https://thedigitalcatalogue.com/pdf/2025/conditions_of_use_datafeeds.pdf

Dokumentet indeholder ansøgningsblanket for pris-, trykpris- og lagerfeed. Lagerfeed kræver særlig godkendelse. Vilkårene kræver brug af nyeste feedoplysninger og begrænser uforholdsmæssigt hyppige kald. Intet er underskrevet eller accepteret af agenten.

### Næste konkrete afhængighed

Afklar med PF, om kontoens feeds allerede er aktiveret, og få særskilt Gateway-testadgang. Modtag legitimationsoplysninger gennem lokal serverkonfiguration, aldrig som klientkode. Byg først read-only katalogimport, dernæst prissætning med ejerens regler, og til sidst ordreflow i testmiljø. Ingen faktiske ordrer er sendt, og ingen liveforbindelse er aktiveret.

## Bekræftede forretningsvalg

- Salg til private, virksomheder og foreninger. CVR må ikke kræves af private. Præsentation af moms og betalings-/forbrugervilkår skal fastlægges før lancering.
- PF skal håndtere vare, dekoration og levering; ejeren skal ikke fysisk håndtere produkter. Direkte levering og afsenderopsætning skal bekræftes med PF.
- Standardprodukter skal på sigt kunne bestilles og betales direkte. Kun validerede priser og konfigurationer må kunne købes. Betaling og automatisk ordreafsendelse er fortsat ikke tilsluttet.
- Specialproduktion og produkter, kunden ikke finder, skal gå til ejerens afklaring og tilbud. Et godkendt tilbud/design er forudsætning for videre ordreproces.
- Sortimentet kurateres med premium-brands og udvalgte billigere alternativer. Antal varer og avance er endnu ikke besluttet.
- Lokal specialproduktionsformular er implementeret på /specialproduktion med kundetype, beskrivelse, antal, budget, deadline og referencer. Gennemgang og tekstdownload virker lokalt; ingen henvendelser eller filer sendes.

### Produkter uden tryk

“Uden tryk” kan vælges, når PF-feedet udtrykkeligt angiver `decorationMandatory: No`. Manglende værdier og krav om dekoration giver ikke adgang til blanke valg. Variant og helt antal gemmes som et separat lokalt valg med `decoration: none`, uden logo, trykkode eller trykmål. Valget medtages i JSON-oversigten. Dette er fortsat produktvalg i en lokal prototype, ikke aktiv betaling eller ordreafsendelse.
