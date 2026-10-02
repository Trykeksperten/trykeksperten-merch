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

Inden onlinebestilling kan åbnes, skal one.com SMTP fungere og `SMERCH_DELIVERY_TERMS_DA` samt `SMERCH_DELIVERY_TERMS_EN` angive den reelle leveringstid, herunder hvordan korrekturgodkendelsen starter fristen. Indsæt ikke et ubekræftet standardtal. Eksisterende PF/Quickpay-livekrav gælder fortsat. Ved manuelle korrekturgodkendelser skal medarbejderen have kundens udtrykkelige godkendelse af den konkrete version og bevare dokumentation; et internt klik er ikke kundens accept.

Driftsansvarlig skal dokumentere databehandleraftaler/roller, eventuelle tredjelandsoverførsler og øvrige modtagere (fx bogholder og senere marketingplatform). Politikken beskriver nødvendige formål og kriterier for opbevaring, ikke en automatisk slettegaranti. Indfør regelmæssig gennemgang af serverordrer, designfiler, marketinghistorik, fortrydelser, mailkøer, one.com-postkasser og backups. Slet/anonymisér materiale uden fortsat formål. Bogføringsmateriale følger lovens fem år efter regnskabsårets afslutning; kopier, originalfiler og henvendelser skal vurderes selvstændigt. Dokumentér nødvendigheden af længere opbevaring ved konkrete tvister. Behandl indsigts- og sletteanmodninger inden de lovbestemte frister. Ved nye leverandører, AI-funktioner, cookies eller nye marketingformål skal politik og nødvendige samtykker opdateres før aktivering.

### Udvalgt sortiment

Webshoppen starter uden valgte produkter (`config/assortment.json`, version 2). Tidligere sortimentsvalg nulstilles ved overgangen til version 2; efterfølgende valg bevares. Hele PF-kataloget bevares. Under **Medarbejderlogin → Produkter** kan medarbejdere søge og filtrere alle importerede produkter, se billeder og produktdetaljer samt vælge **Vis i webshop** eller **Skjul i webshop**.

Valgene gemmes atomisk i `assortment.json` under `SMERCH_DATA_DIR` og overlever katalogimporter. Nye PF-produkter er skjult, indtil de vælges. Sørg for vedvarende lager til datamappen i produktion. Sortimentsændringer påvirker katalogvisningen; eksisterende ordrer bevarer deres produktdata.

Under **Produkter → Købs- og salgspriser** vises PF-varepriser pr. variant og antalstrin. Salgspriser redigeres i DKK ekskl. moms med forhåndsvisning inkl. moms. Manuelle priser gemmes i `sale-prices.json` under `SMERCH_DATA_DIR`, overlever PF-synkronisering og anvendes af både produktvisning, tilbud, kurv og checkout. **Brug automatiske priser** fjerner variantens manuelle priser. Købspriser udleveres kun til medarbejdere med aktiv session; tryk, opstart og fragt ændres ikke af denne vareprisredigering.
