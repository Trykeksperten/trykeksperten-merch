# PF-fragt: verificerede muligheder og Smerchs løsning

**Opdatering 24. oktober 2026:** Efter ejerens beslutning bruger webshoppen nu fast kundefragt: 150 kr. inkl. moms for private og 250 kr. ekskl. moms for erhverv. Det manuelle kundetilbud beskrevet nedenfor er afløst som standardflow; API-undersøgelsen er fortsat gældende. PF’s omkostning er ukendt ved bestilling og må ikke udledes af kundens fragtpris.

Kontrolleret 24. oktober 2026. Ingen PF-ordrer er oprettet under undersøgelsen. Ingen interne PF Store-endpoints er antaget eller anvendt.

## Kilder og verificerede forhold

- [Gateway-manual v2.2.2, august 2026](https://thedigitalcatalogue.com/pdf/2025/gateway_manual.pdf), oversigt og afsnit 3: ordreoprettelse, lager, ordrebekræftelse, ordrestatus og ASN. Ordrebekræftelsen kommer efter ordreoprettelse. Der er ikke dokumenteret et fragt-/rate-/quote-endpoint før bestilling.
- [Officiel Swagger-indgang](https://wsa.pfconcept.com/test/RestGateway/) og dens [RestGateway.yaml](https://wsa.pfconcept.com/test/RestGateway/RestGateway.yaml?v=1.0): gennemgåede paths er `/order`, `/inventory`, `/orderstatus`, `/productDetail`. Shipment.Service understøtter STD; ekspres skal aftales med PF. Et ordre-POST må ikke bruges som prisforespørgsel: det opretter en ordre.
- [GatewayOutbound.yaml](https://wsa.pfconcept.com/test/RestGateway/GatewayOutbound.yaml): `/orderconfirmation` indeholder `shipments[].cost`, beskrevet som delivery cost. ASN har leverancer, service, kolli-/vareoplysninger og tracking. Dette dokumenterer information efter bestilling, ikke forhåndsberegning. Et `Costs`-beløb ses i et ordrestatus-eksempel; det er heller ikke et tilbud før ordreoprettelse.
- [PF Shipping](https://www.pfconcept.com/en_nl/shipping-options): PF skriver, at fragt afhænger af service og ordrestørrelse og beregnes inden afslutning af bestillingen i PF Store. Det dokumenterer PF Stores funktion, ikke adgang til samme beregning fra Gateway.
- [Data feed v3.6.7, maj 2026](https://thedigitalcatalogue.com/pdf/2025/data_feed_manual.pdf), produktfeed: vægt, produktmål, antal pr. karton, emballage og bruttovægt findes som produktdata. Der er ikke et fragtprisfeed i den dokumenterede feedoversigt. Mål og kartontal er ikke en verificeret takst- eller pakkeberegningsmodel.
- [PF’s vilkår](https://www.pfconcept.com/en_nl/general-terms), 4.1–4.2, 4.5, 6.10 og 6.13: fragt afhænger bl.a. af antal og leveringssted; lokale priser kan oplyses ved forespørgsel. Priser er generelt ekskl. moms og fragt, medmindre andet angives. PF forbeholder sig prisændringer ved visse omkostningsstigninger, kan dellevere og kan kræve betaling for ændret levering.

## Svar på de konkrete spørgsmål

| Spørgsmål | Verificeret svar / grænse |
| --- | --- |
| Beregning før oprettelse? | Ja i PF Store. Ikke dokumenteret som funktion i den gennemgåede API. Kontospecifik eller nyere adgang kan kun bekræftes af PF. |
| Krævede API-input? | Ukendt, fordi intet fragtberegnings-endpoint er dokumenteret. Vi kan ikke udlede et requestschema fra ordre-endpointet. |
| Data til manuel beregning? | Konkret SKU, antal, trykvalg/produktionssted, leveringsadresse og STD-service. Produktfeedets vægt-/emballagedata kan hjælpe PF/medarbejderen; Smerch gætter ikke selv antal pakker eller takst. |
| Endelig pris eller estimat? | Ingen dokumenteret garanti for et forhåndstilbud via API. PF Store-/manuelt tilbud kontrolleres konkret. Smerchs kundetilbud har sin egen udløbstid. |
| Moms og valuta? | API-feltet `shipments[].cost` beskriver ikke selv afgiftsgrundlaget. Generelle vilkår er ikke tilstrækkelig dokumentation for et bestemt API-felts momssemantik. Manuel registrering kræver udtrykkelig bekræftelse af DKK ekskl. moms. Andre valutaer konverteres ikke automatisk. |
| Blandede kurve? | Den eksisterende afgrænsning mellem varer med og uden tryk bevares: separate bestillinger. Flere kendte produktionssteder kræver en faktisk PF-pris for hver gruppe. Der antages ingen fælles fragtbesparelse. |
| Flere pakker/delleverancer? | ASN kan beskrive flere leverancer og trackingnumre efter ordreoprettelse. Der er ikke dokumenteret en prisregel pr. pakke/delleverance. Medarbejderen skal bekræfte, at tilbuddet dækker alle varer, pakker og planlagte leverancer. |
| Gyldighed og ændringer? | API-TTL og bindende prisreference er ikke dokumenteret. Medarbejderen angiver Smerchs tilbudsfrist og registrerer en PF-reference, hvis PF har givet en. En stigning i PF’s omkostning hæver aldrig kundens allerede accepterede fragtpris automatisk. |

## Implementeret flow

1. Offentlig live-checkout anvender ikke længere faste lande-/produktionsstedsbeløb som aktuelle PF-priser. Disse værdier kan fortsat bruges i betalingssandbox. Den særskilt autoriserede, eksisterende interne pilot bevares som intern test; dens kasketpris anvendes ikke på andre kundeordrer.
2. Kunden udfylder kurv og levering og vælger **Bed om fragtpris**. En privat forespørgsel registreres under **Fragt og tilbud** i administrationen. Der oprettes ingen betalingsreservation eller PF-ordre, og forespørgslen er ikke en bestilling.
3. Smerch kontrollerer den samlede levering i PF Store eller med PF og registrerer omkostninger pr. produktionsgruppe, eventuel PF-prisreference, kontrolkilde og en udløbstid. PF-pris, DKK ekskl. moms og fuld leveringsdækning skal bekræftes. 0 kr. kræver særskilt bekræftet gratis fragt; manglende pris bliver aldrig til 0.
4. Kundens checkout henter tilbuddets status. Varepris, fragt, moms og samlet pris vises før bestilling. Et særskilt tilvalg kræver kundens accept af fragt og total. Denne accept erstatter ikke de eksisterende handelsbetingelser.
5. Ændret kurv, antal, trykvalg, produktionsgrupper, leveringsoplysninger, service eller varepris kræver ny pris. Udløb, ny tilbudsversion og genbrug af et forbrugt tilbud afvises i backenden. Betaling kræver fortsat lager, de eksisterende betalings-/PF-gates og åben checkout.
6. Tilbuddet låses til én betalingsordre. Ordren gemmer accepteret pris og tidspunkt, PF-omkostning, Smerch-tillæg, valuta, PF-reference pr. gruppe, kildereference, udløb og medarbejderidentitet. Historiske ordrer genberegnes ikke.

### Tillæg og bogføring

`SMERCH_FREIGHT_MARKUP_EX_VAT_DKK` er ét centralt tillæg pr. ordre; standard er 0 i tillæg, ikke 0 i fragt. PF’s faktiske omkostning skal stadig registreres. Tilbuddet gemmer tillægget som et snapshot. Kundens fragtpris er PF-omkostningen plus tillæg og dansk moms som i den eksisterende checkout. Administrative beløb og kildedata udleveres ikke gennem kundens status-endpoint.

### Drift og afgrænsning

Dette er manuel PF-prissætning med automatisk videreførsel til checkout, ikke et PF-fragt-API. Kunden kan følge tilbuddet i den åbne checkout; tilbudsadgang gemmes i sessionStorage, og formularens leveringsoplysninger skal fortsat passe. Der sendes endnu ingen automatisk mail om fragtforespørgsler eller færdige fragttilbud. Administratoren skal behandle køen. En senere mailfunktion kræver et særskilt afstemt afsendelsesflow.

Posterne ligger privat under `SMERCH_DATA_DIR/freight-quotes`. En afbrudt claim/persist-operation eller vedvarende `.lock` kræver afstemning, før tilbuddet frigives igen. Der ryddes ikke automatisk op i en muligvis accepteret ordre. Den eksisterende backup skal omfatte disse poster.

Lancering, økonomiautomatik, betalingshævning, eksisterende ordrer og PF’s kontooplysninger ændres ikke af denne udgivelse.

## Skal afklares med PF for fuld automatik

Bed PF’s API-support om officiel dokumentation og kontoadgang til en eventuel beregning før ordre: endpoint, auth, requestschema, kurv-/adresse-/serviceparametre, kolli og produktionssteder, valuta/moms, om prisen er bindende, reference/TTL, tillæg samt ændringer ved ompakning og delleverancer. PF Store-funktionalitet er ikke i sig selv bevis for tilladt API-adgang. Indtil da forbliver prissætningen manuel.

## Kontrol

428 automatiske tests består i den isolerede udgivelse, inklusive nye tests for tilbudsadgang, pris- og adresseskift, revision/udløb, moms/tillæg, samtidig brug, administratoridentitet og kundens særskilte accept. Testserverne opretter ingen rigtige PF-ordrer og foretager ingen betalinger eller mailafsendelser. Offentlig checkout er fortsat lukket af den eksisterende lanceringsspærring; en reel PF-fragtpris er ikke hentet automatisk.
