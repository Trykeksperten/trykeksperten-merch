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
