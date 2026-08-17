# KYC-rutin: Digital onboarding av nya SME-lånekunder

| Fält | Värde |
|---|---|
| **Dokumentnummer** | KYC-SME-001 |
| **Version** | 1.0 |
| **Ikraftträdandedatum** | 2025-07-14 |
| **Nästa översyn** | 2026-07-14 |
| **Dokumentägare** | Kreditchef |
| **Godkännandroll** | Kreditchef |
| **Klassificering** | Intern — ej för distribution utanför Nordvik Kredit |

---

## 1. Syfte

Denna rutin beskriver de kundkännedomsåtgärder (KYC) som Kreditavdelningens onboarding-team ska genomföra vid digital onboarding av nya SME-lånekunder. Rutinen säkerställer att Nordvik Kredit uppfyller sina skyldigheter enligt penningtvättslagen (2017:630) att identifiera, verifiera och bedöma kunder innan en affärsrelation ingås eller ett krediterbjudande lämnas.

Rutinen täcker flödet från det att en ansökan inkommer i det digitala ansökningsflödet till dess att kunden är godkänd för onboarding, nekad, eller eskalerad till Centralt funktionsansvarig för penningtvätt.

---

## 2. Omfattning

Rutinen gäller för:

- **Kundtyp:** Nya SME-lånekunder — svenska aktiebolag, ej börsnoterade, med färre än 50 anställda.
- **Kanal:** Det digitala ansökningsflödet (kärnsystemets kredit- och kredithanteringsplattform).
- **Verksamhet:** Konsument- och företagskrediter riktade till aktiebolag i den ovan beskrivna storlekskategorin.
- **Personal:** Kreditavdelningens onboarding-team.

Rutinen gäller inte för:
- Befintliga kunder med aktiv affärsrelation (hanteras av rutin för löpande kundkännedom).
- Börsnoterade bolag eller bolag med fler än 50 anställda.
- Privatkunder.

---

## 3. Ansvar

| Roll | Ansvar |
|---|---|
| **Onboarding-handläggare** (Kreditavdelningen) | Tar emot ansökan, genomför grundläggande kundkontroll, begär in kompletterande underlag och dokumenterar åtgärder i kärnsystemet. |
| **Senior onboarding-handläggare** (Kreditavdelningen) | Granskar ärenden med förhöjd risk, fattar beslut om godkännande eller nekande inom delegationsramen, eskalerar till Centralt funktionsansvarig för penningtvätt vid utlösande händelse. |
| **Kreditchef** | Äger och ansvarar för att denna rutin hålls aktuell; fastställer delegationsramar för onboarding-teamet; godkänner rutinen. |
| **Centralt funktionsansvarig för penningtvätt** | Tar emot eskalerade ärenden, fattar beslut om eskalering till Finanspolisen (FIU), och meddelar onboarding-teamet om utfall. |
| **Dataskyddsombud (DPO)** | Konsulteras vid behandling av personuppgifter om verkliga huvudmän eller politiskt exponerade personer (PEP) som innebär ny eller utvidgad behandling. |

---

## 4. Rutin

Stegen nedan genomförs i angiven ordning. Alla åtgärder dokumenteras löpande i kärnsystemets KYC-modul under ärendets referensnummer.

### Fas 1 — Mottagning och initial screening

1. Onboarding-handläggaren tar emot den digitalt inkomna ansökan i kärnsystemet och tilldelar den ett unikt ärendenummer.

2. Onboarding-handläggaren verifierar att ansökan avser ett svenskt aktiebolag, ej börsnoterat, med färre än 50 anställda. Om dessa villkor inte uppfylls avslutas ärendet och sökanden hänvisas till rätt kanal. Utfallet noteras i kärnsystemet.

3. Onboarding-handläggaren hämtar registrerade uppgifter om bolaget från Bolagsverkets register (organisationsnummer, bolagsform, registrerad adress, styrelseledamöter, firmatecknare). Datumet för sökningen registreras i kärnsystemet.

4. ⚠️ Onboarding-handläggaren genomför en inledande sanktions- och PEP-screening av bolaget, dess styrelseledamöter och firmatecknare mot tillämpliga sanktionslistor (EU, FN, OFAC) samt PEP-register. Screeningresultatet — inklusive eventuella träffar och bedömning av dessa — dokumenteras i kärnsystemet.

### Fas 2 — Identifiering och verifiering av kunden

5. Onboarding-handläggaren begär in och granskar följande underlag från sökanden via det digitala ansökningsflödet:
   - Registreringsbevis eller aktuellt utdrag från Bolagsverket (utfärdat inom 3 månader).
   - Identitetshandlingar (giltig legitimation) för firmatecknare och de som är behöriga att agera för bolagets räkning.
   - Beskrivning av verksamhet, syfte med krediten och förväntad användning av kreditmedlen.

6. ⚠️ Onboarding-handläggaren verifierar att uppgifterna i inlämnade handlingar överensstämmer med uppgifterna i Bolagsverkets register. Avvikelser noteras och bedöms; väsentliga avvikelser innebär att ärendet inte kan gå vidare utan utredning.

### Fas 3 — Identifiering av verklig huvudman

7. Onboarding-handläggaren begär in ägarstruktur för bolaget, inklusive direkta och indirekta ägare, via det digitala ansökningsflödet.

8. ⚠️ Onboarding-handläggaren identifierar alla verkliga huvudmän — fysiska personer som direkt eller indirekt äger eller kontrollerar mer än 25 % av bolaget, eller på annat sätt utövar kontroll. Identifieringen baseras på uppgifter från sökanden, Bolagsverkets register över verkliga huvudmän och eventuellt tillkommande ägarstrukturintyg.

9. ⚠️ Onboarding-handläggaren verifierar identiteten på varje identifierad verklig huvudman med giltig identitetshandling (pass eller nationellt ID-kort). Kopia sparas i kärnsystemet under ärendets referensnummer.

10. ⚠️ Onboarding-handläggaren genomför sanktions- och PEP-screening av varje identifierad verklig huvudman mot tillämpliga sanktionslistor (EU, FN, OFAC) och PEP-register. Screeningresultatet dokumenteras i kärnsystemet.

11. Om ägarstrukturen inkluderar juridiska personer i flera led (komplex ägarstruktur) ska onboarding-handläggaren kartlägga samtliga led tills fysisk person identifierats. Om fullständig kartläggning inte kan genomföras inom 5 arbetsdagar eskaleras ärendet till Senior onboarding-handläggare för bedömning av om skärpta åtgärder ska tillämpas.

### Fas 4 — Riskklassificering

12. Onboarding-handläggaren sammanställer insamlade uppgifter och genomför riskklassificering av kunden i kärnsystemets riskklassificeringsmodul. Riskklassificeringen tar hänsyn till:
    - Geografisk risk (land för verksamhet, ägarnas hemvist).
    - Kundtyp och verksamhetstyp.
    - Transaktionsmönster och syfte med affärsrelationen.
    - Resultaten av sanktions- och PEP-screeningarna.

13. ⚠️ Onboarding-handläggaren bedömer om något av följande högriskindikator föreligger:
    - Kund eller verklig huvudman med hemvist i, eller affärskoppling till, ett land som av FATF klassificeras som högriskland eller jurisdiktion under förstärkt bevakning.
    - Komplex eller svårgenomtränglig ägarstruktur som fördröjer eller försvårar identifiering av verklig huvudman.
    - Kontantintensiv verksamhet (t.ex. handel, restaurang, fordonshandel).
    - Politiskt exponerad person (PEP) bland styrelseledamöter, firmatecknare eller verkliga huvudmän.
    - Ovanliga eller svårförklarliga transaktionsmönster i underlagen.
    - Avvikelse mellan angiven verksamhetsbeskrivning och faktiska ägarförhållanden eller omsättning.

    Om ett eller flera högriskindikator föreligger, tillämpas skärpta åtgärder enligt Fas 5. Om inga högriskindikator föreligger, fortsätter handläggningen enligt Fas 6.

### Fas 5 — Skärpta åtgärder vid högriskindikator

14. Senior onboarding-handläggare tar över ärendet och genomför fördjupad utredning. Alla steg i fördjupad utredning dokumenteras i kärnsystemet.

15. Senior onboarding-handläggare begär in kompletterande underlag anpassade till den identifierade risken, exempelvis:
    - Bekräftelse av medels ursprung (source of funds) och förmögenhetens ursprung (source of wealth) för verkliga huvudmän vid PEP-koppling.
    - Ytterligare ägarstrukturintyg med bolagsordning och aktiebok vid komplex ägarstruktur.
    - Redovisning av typiska transaktionsvolymer och motparter vid kontantintensiv verksamhet.
    - Förklaring till affärskoppling med högriskland med stödjande dokumentation.

16. ⚠️ Senior onboarding-handläggare genomför förnyad sanktions- och PEP-screening med utvidgat sökurval (inkl. negativ nyhetssökning) och dokumenterar utfallet.

17. ⚠️ Senior onboarding-handläggare bedömer om ärendet ska:
    - Fortsätta till godkännandefas med skärpta villkor och utökad löpande bevakning, **eller**
    - Eskaleras omedelbart till Centralt funktionsansvarig för penningtvätt.

    Eskalering till Centralt funktionsansvarig för penningtvätt sker vid någon av följande utlösande händelser:
    - Bekräftad träff mot sanktionslista.
    - PEP med hög riskprofil och otillräcklig förklaring av medels ursprung.
    - Misstanke om att ansökan, kunden eller de bakomliggande transaktionerna kan vara kopplade till penningtvätt eller finansiering av terrorism.
    - Ägarstruktur eller transaktionsmönster som inte kan utredas tillfredsställande trots begäran om kompletterande underlag.
    - Kund hemmahörande i eller med väsentliga affärskopplingar till FATF-klassificerat högriskland, kombinerat med otillräcklig förklaring.

18. ⚠️ Senior onboarding-handläggare registrerar eskaleringen i kärnsystemet med fullständig ärendedokumentation och överlämnar ärendet till Centralt funktionsansvarig för penningtvätt. Kunden informeras inte om att eskalering skett (tippningsförbud).

19. Centralt funktionsansvarig för penningtvätt bekräftar mottagande i kärnsystemet och meddelar Senior onboarding-handläggare om utfall (fortsätt, neka eller rapportera till Finanspolisen). Onboarding-processen avvaktar detta besked.

### Fas 6 — Beslut och dokumentation i kärnsystemet

20. Onboarding-handläggaren (standardärende) eller Senior onboarding-handläggare (högriskärende) sammanställer ärendedokumentationen och fattar beslut inom delegationsramen:
    - **Godkänd:** Kunden godkänns för onboarding; affärsrelation ingås och kreditansökan går vidare i kreditprövningsflödet.
    - **Nekad:** Ansökan avslås på grund av otillräcklig kundkännedom, sanktionsträff, oförmåga att identifiera verklig huvudman, eller liknande.
    - **Eskalerad (avvaktar):** Ärendet är överlämnat till Centralt funktionsansvarig för penningtvätt; beslut fattas efter besked därifrån.

21. ⚠️ Beslutets utfall — Godkänd, Nekad eller Eskalerad — registreras i kärnsystemet med:
    - Ärendets referensnummer.
    - Datum och klockslag för beslutet.
    - Beslutande roll (Onboarding-handläggare eller Senior onboarding-handläggare).
    - Beslutsgrund i klartext (kortfattad, spårbar motivering).
    - Hänvisning till samtliga inlagrade underlag och screeningprotokoll.

22. Vid beslut **Nekad** informeras sökanden skriftligt via det digitala ansökningsflödet om att ansökan inte kan beviljas. Skäl för avslag anges på en nivå som är förenlig med tippningsförbudet — ingen information lämnas om eventuell AML-misstanke.

23. Vid beslut **Godkänd** skapas kundens KYC-profil i kärnsystemet, inklusive tilldelad riskklass, tidpunkt för nästa löpande kundkännedomsöversyn och eventuella skärpta övervakningsvillkor.

24. Samtliga handlingar, screeningprotokoll och beslutsunderlag arkiveras i kärnsystemet och bevaras i minst fem (5) år från det att affärsrelationen avslutats, i enlighet med penningtvättslagen.

---

## 5. Risker & Kontroller

| # | Risk / Regelkritiskt steg | Kontroll | Ansvarig roll |
|---|---|---|---|
| 1 | ⚠️ Felaktig eller ofullständig identifiering av verklig huvudman leder till att penningtvätt inte upptäcks. | Onboarding-handläggaren kontrollerar att ägarstruktur är fullständigt kartlagd till fysisk person och att verklig huvudman med >25 % ägande eller kontroll är identifierad och verifierad med ID-handling. Ärenden med komplex ägarstruktur eskaleras till Senior onboarding-handläggare. | Onboarding-handläggare / Senior onboarding-handläggare |
| 2 | ⚠️ Sanktionerad part eller PEP passerar onboarding utan att identifieras. | Obligatorisk screening mot EU-, FN- och OFAC-sanktionslistor samt PEP-register genomförs för bolaget, styrelseledamöter, firmatecknare och verkliga huvudmän. Screeningresultat dokumenteras i kärnsystemet. Träffar eskaleras omedelbart. | Onboarding-handläggare (initial), Senior onboarding-handläggare (utvidgad vid högrisk) |
| 3 | ⚠️ Högriskindikator missas vid riskklassificering. | Riskklassificering genomförs systematiskt för varje ärende i kärnsystemets riskklassificeringsmodul. Listan med högriskindikator (steg 13) granskas punkt för punkt och resultatet dokumenteras. | Onboarding-handläggare |
| 4 | ⚠️ Eskalering till Centralt funktionsansvarig för penningtvätt uteblir vid AML-misstanke. | Utlösande händelser för eskalering är specificerade och exhaustiva (steg 17). Senior onboarding-handläggare ansvarar för att eskalering sker skyndsamt och dokumenteras i kärnsystemet. | Senior onboarding-handläggare |
| 5 | ⚠️ Kunden aviseras om AML-utredning (tippning) i strid med penningtvättslagen. | Avslagsbesked utformas utan att röja AML-misstanke. Senior onboarding-handläggare granskar text i avslagsmeddelanden vid högriskärenden innan utskick. | Senior onboarding-handläggare |
| 6 | ⚠️ Otillräcklig dokumentation försvårar tillsynsgranskning. | Alla steg, underlag, screeningprotokoll och beslut registreras i kärnsystemet under ärendets referensnummer i realtid, inte i efterhand. Kreditchef genomför stickprovskontroller kvartalsvis. | Onboarding-handläggare / Kreditchef |
| 7 | ⚠️ Personuppgifter om verkliga huvudmän behandlas felaktigt. | DPO konsulteras vid ny eller utvidgad behandling av personuppgifter. Uppgifter om verkliga huvudmän lagras endast i kärnsystemet under ärendets referensnummer och i enlighet med Nordvik Kredits registerförteckning. | Onboarding-handläggare / DPO |

---

## 6. Regelhänvisningar

| Regelverk / Policy | Relevans |
|---|---|
| Lag (2017:630) om åtgärder mot penningtvätt och finansiering av terrorism (penningtvättslagen) — 3 kap. (åtgärder för kundkännedom), 4 kap. (skärpta åtgärder), 5 kap. (uppgiftsskyldighet och rapportering) | Primär rättslig grund för hela rutinen. Definierar krav på kundkännedom, identifiering av verklig huvudman, skärpta åtgärder och rapporteringsskyldighet till Finanspolisen. |
| Finansinspektionens föreskrifter och allmänna råd om åtgärder mot penningtvätt och finansiering av terrorism (FFFS 2017:11 med ändringsföreskrifter) | Preciserar hur penningtvättslagen ska tillämpas av finansiella företag under FI:s tillsyn. |
| Europaparlamentets och rådets direktiv (EU) 2015/849 om åtgärder för att förhindra att det finansiella systemet används för penningtvätt eller finansiering av terrorism (fjärde penningtvättsdirektivet), med ändringar i direktiv (EU) 2018/843 (femte penningtvättsdirektivet) | EU-rättslig ram som penningtvättslagen genomför. |
| FATF:s förteckning över högriskländer och jurisdiktioner under förstärkt bevakning | Referenslista för geografisk riskbedömning (steg 13 och 15). |
| Europaparlamentets och rådets förordning (EU) 2016/679 (GDPR), artikel 5, 13 och 30 | Reglerar behandling av personuppgifter om verkliga huvudmän och PEP. |
| Nordvik Kredit — Intern policy för kundkännedom och åtgärder mot penningtvätt | [UPPGIFT SAKNAS: Ange intern policyreferens — dokumentnummer och versionsdatum — för Nordvik Kredits AML/KYC-policy. Ska tillhandahållas av Centralt funktionsansvarig för penningtvätt.] |
| Nordvik Kredit — Intern delegationsordning för kreditbeslut | [UPPGIFT SAKNAS: Ange referens till gällande delegationsordning. Ska tillhandahållas av Kreditchef.] |

---

## 7. Godkännande & Översyn

| Fält | Värde |
|---|---|
| **Version** | 1.0 |
| **Ikraftträdandedatum** | 2025-07-14 |
| **Dokumentägare** | Kreditchef |
| **Godkännandroll** | Kreditchef |
| **Datum för nästa översyn** | 2026-07-14 |
| **Status** | Utkast — inväntar godkännande av Kreditchef |

Dokumentet ska granskas och vid behov revideras:
- Senast ett (1) år efter ikraftträdandet.
- Vid väsentliga förändringar i penningtvättslagen eller Finansinspektionens föreskrifter.
- Vid väsentliga förändringar i det digitala ansökningsflödet eller kärnsystemets KYC-modul.
- Om tillsynsmyndighet eller intern revision identifierar brister i rutinen.

Ändringar i dokumentet kräver ny version, nytt ikraftträdandedatum och godkännande av Kreditchef. Komplianceförändringar med omedelbar rättslig verkan ska dessutom anmälas till Compliance-chef.

---

*Detta dokument är internt och får inte distribueras utanför Nordvik Kredit. Inga verkliga kundidentifierande uppgifter eller kontouppgifter förekommer i detta dokument.*
