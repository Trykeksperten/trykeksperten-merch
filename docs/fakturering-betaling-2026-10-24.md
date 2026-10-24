# Smerch: leverancer, fakturering og betaling

Release 24. oktober 2026. Den nye fakturerings- og betalingsautomatik er deaktiveret. Checkout forbliver lukket.

## Ansvar og afgrænsning

Smerch er brand. Juridisk sælger: Trykeksperten ApS, CVR 44015773, Raffinaderivej 10 E, 2300 København S.

Financial Outsourcing/e-conomic er den eneste fakturanummeransvarlige. Smerch opfinder eller tildeler ikke fakturanumre. Uden API eller en udtrykkeligt aftalt anden nummeransvarlig kan endelige fakturaer ikke udstedes automatisk. Systemet klargør leverancegrundlag, viser ventende fakturering og kan sende grundlag til bogholderen. Det gælder også forenklede fakturaer til danske privatkunder. Den gamle e-conomic-kladdeintegration er blokeret, når det nye flow aktiveres, så begge flows ikke opretter bilag for samme salg.

## Implementeret

- Eksisterende ordrebekræftelse efter accepteret reservation bevares. Reservation betegnes ikke som betaling.
- Dansk privat varesalg foreslår forenklet faktura uden 5.000-kronersgrænse. Erhverv og udland foreslår fuld faktura. Ukendt kundetype og udland blokerer det danske automatiske flow.
- Checkout indsamler særskilt fakturaadresse, e-mail, CVR, EAN og reference ved erhverv. Eksisterende ordrer kan få rettet faktureringsoplysninger. Allerede udstedte PDF'er ændres ikke.
- PF-leverancer matches med præcis ordregruppe og varelinje. Ukendte, flertydige, ændrede eller manglende vareantal giver manuel afklaring. Tracking alene er aldrig grundlag for en hævning.
- Leverancebeløb beregnes i øre fra ordrepriser inklusive rabat/tryk/opstart. Fragt fordeles forholdsmæssigt efter nettopris. Kumulative afrundinger sikrer, at sidste levering lukker ordretotalen præcist. Dansk moms anvendes kun på verificerede danske ordretotaler.
- Fakturagrundlag pr. levering med juridisk sælger, kunde, varer, fragt, moms og Quickpay-/ordrereferencer kan downloades eller sendes til bogholder. Afsendt mail bevarer sin PDF-version. Ændret kundegrundlag giver en ny reference/version.
- Smerch hæver hele ordrebeløbet én gang, når alle PF-ordrer er bekræftet fuldt afsendt. Delvise hævninger er blokeret, også ved en gammel miljøindstilling. Hævninger har særskilte, vedvarende handlingsreferencer. Udbyderstatus kontrolleres før og efter POST. Ukendt udfald spærrer nye forsøg, indtil det er afstemt.
- Quickpay-operationer summeres; flere captures kan tilsammen betale ordren. Gentagne callbacks giver ikke ny betaling eller kvittering. Kvitteringer oprettes pr. verificeret capture, aldrig ved reservation eller bankafregning.
- Kvitteringsmail og bogholdermail har separate sendestatusser. Usikker SMTP-afsendelse kræver eksplicit kontrol før genforsøg.
- Udstedte e-conomic-fakturaer og kreditnotaer registreres med nummer, aftalt serie, dato, beløb, moms og original PDF. Numre er entydige på tværs af ordrer. PDF'er kan ikke overskrives.
- Senere fuld faktura forbindes til oprindelig faktura uden en ekstra omsætningspost. En fuld kreditnota og erstatningsfaktura kan forbindes, så nettotalen fortsat repræsenterer ét salg. Korrektioner, som allerede er knyttet til refundering, kræver afklaring.
- Hel eller delvis refundering kræver tilknyttet kreditnota og må ikke overstige verificeret nettobetaling eller kreditnotaens restbeløb. En refundering spærrer yderligere captures på den samme transaktion.
- Afregning registreres manuelt pr. ordres andel med Clearhaus-reference, bankreference og bogføringsreference. Kontrol: kundebetalinger minus refunderinger minus gebyrer plus/minus reguleringer minus nettotilbageholdelse er lig bankudbetaling. Tilbageholdte og endnu ikke afregnede beløb vises særskilt.
- Ordreoverblik og handlingskø viser økonomiske undtagelser. Ordren har et kompakt økonomipanel under Dokumenter og JSON-eksport til afstemning.

## Konfiguration før aktivering

Automatikken er hårdt spærret af `financeAutomationReleased=false` i `lib/finance-release-policy.mjs`. Baggrundsarbejderen kører ikke, automatisk hævning er slukket, og kvitteringsmail/bogholdermail kræver manuel handling, selv hvis miljøvariabler angiver automatisk afsendelse. Spærren må først ændres efter udtrykkelig godkendelse og afklaring med bogholder og betalingsudbyder. Eksisterende ordrebekræftelser og øvrige allerede etablerede flows ændres ikke af denne spærring.

Alle værdier nedenfor er serverindstillinger; API-nøgler må ikke ligge i browseren.

| Variabel | Krav |
| --- | --- |
| SMERCH_FINANCE_ENABLED | `1` først efter aftaler, test og godkendt udrulning; ellers slukket |
| SMERCH_FINANCE_START_AT | Aftalt ISO-starttidspunkt. Kun ordrer oprettet fra dette tidspunkt behandles automatisk; historiske ordrer afstemmes manuelt først |
| SMERCH_INVOICE_NUMBERING_AUTHORITY | `economic`; Financial Outsourcing er nummeransvarlig |
| SMERCH_INVOICE_SERIES | Den faktisk aftalte serie; ingen standardserie |
| SMERCH_ACCOUNTANT_EMAIL | Bekræftet: `trykeksperten@financialoutsourcing.dk` til fakturagrundlag og andre regnskabsforespørgsler. Bruges som standard; kan tilsidesættes i serveropsætningen |
| SMERCH_ACCOUNTANT_MAIL | `review` (standard) eller `automatic` |
| SMERCH_PAYMENT_RECEIPT_MAIL | `review` (standard) eller `automatic` |
| SMERCH_PAYMENT_AGREEMENT_CONFIRMED | `1` efter bekræftelse af smerch.dk, Trykeksperten ApS/CVR og Quickpay/Clearhaus-aftale |
| QUICKPAY_ACQUIRER | `clearhaus` kan bruges som eksplicit, verificeret indløseropsætning, hvis Quickpays svar ikke angiver indløser. Et svar med en anden indløser tilsidesættes aldrig |
| SMERCH_AUTOMATIC_SHIPMENT_CAPTURE | `1` for automatisk hævning af verificerede leverancer; ellers manuel handling |
| SMERCH_ACCOUNTING_MAPPING | Bogholderens konteringsspecifikation; der foretages ingen automatisk bogføring. Ingen kontonumre eller momskoder er indsat |
| QUICKPAY_CAPTURE_ENABLED / QUICKPAY_REFUND_ENABLED | `1` aktiverer den konkrete betalingshandling; eksisterende hævningsspærre respekteres |
| QUICKPAY_API_KEY / QUICKPAY_PRIVATE_KEY / QUICKPAY_MODE | Eksisterende serveropsætning; nødvendige GET/capture/refund/link/cancel-rettigheder skal verificeres |
| CONTACT_SMTP_* | Eksisterende SMTP-opsætning |

Bogholder skal levere præcis procedure for fakturering ved afsendelse, serie/numre, senere fakturaønsker, kreditnotaer, bank, gebyrer, indsigelser og tilbageholdelser. Afstemningsregistrering er dokumentation, ikke en postering i e-conomic.

## Fortsat særskilt/manuelt

- Udlandsmoms, OSS/eksport mv. er ikke implementeret som en ny momsberegner. Udland er blokeret i dette flow, indtil særskilt opsætning og implementering foreligger.
- Forudbetalinger opdages og vises til bogholderen; der udstedes ikke automatisk en ny leverancefaktura eller hæves på ny for at forsøge at løse dem. Særskilt forudbetalingsfakturering og momsprocedure kræver afklaring.
- Restordre efter refundering kræver ny betaling. Automatisk oprettelse af en ny betalingsreservation for restbeløbet er ikke implementeret; den gamle fornyelsesfunktion blokerer allerede delvist hævede transaktioner for at undgå dobbelt reservation af hele ordren.
- Clearhaus-afregninger og bankposteringer importeres ikke automatisk. Bogholder registrerer reference og beløb fra de faktiske afregninger. Quickpay-abonnement/gebyrfakturaer håndteres særskilt i e-conomic.
- Der er ikke udført rigtige gateway-/banktransaktioner eller sendt kundemails under implementeringen. Testmiljø-/aftaleverifikation hos Quickpay/Clearhaus mangler. DELETE `/payments/:id/link` på API user 982902 blev givet efter brugerens udtrykkelige godkendelse 24. oktober 2026 og verificeret efter genindlæsning. Der blev ikke lukket betalingslinks eller gennemført betalinger under kontrollen.
- Endelige fakturaer og kreditnotaer udstedes/sendes af Financial Outsourcing. Upload i Smerch registrerer dokumentet og sender det ikke automatisk til kunden.

## Clearhaus-afklaring 24. oktober 2026

Aftalen dækker Trykeksperten ApS, CVR 44015773, www.smerch.dk og Quickpay. Quickpay-kontoens regler og testordre 623790094 bekræfter aktiv Clearhaus/MobilePay Online og accepteret autorisation; callback er OK. Ingen betaling er hævet ved denne kontrol.

Ved en verificeret Clearhaus-betaling beregnes hævningsfristen ud fra Quickpays succesfulde autorisationstidspunkt: 179 dage. Manglende eller fremtidig dato blokerer. Andre/ukendte indløsere beholder den konservative kontrol. Eksisterende betalingsfrister opdateres ved verificeret opslag hos Quickpay, uden at gamle betalingsstatusser automatisk genåbnes. Det eksisterende felt `authorizationExpiresAt` anvendes som hævningsfrist ved `captureDeadlinePolicy=clearhaus-179-days`; det er ikke dokumentation for bankens faktiske reservationsvarighed.

Efter syv dage vises late capture-advarsel; aftalen angiver 0,34 % i gebyr. Clearhaus oplyser øget risiko for indsigelser. Automatikken forbliver hårdt slukket. Ingen godkendelse af delvise hævninger kræves eller anvendes.

Kilder: https://helpdesk.clearhaus.com/faq/ og https://quickpay.net/dk/helpdesk/authorize/

## Drift

`sales-ledger.json` opbevares privat i SMERCH_DATA_DIR. Ændringer gemmes atomisk under en eksklusiv filsystemlås. En afbrudt proces efterlader `sales-ledger.lock` som sikker blokering. Ved vedvarende lås: stop alle økonomiarbejdere, tag backup af ledgeren, afstem igangværende Quickpay-operationer og SMTP-status, og fjern først låsen, når ingen proces bruger den. Der må ikke genafsendes usikre betalinger eller mails blindt. Løsningen forudsætter delt persistent lager; flere uafhængige kopier af lageret må ikke køre betalingsarbejdere samtidig.

Udrulning skal ske som en afgrænset patch mod produktionsversionen. Arbejdsmappen indeholder andre lokale SQLite/backoffice-ændringer, som ikke må følge med utilsigtet.

## Verifikation

Efter Clearhaus-tilpasning og krav om én samlet hævning: 378 tests bestået. Dækker bl.a. hævning efter 20 dage, udløbet frist, gamle reservationsfrister, afviste delhævninger, fuld PF-afsendelse og fortsat slukket automatik.

Den første afgrænsede release mod produktionsversionen bestod alle 373 tests, inklusive kontrol af at miljøvariabler ikke kan aktivere automatikken. Tidligere lokal verifikation: 385 tests bestået i samlet suite, efterfulgt af 25 relevante tests efter sidste samordning af annullering/betaling. Testdækningen omfatter HTTP-adgang og oprindelse, ordrelås, afvist og udløbet betaling, annullering, delvise captures, refundering, gentagne callbacks, ukendt betalings-/mailudfald, fakturanumre, dokumentbevaring, korrektioner, afregningsligning og præcis øreafrunding. De sidste ændringer i betalingsafstemning er desuden kontrolleret med 16 økonomitests. Gateway og SMTP er simulerede i tests.

PDF-eksempel renderet og visuelt kontrolleret (1 side). Økonomipanel kontrolleret med fiktive data på desktop og 390 px bredde, uden vandret overflow; forhåndsvisningen brugte fallbackskrifttype, da den ikke indlæste butikkens fontfil.

## Leverandørkilder

- Quickpay capture og delvise captures: https://quickpay.net/helpdesk/capture/
- Quickpay refundering, herunder lukning for yderligere captures: https://quickpay.net/dk/helpdesk/refund/
- Quickpay callbacks og gentagen levering: https://learn.quickpay.net/tech-talk/api/callback/
