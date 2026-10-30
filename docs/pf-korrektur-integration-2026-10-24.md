# PF-korrektur: verificerede muligheder og sikker import

Kontrolleret 24. oktober 2026. Automatisk korrekturpublicering er ikke aktiveret under arbejdet. Checkout og økonomiautomatik er uændrede.

## Konklusion

Den dokumenterede Gateway kan ikke i sig selv drive hele korrekturforløbet. Den mest direkte understøttede løsning er **PF-mail med PDF → verificerende mailrelæ → privat korrekturversion i Smerch → personligt kundelink → kundesvar i Smerch → manuel behandling hos PF**.

Backendens normaliserede modtagelse er implementeret og testet. **Der er fortsat ikke installeret en læser af postkassen eller en parser af PF’s originale mailformat.** Indgangen er Smerchs egen relækontrakt, ikke et PF-endpoint. Ingen nye PF-API-funktioner er antaget eller opfundet.

## Officielle kilder og præcis afgrænsning

- PF’s originale `Gateway Web Service`, version 2.2.2, august 2026: lokal kilde `/Users/joakimsarsgaard/Downloads/gateway_manual.pdf`, især side 3–7, 16–23, 24–29. Hele dokumentets tekst er gennemgået.
- [Officiel Swagger-indgang](https://wsa.pfconcept.com/test/RestGateway/), hentet 24. oktober. Den linker selv til følgende tre specifikationer:
  - [Gateway API: ordre, lager, ordrestatus og produkt](https://wsa.pfconcept.com/test/RestGateway/RestGateway.yaml?v=1.0).
  - [Outbound: status, ASN og ordrebekræftelse](https://wsa.pfconcept.com/test/RestGateway/GatewayOutbound.yaml).
  - [Artwork-upload til PF](https://wsa.pfconcept.com/test/RestGateway/RestArtUpload.yaml).
- [PF’s almindelige vilkår](https://www.pfconcept.com/en_nl/general-terms), afsnit 3.2, beskriver e-proof via mail. Vilkårene er ikke dokumentation for et korrektur-API.

Swagger-filerne er hentet direkte via HTTPS. De bruger testserver som base. En dokumenteret funktion er derfor ikke i sig selv bevis for, at funktionen er aktiveret på Smerchs live-konto. Dokumenterne indeholder heller ikke en garanti for, at PF ikke tilbyder særskilte, private korrekturtjenester efter aftale.

| Spørgsmål | Verificeret dokumentation | Eksisterende Smerch |
| --- | --- | --- |
| E-proof/PDF/filer fra PF? | Ingen download- eller push-kontrakt for PF’s færdige korrektur i de gennemgåede specifikationer. `PROOF`, `RAW` og artwork-upload beskriver filer **til** PF. `Eproof` i ordren er en bestillingsindstilling, ikke et korrektursvar. | Fil kan modtages ved manuel upload eller via den signerede korrekturindgang. Ingen automatisk PF-mailimport i drift er verificeret. |
| Korrekturlink og kommentarer? | Ingen dedikerede felter for korrekturlink, korrekturversion eller korrekturkommentar i de dokumenterede outbound-beskeder. `statusInformation` er generel, valgfri ordrestatusinformation. | Medarbejder kan gemme eksternt link, men kunden må kun inviteres, når selve filen er gemt privat. Kundekommentarer og bilag registreres. Den nye import kan gemme en særskilt, normaliseret PF-kommentar. |
| Korrekturstatus? | Status-callback handler om hele ordren: Stalled, Processing, Partial shipped, Shipped, Completed og Cancelled. Den dokumenterer ikke godkendelsen af en bestemt korrekturversion. | Kundens beslutning og medarbejderens registrering af PF’s bekræftelse er adskilt. Generel ordrestatus må ikke bruges som versionsgodkendelse. |
| Entydig ordre og kunde? | PO-referencen sendes ved bestilling og returneres i notifikationer. PF-ordrenummer kan også identificere ordren. Det er ikke bekræftet i originalmailens felter/headers endnu. | PF-ordrens `SMERCH-…` reference peger på en intern ordre, der peger på checkout. Kunden hentes dérfra; PF-mailens modtagerfelt bruges aldrig som kundemodtager. |
| Push eller opslag? | PF pusher ordrebekræftelse, status og ASN. Status sendes flere gange dagligt 08:15–16:15; tidszone ikke oplyst. Aktuel Swagger dokumenterer desuden GET `/orderstatus` med PO-, SO- eller pickingticket-nummer, selv om denne funktion ikke fremgår som selvstændigt opslag i manualens oversigt. | Smerch har tre callbacks. Der er ikke implementeret regelmæssige ordrestatusopslag, og et sådant opslag løser ikke den manglende PDF-modtagelse. |
| Kundegodkendelse eller ændringer? | Ingen dokumenteret godkendelses-/revisionsoperation tilbage til PF i de gennemgåede kilder. Artwork-upload er ikke en godkendelsesoperation. | Kunden kan godkende eller afvise i Smerch. Svaret kan kopieres og behandles via PF’s aftalte kanal; der registreres afsendelsesreference og separat PF-bekræftelse. Dette trin er fortsat manuelt. |
| Mere information i mailen end API’et? | PDF og korrekturlink er ikke dokumenteret i Gateway-svarene. | Joakim har bekræftet, at PF-mailen indeholder både PDF og link og sendes til korrektur@smerch.dk. Den konkrete mail, headers, eventuelle særlige kommentarer og revisionstekster er ikke læst under kontrollen. En fuld feltsammenligning af mail og API er derfor endnu ikke mulig. |

## Implementeret nu

### Sikker modtagelse

Den eksisterende POST `/api/pf-proof-inbox` kræver fortsat Bearer-adgang og i live en frisk HMAC-signatur over de præcise request-bytes. Kun det betroede relæ må kende disse hemmeligheder. Browseren og kunden får dem aldrig.

Modtagelsen gemmer en privat importpost med besked-id, status, eventuel ordre, version og fejl. Fil og normaliseret input bevares privat til afstemning. Den offentlige API-respons og medarbejderens statusliste indeholder ikke filindhold, rå input eller kundetokens.

Der kræves en kendt, præcis PO-reference. Et medsendt PF-ordrenummer skal stemme overens. Kundeordren skal referere tilbage til PF-ordren, kundens mail skal være gyldig, og modstridende kundemails stopper importen. Et eksternt PF-link alene udløser ingen afsendelse og bliver ikke hentet automatisk.

Relæet skal attestere `senderVerified: true`. Dette er **ikke** kontrol udført af Smerch mod PF’s mailsystem; det er relæets ansvar, og feltet må først sættes efter verificeret mailautenticitet. En synlig From-adresse eller en tekststreng i mailen er ikke tilstrækkelig.

### Versioner, kundeadgang og mails

- Ny fil, ny korrekturreference eller ændret PF-kommentar opretter en ny korrekturversion og nulstiller den aktuelle godkendelse. Historikken bevares. En kendt, ældre fil/reference/kommentar må ikke rulle ordren tilbage.
- Gentagne besked-id’er må ikke oprette ny version, nyt kundelink eller ny mail. Samme besked-id med ændret indhold blokeres til afstemning. Gentagelser med andre besked-id’er genkendes også ud fra korrekturindholdet.
- Automatisk publicering genbruger en allerede publiceret version, også ved samtidige opdateringer. Kun manuel genudstedelse opretter et nyt link og ugyldiggør det gamle.
- Kunden ser kun den aktuelle korrektur med et personligt token. Nyt link eller ny version gør tidligere links ugyldige. Links udløber efter 30 dage; de er adgangsbærende links og skal behandles fortroligt. Filen vedhæftes ikke som en offentlig URL.
- Kunden modtager en Smerch-mail med versionsnummer, eget link og den normaliserede PF-kommentar. Kommentar vises som tekst, ikke som aktiv HTML. Rå PF-mails, interne priser og PF’s godkendelseslinks videresendes ikke automatisk.
- Mailkøen nulstilles ikke ved gentagen oprettelse. Vedvarende låse beskytter mod samtidige afsendelser fra forskellige processer. SMTP skal bekræfte den konkrete modtager, før mailen registreres sendt.
- Hvis modtageren er ændret eller blevet usikker siden klargøringen, blokeres invitationen. Ukendt levering bliver ikke forsøgt automatisk igen. Genforsøg efter ukendt levering kræver manuel afstemning.
- Eksisterende kundesvar, kommentarbemærkninger, bilag, manuelle publiceringer, påmindelser og genudstedelse bevares. Svar til PF forbliver manuelt.

### Overblik og manuel behandling

**Automatik og beskeder** viser importposter, der er blokeret eller afventer gennemgang, også når ingen ordre kunne identificeres. På kendte ordrer fremgår importfejl af næste handling og listen over blokeringer samt under Historik → Beskeder, påmindelser og afsendelsesstatus.

En import kan markeres manuelt behandlet med en obligatorisk behandlingsnote. Dette sender ingen mail, tilknytter ikke en ordre og godkender ikke en korrektur. Find originalmailen, kontrollér kunden og upload/publicér den korrekte PDF på ordren via det eksisterende manuelle flow.

## Hvad der konkret mangler

1. **Én original PF-mail som .eml**, inklusive headers, PDF og revisionsoplysninger. Kontrollér også en revideret korrektur. Mail-appen gav ikke en læsbar visning under kontrollen. Der er ikke sendt eller videresendt noget.
2. **En særskilt mailforbindelse**, fx IMAP-læsning eller et modtagende mailrelæ til korrektur@smerch.dk. SMTP-forbindelsen til udgående mails er ikke en indbakkelæser. Der er ikke konfigureret en IMAP-læser i den eksisterende kode.
3. **Verificeret parser og afsenderkontrol:** præcise PF-afsendere, betroede mailserverheaders, SPF/DKIM/DMARC, PO/PF-reference, korrekturreference, revision/rækkefølge og hvilke kommentarer der er beregnet til kunden. Disse værdier må ikke gættes. Indhold fra mailen behandles som data, ikke instruktioner.
4. **Revisioners rækkefølge:** vi afviser kendte gamle versioner. En hidtil uset, forsinket PF-mail kan ikke sikkert tidsplaceres uden PF’s revisions-id/tidsstempel. Relæet skal derfor sætte uklare eller ude af rækkefølge beskeder til gennemgang, ikke sende dem som nye korrekturer.
5. **En kontrolleret test** fra rigtig PF-mail over import og kundemail til kundesvar. Derefter kan korrekturpublicering vælges automatisk. Den er ikke aktiveret nu.
6. **PF-afklaring:** findes der en særskilt e-proof-tjeneste på vores konto, med download af PDF, versions-id og godkendelses-/revisionsoperation? Bed om konkret dokumentation og eksempelpayloads. Implementér ikke efter en antagelse om, at en sådan tjeneste findes.

## Relækontrakt – Smerchs eget format

```json
{
  "messageId": "stable-original-message-and-attachment-id",
  "purchaseOrderNumber": "SMERCH-00000000-0000-0000-0000-000000000000",
  "pfOrderNumber": 1234567,
  "proofReference": "supplier-proof-reference-and-revision",
  "senderVerified": true,
  "mimeType": "application/pdf",
  "contentBase64": "BASE64_OF_THE_VERIFIED_PDF",
  "supplierMessage": "Kun de verificerede oplysninger, der er beregnet til kunden."
}
```

Relæet sender `Authorization: Bearer …`, `X-Smerch-Timestamp` i Unix-sekunder og `X-Smerch-Signature` som HMAC-SHA256 over `timestamp + '.' + rawBody`, med den eksisterende `PF_WEBHOOK_SIGNING_SECRET`. Timestamp accepteres højst fem minutter fra serverens tid. Beskeder skal være JSON og højst 15 MB; korrekturfilen højst 10 MB, PDF/PNG/JPEG med valideret indhold.

`received: true` betyder, at importposten er registreret, **ikke** at kunden har fået mail. Relæet skal læse `status`: `review`, `blocked`, `published`, `obsolete` eller `reviewed`. `published` betyder klargjort kundelink/mailkø; faktisk afsendelse fremgår af mailstatus på ordren. Originalmailen bør ikke slettes ved import.

Ved flere PDF’er eller flere ordrereferencer i en mail skal relæet vælge manuel gennemgang, indtil sammenhængen er verificeret. Ingen gæt ud fra kundens navn eller emnelinjens første tal. Ingen automatisk login/scraping eller godkendelse på PF’s korrekturlink.

## Drift og fejl

En vedvarende `.lock` efter procesnedbrud stopper nye forsøg med vilje. Stop mailarbejderen, afstem den konkrete mailkonto og meddelelses-id’et, og dokumentér resultatet før en driftsansvarlig rydder låsen. Ved en afbrudt mail med ukendt levering skal afsendelsen stadig behandles som usikker; gentag ikke blot requesten. “SMTP accepteret” beviser ikke modtagelse i kundens indbakke.

Importposter og PDF’er ligger privat i `SMERCH_DATA_DIR/proof-intake`, korrekturfiler i `proofs` og mails i `proof-mail`. Gennemgang/sletning og backup skal omfatte disse mapper. Dette forløb indfører ikke automatisk sletning af originalmails.

## Testresultat

**395 tests bestået, 0 fejl** i det isolerede miljø med produktionsafhængigheder. Ti nye tests dækker import, usikker tilknytning, manglende/ændret kundemail, nye referencer og kommentarer, gamle kundelinks, dubletter, SMTP-afstemning, låse og den faktiske HTTP-modtagelse med manglende/udløbet signatur. Eksisterende tests for dokumenter, betaling og korrektursvar består fortsat.

Testene bruger midlertidige mapper, fiktive kunder, falsk SMTP og lokale HTTP-servere uden produktionsnøgler. Der er ikke dokumenteret en virkelig indbakkeforbindelse eller en PF-til-Smerch-korrekturbesked ved at køre disse tests.

## Tillæg: originalmail modtaget og undersøgt

Efter ovenstående implementering har Joakim leveret den originale .eml for testordre 7886901. Punkterne ovenfor om manglende adgang til en originalmail er dermed løst for **dette ene eksempel**; en revideret korrektur er endnu ikke undersøgt.

Verificerede observationer fra MIME-indholdet:

- From og Return-Path er `ccc@pfconcept.com`; modtager er `korrektur@smerch.dk`.
- One.coms Authentication-Results angiver SPF pass, DKIM pass med domænet pfconcept.com og DMARC pass. Dette er aflæste modtagelsesresultater; der er ikke udført en ny kryptografisk DKIM-verifikation af den eksporterede fil. En kommende automatisk læser skal stole på resultater fra den faktiske modtagende mailserver, ikke på vilkårlige medsendte headers.
- Mailen har Message-ID og Date, ét HTML-indhold og én vedhæftet `application/pdf`, `33111961.pdf`, på 884.434 bytes. PDF’en er læsbar og har én side.
- Emnelinje, HTML-footer og PDF er enige om PF-ordre 7886901 og Smerchs PO-reference. De tre steder giver et konkret grundlag for krydskontrol i en parser. Der må ikke vælges en kunde ud fra mailens modtager: den adresse er Smerchs egen korrekturpostkasse.
- HTML-linket går til PF’s `/en_cz/eproof/detail/view` med parametrene Language, ActionBy og EproofID. Linket er ikke åbnet. Det bevares fortroligt og må ikke publiceres som kundens Smerch-link. EproofID er ikke identisk med PDF-filnavnets tal; de to må ikke antages at være samme reference eller revisionsnummer.
- PDF’en angiver SKU 38687070, 10 stk., Forside, Broderi fixed, 85 × 22,6 mm og Pantone 717 C (Madeira 1765). Der er ikke ændret noget i ordren eller korrekturen på baggrund af denne aflæsning.
- Mailens tekst indeholder generelle kontrolpunkter, instruktioner til PF’s egen svarside, en oplysning om ny korrektur inden for 2–4 timer samt en generel advarsel om metalvarer. Den indeholder ingen særskilt, ordrebestemt kunstnerkommentar i dette eksempel. Hele HTML-mailen skal derfor ikke kopieres som `supplierMessage`; især må PF’s generelle tidsangivelse og metaladvarsel ikke automatisk blive løfter eller relevante advarsler for en kasketordre.

Rå originalmail, PDF, linkværdier og signaturer er ikke kopieret ind i denne rapport eller sendt til en anden tjeneste. Ingen kundemail, godkendelse eller live-import er udløst. Det resterende arbejde er mailforbindelsen, parseren for dette dokumenterede format og kontrol af revisionsrækkefølge på en ny korrektur. Automatisk publicering forbliver slået fra.
