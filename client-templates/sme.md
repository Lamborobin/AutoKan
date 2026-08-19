# KYC-rutin: Digital onboarding av nya SME-lånekunder

| | |
|---|---|
| **Version** | 1.0 |
| **Ikraftträdandedatum** | 2026-08-14 |
| **Nästa översyn** | 2027-08-14 |
| **Dokumentägare** | Kreditchef |
| **Godkännandroll** | Kreditchef |

---

## 1. Syfte

Rutinen beskriver stegen för kundkännedom (KYC) vid digital onboarding av nya SME-lånekunder hos Nordvik Kredit AB. Den anger hur Kreditavdelningens onboarding-team identifierar kunden, fastställer verklig huvudman, genomför grundläggande och vid behov skärpta kundkännedomsåtgärder, eskalerar ärenden med hög risk samt dokumenterar beslutet i kärnsystemet.

Syftet är att säkerställa att Nordvik Kredit uppfyller skyldigheterna enligt penningtvättslagen (2017:630) och därigenom förebygger att verksamheten utnyttjas för penningtvätt eller finansiering av terrorism.

---

## 2. Omfattning

Rutinen gäller för:

- **Kunder:** Onoterade aktiebolag med färre än 50 anställda (SME) som ansöker om lån via Nordvik Kredits digitala ansökningsflöde.
- **Medarbetare:** Kreditavdelningens onboarding-team.
- **Produkter:** Samtliga konsument- och företagskreditprodukter riktade till SME som erbjuds via den digitala kanalen.

Rutinen täcker processen från att en ansökan inkommer i det digitala ansökningsflödet till att kunden antingen godkänns, nekas eller eskaleras till Centralt funktionsansvarig för penningtvätt.

---

## 3. Ansvar

| Roll | Ansvar |
|---|---|
| **Kredithandläggare, onboarding-team** | Utför kontroller i steg 1–8; registrerar uppgifter och utfall i kärnsystemet; initierar eskalering vid utlösande händelse |
| **Kreditchef** | Äger rutinen; godkänner slutligt avvikande kreditbeslut på lägre risknivå; mottar rapport om åtgärder och utfall |
| **Centralt funktionsansvarig för penningtvätt** | Tar emot eskalerade ärenden; beslutar om skärpta åtgärder, ev. nekande av kundrelation och rapportering till Finanspolisen (FIU) |
| **Compliance-chef (regelefterlevnadschef)** | Säkerställer att rutinen är aktuell och i enlighet med gällande regelverk; godkänner policydokument |
| **Dataskyddsombud (DPO)** | Konsulteras vid behandling av uppgifter som rör kund- eller personidentifiering |

---

## 4. Rutin

### Fas A — Mottagning och initial verifiering

1. Onboarding-teamet mottar den digitala ansökan i kärnsystemet och bekräftar att ansökan är komplett (organisationsnummer, bolagsnamn, uppgifter om firmatecknare och begärt kreditbelopp angivna).

2. Handläggaren hämtar aktuell registreringsinformation för det sökande aktiebolaget från Bolagsverket via systemintegrationen i kärnsystemet. Uppgifterna som kontrolleras är: bolagets registreringsstatus, säte, firmatecknare och aktiekapital.

3. ⚠️ Handläggaren verifierar firmatecknarens identitet. Digital identifiering sker via BankID (eller motsvarande godkänd e-legitimation). Identiteten kontrolleras mot uppgifterna i Bolagsverkets register. Om identitetsverifiering inte kan genomföras digitalt avbryts onboardingen och ärendet eskaleras (se steg 13).

### Fas B — Identifiering av verklig huvudman

4. ⚠️ Handläggaren fastställer bolagets verkliga huvudman i enlighet med penningtvättslagen (2017:630) 1 kap. 5 § och 3 kap. 6–7 §§. Verklig huvudman definieras som fysisk person som direkt eller indirekt äger eller kontrollerar mer än 25 % av aktierna eller rösterna, eller på annat sätt utövar kontroll över bolaget.

5. Handläggaren hämtar uppgifter om verklig huvudman ur Bolagsverkets register över verkliga huvudmän (VHM-registret) via systemintegrationen. Om registrerade uppgifter saknas eller är äldre än 12 månader kontaktas kunden för att inkomma med aktuell ägarförteckning och relevant styrkande dokumentation (t.ex. aktiebok).

6. ⚠️ Handläggaren jämför inlämnade uppgifter om verklig huvudman med VHM-registret. Avvikelse eller oklarhet i ägarstrukturen registreras som en högriskindikator i kärnsystemet och utlöser skärpta åtgärder (se Fas D).

7. Handläggaren genomför PEP-kontroll (politiskt utsatt person) och sanktionskontroll för samtliga identifierade verkliga huvudmän och firmatecknare. Kontrollen utförs mot godkänd leverantörslista i kärnsystemet. Positivt utslag registreras som högriskindikator och utlöser omedelbar eskalering (se steg 13).

### Fas C — Grundläggande kundkännedom

8. Handläggaren inhämtar och verifierar följande uppgifter i enlighet med penningtvättslagen (2017:630) 3 kap. 7–9 §§:

   - Kundens affärsverksamhet och syfte med kreditrelationen
   - Förväntad transaktionsvolym och förväntad kreditanvändning
   - Bransch och geografisk exponering (SNI-kod, verksamhetsland)
   - Ursprung för bolagets kapital (vid begärt kreditbelopp som överstiger `[UPPGIFT SAKNAS: beloppsgräns för utökad kapitalursprungskontroll — ska fastställas av Kreditchef och Centralt funktionsansvarig för penningtvätt]`)

9. Handläggaren bedömer kundkännedomsprofilen i kärnsystemet baserat på inhämtade uppgifter. Systemet tilldelar ärendet en riskklass: **Låg**, **Medel** eller **Hög**. Riskklassificeringen följer Nordvik Kredits interna riskklassificeringsmodell.

   - **Låg/Medel risk:** Gå till Fas E (beslut).
   - **Hög risk eller förekomst av högriskindikator:** Gå till Fas D (skärpta åtgärder).

### Fas D — Skärpta åtgärder vid högriskindikator

Skärpta åtgärder utförs om ett eller flera av följande högriskindikatorerna föreligger:

- Kunden eller verklig huvudman är hemmahörande i eller har väsentliga affärsförbindelser med ett högriskland (land som förekommer på FATF:s eller EU:s förteckning över högrisktredjeländer)
- Komplex ägarstruktur (t.ex. flera juridiska ägarnivåer, utländska holdingbolag, truster eller liknande)
- Verksamheten är kontantintensiv (t.ex. dagligvaruhandel, restaurang, bensinstation)
- PEP- eller sanktionsutslag (kräver alltid omedelbar eskalering — se steg 13)
- Avvikelse eller oklarhet i VHM-registret (se steg 6)
- Kärnsystemets riskmodell klassar ärendet som Hög risk

10. ⚠️ Handläggaren inhämtar kompletterande dokumentation för att styrka ägarstruktur och kapitalursprung. Dokumentation kan inkludera: reviderade årsredovisningar, aktiebok, organisationsschema med ägarnivåer, förklaring av affärsmodell och intäktskällor. Kunden ges en tidsgräns om `[UPPGIFT SAKNAS: antal dagar för komplettering — ska fastställas av Kreditchef]` dagar för att inkomma med dokumentation.

11. ⚠️ Handläggaren genomför utökad granskning av transaktionsmönster och affärsförhållanden, inklusive sökning i öppna källor (t.ex. pressbevakning, bolagsregister i verksamhetsländer) avseende negativt nyhetsflöde. Granskningen dokumenteras i kärnsystemet.

12. Handläggaren sammanställer underlag och dokumenterar resultaten av de skärpta åtgärderna i kärnsystemet. Ärendet kan antingen godkännas med förhöjd riskklassificering (beslut av Kreditchef), nekas, eller eskaleras till Centralt funktionsansvarig för penningtvätt.

### Fas E — Eskalering

13. ⚠️ Handläggaren eskalerar ärendet till Centralt funktionsansvarig för penningtvätt vid något av följande utlösande händelser:

    - Positivt PEP- eller sanktionsutslag
    - Verklig huvudman kan inte identifieras trots skärpta åtgärder
    - Kunden vägrar lämna begärd dokumentation
    - Handläggaren bedömer att misstanke om penningtvätt eller finansiering av terrorism föreligger
    - Verksamhets- eller ägarstruktur är ogenomtränglig efter skärpta åtgärder
    - Kund från högriskland som inte kan ge tillfredsställande förklaring av affärsförbindelsen

   Eskalering genomförs via ärendehanteringsfunktionen i kärnsystemet och märks som "Eskalerat — AML". Handläggaren får inte informera kunden om att eskalering skett om det finns risk för att avisering motverkar utredning (tippningsförbud, penningtvättslagen (2017:630) 4 kap. 9 §).

14. Centralt funktionsansvarig för penningtvätt tar emot det eskalerade ärendet, bekräftar mottagning i kärnsystemet och ansvarar för det fortsatta handläggningsflödet inklusive eventuell rapportering till Finanspolisen (FIU).

### Fas F — Beslut och dokumentation

15. ⚠️ Handläggaren registrerar utfallet av KYC-processen i kärnsystemet under kundposten för [KUNDNAMN] / [ORGANISATIONSNUMMER]. Möjliga utfall:

    - **Godkänd:** Kunden uppfyller KYC-kraven. Kundrelation etableras. Kärnsystemet uppdateras med riskklass, nästa kontrollintervall och genomförda åtgärder.
    - **Nekad:** Kunden uppfyller inte KYC-kraven eller har meddelat att denne inte vill lämna erforderlig information. Avslag registreras i kärnsystemet med orsakkod. Kunden meddelas om avslaget i enlighet med Nordvik Kredits kommunikationsrutin — utan att ange detaljer om KYC-åtgärderna om det strider mot tippningsförbudet.
    - **Eskalerad:** Ärendet överlämnat till Centralt funktionsansvarig för penningtvätt. Kundrelation etableras inte förrän Centralt funktionsansvarig för penningtvätt meddelat beslut.

16. Handläggaren registrerar datum, genomförda kontroller, inhämtad dokumentation och ansvarig handläggare i kärnsystemets ärendelogg. Dokumentationen ska vara tillräcklig för att möjliggöra rekonstruktion av beslutsunderlaget vid en intern eller extern revision.

17. Kredithandläggaren noterar att onboardingärendet är avslutat i kärnsystemet. Kreditchef mottar automatisk systemavisering vid ärenden med riskklass Hög eller vid eskalering.

---

## 5. Risker & Kontroller

| # | ⚠️ Risk / regelkritiskt steg | Kontroll | Ansvarig roll |
|---|---|---|---|
| 1 | ⚠️ Ofullständig identifiering av verklig huvudman leder till att ett skalbolag eller en skuggägare passerar kontrollen | Obligatorisk jämförelse mot VHM-registret (steg 4–6); avvikelse utlöser automatiskt högriskindikator i kärnsystemet | Kredithandläggare, onboarding-team |
| 2 | ⚠️ PEP eller sanktionerad part godkänns som kund | Automatisk PEP- och sanktionskontroll mot godkänd leverantör (steg 7); positivt utslag blockerar godkännande och kräver omedelbar eskalering | Kredithandläggare, onboarding-team |
| 3 | ⚠️ Kund från högriskland godkänns utan skärpta åtgärder | Kärnsystemets riskmodell flaggar högriskland automatiskt; skärpta åtgärder (Fas D) är obligatoriska och kan inte förbigås av handläggaren | Kredithandläggare, onboarding-team |
| 4 | ⚠️ Ärendet eskaleras inte trots att utlösande händelse föreligger (tippningsförbud kringgås felaktigt) | Kreditchef mottar systemavisering vid högriskärenden; Centralt funktionsansvarig för penningtvätt genomför stickprovskontroller av avslutade ärenden | Kreditchef; Centralt funktionsansvarig för penningtvätt |
| 5 | ⚠️ KYC-dokumentation är otillräcklig för revision | Kärnsystemet kräver obligatoriska fält (kontrolltyp, datum, handläggare, utfall) innan ärendet kan stängas (steg 16) | Kredithandläggare, onboarding-team |
| 6 | ⚠️ Komplex ägarstruktur identifieras inte och passerar som lågriskkund | Systemkontroll på antal ägarnivåer; handläggare är skyldig att dokumentera ägarstruktur med organisationsschema vid mer än en ägarnivå | Kredithandläggare, onboarding-team |
| 7 | ⚠️ Kund aviseras om KYC-kontroll eller eskalering i strid med tippningsförbudet | Handläggare instrueras i tippningsförbudet i onboarding-teamets utbildning; kommunikation med kund vid avslag kontrolleras av Kreditchef eller Centralt funktionsansvarig för penningtvätt vid eskalerade ärenden | Kreditchef; Centralt funktionsansvarig för penningtvätt |

---

## 6. Regelhänvisningar

| Regelverk / policy | Relevans |
|---|---|
| Lag (2017:630) om åtgärder mot penningtvätt och finansiering av terrorism (penningtvättslagen), 1 kap. 5 §, 3 kap. 6–9 §§, 4 kap. 9 § | Definitioner av verklig huvudman; grundläggande och skärpta kundkännedomsåtgärder; tippningsförbud |
| Finansinspektionens föreskrifter om åtgärder mot penningtvätt och finansiering av terrorism (FFFS 2017:11, med ändringar) | Specificerade krav på kundkännedom och riskklassificering för finansiella företag |
| EU:s lista över högrisktredjeländer (delegerade förordningar under direktiv (EU) 2015/849, AML-direktivet) samt FATF:s förteckningar | Identifiering av högriskland |
| Europaparlamentets och rådets direktiv (EU) 2015/849 om åtgärder för att förhindra att det finansiella systemet används för penningtvätt eller finansiering av terrorism (4AMLD), med ändringar genom direktiv (EU) 2018/843 (5AMLD) | Ramverk för skärpta åtgärder, PEP-hantering och verklig huvudman |
| Nordvik Kredit — Intern riskklassificeringsmodell för kundkännedom | Riskklassificering Låg/Medel/Hög; gränsvärden och riskindikatorer |
| Nordvik Kredit — Policy för åtgärder mot penningtvätt och finansiering av terrorism | Övergripande styrande policy; eskaleringsmandat |
| Dataskyddsförordningen (GDPR), förordning (EU) 2016/679 | Behandling av personuppgifter avseende verkliga huvudmän och firmatecknare |

---

## 7. Godkännande & Översyn

| | |
|---|---|
| **Version** | 1.0 |
| **Ikraftträdandedatum** | 2026-08-14 |
| **Dokumentägare** | Kreditchef |
| **Godkännandroll** | Kreditchef |
| **Nästa översyn** | 2027-08-14 |
| **Status** | Utkast — inväntar godkännande |

Dokumentet ska granskas och godkännas av Kreditchef innan det träder i kraft. Det ska sedan vidarebefordras till Compliance-chef (regelefterlevnadschef) för kännedom och registrering i dokumentstyrningssystemet. Nästa obligatoriska översyn sker senast 2027-08-14, eller tidigare om penningtvättslagen, Finansinspektionens föreskrifter eller Nordvik Kredits interna policy förändras på ett sätt som påverkar rutinen.

---

*Dokumentet innehåller inga verkliga kundidentifierande uppgifter eller kontouppgifter. Alla exempel använder platshållare.*
