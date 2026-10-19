# Trykeksperten Merch

Lokal webshop med PF-produktkatalog, søgning/filtre, designstudio, kurv, backoffice og Quickpay Payment Link med manuel hævning (Stripe bevares til tidligere ordrer). Betaling åbner først ved komplet konfiguration.

## Start

Kræver Node.js 20+ og `npm install` første gang.

```bash
npm run dev
```

Åbn http://localhost:5173. HTML/CSS/JS-ændringer vises efter genindlæsning. Node genstarter ved serverændringer. Stop med Ctrl+C.

## Kontrol

```bash
npm test
```

Kilde: `dist/` er frontend, `lib/` er pris- og integrationslogik, og `server.mjs` leverer sider og API'er. Ingen build er nødvendigt.

Se `INTEGRATION.md`, `PF-ORDERS.md` og `PAYMENTS.md` for leverandørkilder, betalingsaktivering og de trin, der mangler før live-drift. Betaling er lukket, indtil Quickpay og dokumenteret fragt er konfigureret. PF-afsendelse efter verificeret reservation er implementeret til test, men live afventer PF-aftaler og produktionsklar drift.

## Dansk og engelsk

Webshoppen har DA/EN-sprogvalg i headeren. Valget gemmes lokalt; kurv, formularfelter og kundens design ændres ikke ved sprogskift. `?lang=en` kan bruges som direkte indgang.

UI-oversættelser vedligeholdes i `dist/english-ui.mjs`. Kør `npm run sync:english` efter opdatering af PF-kataloget for at hente leverandørens engelske produkttekster. Manglende leverandørmodeller suppleres i `data/translations/pf-en-overrides.json`; synkronisering fejler ved ukendte modeller. `npm test` kontrollerer, at alle produktnavne er dækket. Kundens logoer og tekster sendes ikke til en oversættelsestjeneste. Leverandørens PDF-filer bevarer originalsproget.

## Handelsbetingelser, privatliv og marketing

Offentlige sider: `/handelsbetingelser`, `/privatlivspolitik`, `/fortryd-aftale` og `/marketing`; alle har dansk/engelsk via `?lang=en`. Kundetekster ligger i `dist/legal/`. Den tidligere fil i `reports/` er et historisk arbejdsudkast og må ikke bruges som den offentliggjorte politik.

Marketing er en selvstændig, frivillig tilmelding, som ikke følger af et køb eller en henvendelse. E-mail og SMS er separate samtykker. Der indsamles ikke samtykke til salgsopkald, tredjepartsmarketing, tracking eller profilering. Serveren gemmer kanal, samtykketekst, version, tidspunkt og afmelding i det private dataområde; backoffice har Marketingvalg og Fortrydelser. Ingen marketingkampagner sendes af denne implementering. Før hver udsendelse skal den aktuelle afmelding og samtykkets fortsatte gyldighed kontrolleres. Hver besked skal indeholde en gratis, enkel afmeldingsmulighed; listen må ikke bruges til andre formål eller deles med en marketingudbyder uden nødvendig aftale og information.

Fortrydelser registreres uafhængigt af mail og giver en downloadbar kvittering med tidsstempel. E-mailkopier sættes i kø ved mailfejl og forsøges igen hvert minut. Backoffice skal gennemgå meddelelserne; registreringen annullerer ikke automatisk PF-ordrer eller betalinger. Behandl rettidige fortrydelser og tilbagebetalinger inden lovens frister.

Nye checkout-sessioner kræver kundetype, aktuel vilkårsversion, særskilt accept af forudbetaling og information om personlig tilpasning. Vilkår og privatlivspolitik gemmes som versionsfast kopi på ordren. Ved verificeret betalingsreservation sættes en ordrebekræftelse med kopierne som vedhæftninger i mailkø. Hævning før produktion kræver dokumenteret accept af forudbetaling; ældre ordrer uden denne accept skal afklares manuelt.

Inden onlinebestilling kan åbnes, skal one.com SMTP fungere og leveringstiderne være bekræftet. De bekræftede standarder i `dist/delivery-terms.mjs` er 7–10 hverdage efter godkendt korrektur for personaliserede produkter og 2–4 hverdage uden logo. `SMERCH_DELIVERY_TERMS_DA` og `SMERCH_DELIVERY_TERMS_EN` kan tilsidesætte standarderne; hold eventuelle overrides ajour med hjemmesidens leveringstider. Eksisterende PF/Quickpay-livekrav gælder fortsat. Ved manuelle korrekturgodkendelser skal medarbejderen have kundens udtrykkelige godkendelse af den konkrete version og bevare dokumentation; et internt klik er ikke kundens accept.

Driftsansvarlig skal dokumentere databehandleraftaler/roller, eventuelle tredjelandsoverførsler og øvrige modtagere (fx bogholder og senere marketingplatform). Politikken beskriver nødvendige formål og kriterier for opbevaring, ikke en automatisk slettegaranti. Indfør regelmæssig gennemgang af serverordrer, designfiler, marketinghistorik, fortrydelser, mailkøer, one.com-postkasser og backups. Slet/anonymisér materiale uden fortsat formål. Bogføringsmateriale følger lovens fem år efter regnskabsårets afslutning; kopier, originalfiler og henvendelser skal vurderes selvstændigt. Dokumentér nødvendigheden af længere opbevaring ved konkrete tvister. Behandl indsigts- og sletteanmodninger inden de lovbestemte frister. Ved nye leverandører, AI-funktioner, cookies eller nye marketingformål skal politik og nødvendige samtykker opdateres før aktivering.

### Udvalgt sortiment

Alle nuværende PF-produkter er valgt (`config/assortment.json`, version 3). Tidligere sortimentsvalg nulstilles ved overgangen til version 3 efter ejerens ønske; efterfølgende fravalg bevares. Produkter skal fortsat opfylde webshoppens pris- og variantkrav for at blive vist. Hele PF-kataloget bevares. Under **Medarbejderlogin → Produkter** kan medarbejdere søge og filtrere alle importerede produkter, se billeder og produktdetaljer samt vælge **Vis i webshop** eller **Skjul i webshop**.

Valgene gemmes atomisk i `assortment.json` under `SMERCH_DATA_DIR` og overlever katalogimporter. Nye PF-produkter er skjult, indtil de vælges. Sørg for vedvarende lager til datamappen i produktion. Sortimentsændringer påvirker katalogvisningen; eksisterende ordrer bevarer deres produktdata.

Under **Produkter → Købs- og salgspriser** vises PF-varepriser pr. variant og antalstrin. Salgspriser redigeres i DKK ekskl. moms med forhåndsvisning inkl. moms. Manuelle priser gemmes i `sale-prices.json` under `SMERCH_DATA_DIR`, overlever PF-synkronisering og anvendes af både produktvisning, tilbud, kurv og checkout. **Brug automatiske priser** fjerner variantens manuelle priser. Købspriser udleveres kun til medarbejdere med aktiv session; tryk, opstart og fragt ændres ikke af denne vareprisredigering.

### Kundekorrektur via Smerch

I `/admin/pf-orders` uploades PF's PDF/PNG/JPG med korrekturreferencen. Vælg **Send korrektur til kunden**, og tilføj en kort forklaring på eventuelle tekniske rettelser. Et eksternt PF-link skal erstattes med selve filen før udsendelse. Kundens mailadresse hentes fra checkout, ikke fra et frit modtagerfelt.

Kunden modtager et personligt link til `/korrektur`, kan godkende den aktuelle version eller sende et ændringsønske med op til tre bilag. En ny filversion eller et nyt personligt link gør det gamle link ugyldigt. Links udløber efter 30 dage. Filhash, version, tidspunkt, kommentarer og bilag gemmes med beslutningen. Kundevisningen indeholder ikke indkøbspriser eller PF-adgangsoplysninger.

Backend opdeler sagerne i **Kræver Smerch**, **Afventer kunde**, **Afventer PF** og **Produktion / afsluttet**. Kopiér kundens beslutning til PF's aftalte kanal; vedhæft kundens bilag manuelt, og registrér afsendelsesreference og PF's kvittering. Kundeordrer kan ikke længere godkendes på kundens vegne med medarbejderknappen. Kundens godkendelse hæver ikke automatisk betaling og sender ikke automatisk noget til PF. Eksisterende betalings- og produktionsspærrer gælder stadig.

Mailkøen bruger den eksisterende `CONTACT_SMTP_*`-forbindelse og gemmes privat i `SMERCH_DATA_DIR/proof-mail`. Serveren forsøger levering hvert minut, med mindst 15 minutter mellem fejlede forsøg. Der sendes højst to påmindelser med 48 timers mellemrum; de stopper ved svar, udløb eller ny korrektur. Se mailstatus på ordren. `SMERCH_CUSTOMER_BASE_URL` kan sætte kundesidens HTTPS-origin (standard `https://smerch.dk`); leverandørens API-host bruges ikke som kundelink.

Modtagelse fra PF kan fortsat ske via den eksisterende signerede korrekturindbakke eller manuel upload. Ingen mailindbakke-integration eller automatisk godkendelseskanal hos PF er aktiveret af denne ændring. Pris-, produkt- eller leveringsændringer skal afklares særskilt; en korrekturgodkendelse ændrer ikke den betalte ordre.

PF bekræftede 19. oktober 2026, at lagervarer kan bestilles med tryk fra 1 stk. `minDecoQty` bruges som tærskel for et eventuelt `LTMCharge`, ikke som et fast trykminimum. Et eksplicit gebyr på 0 accepteres; manglende eller ugyldige gebyrer og manglende pristrin kræver stadig afklaring. Lagerkontrol ved bestilling er fortsat påkrævet. Specialproduktion følger sit særskilte forespørgselsforløb.

Lagervarer uden tryk kræver særskilt PF-bekræftet afsendelsesland (`SMERCH_BLANK_SHIPPING_COUNTRY`) og fragtpris ekskl. moms (`SMERCH_FREIGHT_BLANK_EX_VAT_DKK`). Ingen af dem udledes af trykstedet. Hævning af disse ordrer kræver PF-afsendelsesbesked for alle varegrupper og sker manuelt fra ordreadministrationen. Varer med og uden tryk bestilles i separate ordrer, så korrektur, hævning og fragt ikke blandes.

Ved åbning: behold `dist/launch-config.mjs` lukket indtil PF-ordrebekræftelse, korrektur, betalingsreservation/hævning, e-mail og forsendelsesstatus er verificeret samlet. Nedtællingen åbner ikke checkout. `SMERCH_CUSTOMER_BASE_URL` skal være webshopadressen (smerch.dk i produktion); callbacks bruger fortsat `SMERCH_PUBLIC_BASE_URL` (api.smerch.dk). Kundens browser-origin accepteres kun for disse eksplicit konfigurerede adresser.

PF-afsendelse af lagervarer uden tryk fra Polen er bekræftet af butiksejeren (19. oktober 2026). Landet er intern ordreinformation. PF oplyser på https://www.pfconcept.com/en_nl/shipping-options, at fragt afhænger af service og ordrestørrelse og beregnes før bestilling. Den nuværende Gateway-integration indhenter ikke en fragtpris; et fast beløb må ikke bruges som PF-beregning. Butiksejeren har fastsat kundens fragt til 150 kr. ekskl. moms (187,50 kr. inkl. moms) pr. ordre til Danmark, både med og uden logo. Dette er butikkens salgspris for fragt, ikke en beregning af PF’s faktiske fragtomkostning. Beløbet er konfigureret i `render.yaml` og `.env.example`; bestillinger er fortsat lukket frem til den særskilte livegodkendelse.


## Virksomhedssider og faste designs

Virksomhedslogin er midlertidigt fjernet fra footeren. Funktionen findes stadig på `/virksomhed` og i administrationen, adskilt fra medarbejderadgang. Racketclub er defineret i `config/companies.json` uden adgangskode. Aktivér login under **Administration → Virksomheder → Loginoplysninger**. Adgangskoden hashes med scrypt og gemmes kun i den private `companies.json` under `SMERCH_DATA_DIR`; ingen adgangskode eller hash publiceres til GitHub. Virksomhedssessioner har særskilt HttpOnly-cookie, udløber efter 8 timer og giver ingen administratoradgang.

Under **Administration → Virksomheder** vælger medarbejderen Racketclub. Design varen med det almindelige produktværktøj, læg den i kurven, og gem den derefter til virksomheden. Samme farves kompatible størrelser findes automatisk; trykplaceringer kontrolleres for hver variant. Navn, design, PNG-mockups og originale AI/EPS/PDF-filer gemmes privat og varigt under `SMERCH_DATA_DIR/company-products/`. Gemte designs kan fjernes fra sortimentet uden at fjerne filer fra allerede oprettede ordrer. Priser er shoppens aktuelle priser; der er ikke indført særskilte aftalepriser.

Virksomheden ser kun sit eget sortiment og vælger antal pr. størrelse. Ved kurvpris og checkout genindlæser serveren det gemte design; klienten kan ikke ændre designet eller hente en anden virksomheds filer. Originalfilerne kopieres fra serverens skabelon til den konkrete ordre, og PF får de sædvanlige tidsbegrænsede, signerede fil-URL’er. Genbestillinger følger fortsat de normale lager-, pris-, korrektur-, PF-farve- og betalingskontroller. Tidligere godkendelse af en skabelon springer ikke PF-korrekturen over. Ingen ordre sendes alene ved at gemme et virksomhedsprodukt. Medtag virksomhedskonti og `company-products/` i den private backup.

### Dansk adressevælger i checkout

Checkout bruger Klimadatastyrelsens **Adressevælger** (DAWA lukkede 1. oktober 2026).
`POST /api/addresses` søger efter vejnavn/husnummer, viser lejligheder og henter den valgte DAR-adresse. Kun søgetekst eller adresse-id sendes til tjenesten; navn, e-mail og telefon sendes ikke med. Søgeteksten er i request-body og logges ikke af applikationen.

Ved oprettelse af en betalingssession slår serveren adressens id op igen og kontrollerer, at gade, postnummer og by svarer til valget. Etage, dør og eventuelt supplerende bynavn indgår i `shipping.street`, som følger med til PF. En redigeret eller manglende adresse kan ikke starte betaling. Ved nedbrud skal kunden prøve igen eller kontakte Smerch; der er ingen ukontrolleret manuel omgåelse.

`ADDRESS_PROVIDER_TOKEN` kan sættes på serveren. Indtil KDS indfører brugerstyring, bruges deres anbefalede offentlige token `adressevaelger123` (ikke en hemmelighed). KDS forventer brugerstyring ultimo 2026/primo 2027; følg [deres vejledning og notifikationsservice](https://confluence.kds.dk/display/ADV/Brugerstyring), og opdatér serverkonfigurationen ved overgangen. Ingen nøgle sendes til browseren. Lancering og betaling åbnes fortsat kun via den eksisterende lanceringkonfiguration.

### e-conomic: fakturakladder med manuel bogføring

Ejeren har valgt **manuel godkendelse i starten**. Integrationen opretter kun kunder og kladder. Ingen kode kan bogføre, oprette regnskabsposteringer eller sende en kladde til kunden; POST er begrænset til `/customers` og `/invoices/drafts`. Bogføringen foretages i e-conomic. Administrationens ordrevisning viser kladdenummer, bogført fakturanummer og afvigelser.

Forbindelsen er slået fra som standard. Før aktivering skal følgende sættes på serveren (tokens må ikke lægges i Git eller browserkode):

- `ECONOMIC_APP_SECRET_TOKEN`, `ECONOMIC_AGREEMENT_GRANT_TOKEN`: adgang til den korrekte aftale, jf. https://www.e-conomic.com/developer/connect
- `ECONOMIC_CUSTOMER_GROUP_NUMBER`: kundegruppen til nye kunder.
- `ECONOMIC_PAYMENT_TERMS_NUMBER`: betalingsvilkår til webshopbetaling, afstemt med bogholderen, så kunder ikke får en ny betalingsopfordring. Integrationen bogfører ikke QuickPay-afregning, gebyrer eller betalinger.
- `ECONOMIC_LAYOUT_NUMBER`: godkendt Smerch-fakturalayout.
- `ECONOMIC_VAT_ZONE_NUMBER`: aftalens danske momszone.
- `ECONOMIC_PRODUCT_NUMBER`, `ECONOMIC_FREIGHT_PRODUCT_NUMBER`: eksisterende varer med korrekte salgskonti og 25 % moms til henholdsvis merchandise/tryk og fragt.
- `ECONOMIC_ENABLED=1`: aktiveres først efter kontrol af ovenstående og en gennemgået prøvekladde i den relevante aftale.

Hvert minut behandles bekræftede **QuickPay-liveordrer** med status `authorized` eller `paid`; testordrer, Stripe-ordrer uden tilsvarende verificeret betalingsmiljø og annullerede ordrer udelades. Kladder kan oprettes, mens beløbet kun er reserveret, og er derfor ikke dokumentation for hævning. Kontrollér faktisk betaling før manuel bogføring. Eksisterende kunder søges på CVR eller e-mail/navn; tvetydige fund stopper forløbet. Fakturaadressen tager foreløbig udgangspunkt i leveringsadressen og skal kontrolleres ved erhvervsordrer med en anden fakturaadresse. Særskilt fakturaadresse skal understøttes før dette automatiseres yderligere.

Hver varelinje overføres som én samlet linje inklusive tryk/opstart, med det faktiske antal og SKU i beskrivelsen. Det bevarer ordrens ørebeløb; fragt er en separat linje. API-svarets netto- og bruttobeløb skal matche ordren præcist, ellers vises manuel afklaring. Ordre-id gemmes som `references.other` og må ikke slettes ved manuel bogføring. Systemet søger både kladder og bogførte fakturaer på denne reference før oprettelse. Et uafklaret oprettelseskald genafsendes ikke automatisk. Hvis ingen entydig faktura kan genfindes efter en fejl, skal udfaldet afstemmes, og eventuel nulstilling af forsøgsmarkeringen udføres kontrolleret af administrator med dokumenteret kontrol i e-conomic. Annullering i shoppen ændrer ikke kladder eller fakturaer i e-conomic.

Den bogførte fakturas status læses tilbage ved næste kontrol (op til 15 minutter eller knappen **Opdatér fakturastatus**). Tilslutningen er ikke en færdig afsendelsesmail-/PDF-integration: den del og PF's samlede afsendelse af varer med/uden logo skal fortsat færdiggøres og testes, før hele kundemailflowet kan kaldes automatisk. Ingen produktion eller livebetaling åbnes af denne integration.
