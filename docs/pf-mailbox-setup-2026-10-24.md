# PF-korrekturpostkasse: drift og kontrol

Implementeret 24. oktober 2026. IMAP-modtagelse og kundemails er separate indstillinger. Tilslutning aktiverer læsning af nye mails og sætter korrekturpublicering til manuel gennemgang. Økonomiautomatik og checkout ændres ikke.

## Forbindelse

- one.com: `imap.one.com`, port 993, TLS med certifikatkontrol, `INBOX` åbnet read-only.
- Kontoen er `korrektur@smerch.dk`. Eksisterende `PROOF_SMTP_USER` og `PROOF_SMTP_PASSWORD` genbruges. `PF_PROOF_IMAP_USER` og `PF_PROOF_IMAP_PASSWORD` kan angives særskilt. Ingen adgangskoder i Git eller browseren.
- Tilslut under Automatik og beskeder. Første tilslutning gemmer UIDVALIDITY og den seneste UID som startpunkt. Gamle mails bliver ikke automatisk genimporteret. Genforbindelse bevarer startpunktet.
- Nye mails kontrolleres hvert minut, højst 25 beskeder pr. kørsel og højst 1.000 UID’er pr. opslag. Hele mails er begrænset til 15 MB, PDF’er til 10 MB og 40 sider.
- Ingen mails slettes, flyttes eller markeres som læst. Der anvendes ingen PF-godkendelseslinks.

## Parser og sikkerhed

Formatet er baseret på originalmailen leveret af ejeren: CSE1 / E-proof for approval, fra `ccc@pfconcept.com`, til korrekturpostkassen, én nummereret PDF. MIME læses med mailparser; HTML konverteres til tekst uden at eksekvere eller hente indhold.

PF’s DKIM-signatur verificeres selvstændigt via offentlig DNS. Der kræves en fuld RSA-SHA256-signatur fra pfconcept.com med mindst 2048-bit nøgle, der dækker Date, From, To og Subject. Delvise body-signaturer accepteres ikke. Mailens egne Authentication-Results er ikke alene tillidspunkt.

Emnelinje, mailens footer og PDF’ens Order Number/Customer Reference skal være enige. PDF-tekst læses i en separat worker med grænse for hukommelse, sider og køretid og uden PDF-evaluering eller XFA. PF-linkets adgangsparametre offentliggøres ikke.

Den kendte mailtekst er fingeraftrykt. Ændret tekst, fx nye kunstnerbemærkninger, går til manuel behandling frem for at blive ignoreret eller kopieret ukritisk. PF’s generelle 2–4 timers oplysning og advarsel om metalvarer kopieres ikke til en kasketkunde.

Samme filhash i ordreversionerne genkendes ved mailbox-import, også når den eksisterende fil oprindeligt blev uploadet manuelt eller har en anden korrekturreference. Dette beskytter den godkendte testordre mod genimport af originalmailen.

En hidtil ukendt fil skal have et verificeret mailtidspunkt senere end den aktuelle versions udstedelsestidspunkt, eller dens modtagelsestidspunkt hvis versionen blev uploadet manuelt. Uklar rækkefølge stopper importen. En ny fil nulstiller den aktuelle godkendelse og gamle kundelinks. PF’s generelle ordrestatus bruges ikke som korrekturgodkendelse.

## Drift og undtagelser

UIDVALIDITY-ændring stopper modtagelsen og vises som fejl. Driftsansvarlig skal afstemme postkassen, før `connectProofMailbox({reset:true})` anvendes; reset springer den nuværende historik over. Automatisk reset er bevidst ikke implementeret.

En vedvarende `proof-mailbox/poll.lock` efter et nedbrud stopper nye importer. Stop arbejdere og afstem tilstanden før oprydning. Ryd aldrig låsen på en aktiv import. Beskedposter, originale PF-mails og cursor gemmes privat under `SMERCH_DATA_DIR/proof-mailbox`; de skal omfattes af backup og opbevaringsgennemgang.

Fejlede PF-mails vises i Automatik og beskeder. Når en entydig reference kan aflæses, vises problemet også på ordren. Manuel behandlingsnote sender ingen mail og ændrer ingen godkendelse. Den oprindelige mail findes fortsat i postkassen.

## Runtime og afhængigheder

Den tidligere Node 20.18.0 er ikke kompatibel med de aktuelle, rettede mailpakker. Udgivelsen bruger Node 24.14.0 LTS, nodemailer 10.2.1, mailparser 3.12.4, imapflow 2.9.1 og mailauth 8.0.4. `.node-version`, package engines og Render-konfiguration angiver samme runtime. Render-miljøvariablen NODE_VERSION skal også sættes til 24.14.0, da den har forrang.

Hele testpakken på den valgte runtime: **403 bestået, 0 fejl og 0 sprunget over**. Pakkeaudit for udgivelsen: **0 kendte sårbarheder**. Kontrollen af en revideret korrektur er en simuleret PF-mail med en ny PDF og en lokal testsignatur; den beviser ikke, at PF har sendt en virkelig revision. Originalmailen er desuden afprøvet separat med PF’s rigtige DKIM-signatur og PDF.

Officielle kilder: [one.com kontoindstillinger](https://help.one.com/hc/en-us/articles/115005594285-How-to-set-an-email-account-in-for-example-Outlook), [ImapFlow](https://imapflow.com/docs/api/imapflow-client/), [MailParser](https://nodemailer.com/extras/mailparser), [mailauth](https://github.com/postalsys/mailauth), [Node 24.14.0 LTS](https://nodejs.org/en/blog/release/v24.14.0).
