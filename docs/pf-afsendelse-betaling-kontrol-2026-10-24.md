# Kontrol af PF-afsendelse, betaling og dokumenter – 24. oktober 2026

## Resultat

385 tests bestået mod produktionsafhængigheder. Syv nye sammenhængende tests bruger rigtige ordre-/PF-/økonomimoduler med isoleret midlertidigt lager samt simuleret Quickpay og SMTP. Ingen rigtige betalingskald, kundemails eller bogholdermails blev sendt. Automatikken er fortsat låst til slukket.

## Rettelser

- Automatisk fakturagrundlag dannes først, når fuld afsendelse og fuld hævning er registreret. PDF og mail viser hævet beløb, refunderinger, ordretotal og betalingsreferencer.
- Interne faktureringsstatusser ændrer ikke dokumentversionen. Gentagne kørsler bevarer samme mailreference.
- Ændrede kunde-/betalingsoplysninger giver ny version. Gamle PDF'er bevares. Rettelser efter sendt eller usikker mail kræver manuel gennemgang. Et forældet, endnu ikke afsendt grundlag må ikke sendes.
- En mail registreres kun som sendt, hvis SMTP bekræfter den konkrete modtager. Usikkert udfald stopper genforsøg og vises som en opgave på ordren.
- Forsendelsesmail beskyttes med en vedvarende lås mod parallel afsendelse fra flere processer med samme lager. Også opdatering af mailkladden bruger låsen.
- PF kan tilføje en leverancereference og tracking senere uden at samme levering, antal eller mail tælles igen, når ét entydigt match kan findes. Tvetydighed afklares manuelt.
- Trackingmail kræver afsendte antal, gyldig dato, transportør samt trackingnummer og link. Fremtidig dato eller manglende oplysninger blokerer mailen.
- Kun en fuld, bekræftet PF-afsendelse kan frigive én samlet hævning. Tracking alene, modstridende antal og ufuldstændig ordre blokerer.

## Verifikation

Den samlede test følger PF ASN -> gentagne PF-opdateringer -> én leverance -> én samlet, verificeret hævning -> én trackingmail -> én betalingskvittering -> én version af betalt fakturagrundlag til Financial. Den efterprøver også manglende og efterfølgende tracking, berigelse af reference, fremtidig afsendelse, ændret fakturamodtager, bevarelse af PDF, ubekræftet SMTP samt vedvarende afsendelseslås. Alle eksterne handlinger er simulerede.

Et fakturagrundlag med fiktive oplysninger er renderet og visuelt kontrolleret som én side. Eksempler på betalingskvittering og trackingmail er gemt lokalt under output/pdf/pipeline-demo/.

## Drift ved usikkert udfald

Ved efterladt shipment-mail/<mail-id>.lock: stop behandlingen af den konkrete mail, kontrollér mailkontoens afsendelse og eventuelle aktive processer. Fjern først låsen efter afstemning. En sendt eller usikker mail må ikke sendes blindt igen. Løsningen kræver fælles persistent lager ved flere processer.

## Mangler før aktivering

- Financials svar om privatkundebilag, faktura-/betalingsudligning og afstemning.
- Kontrol af faktisk PF-afsendelse og én samlet hævning på den rigtige ordre, når den er afsendt.
- Verifikation af, at PF ikke sender kunden samme forsendelsesmail, før automatisk Smerch-trackingmail vælges.
- Udtrykkelig aktivering af de ønskede automatiske trin og aftalt starttidspunkt; historiske ordrer behandles ikke automatisk bagud.
