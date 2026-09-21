# Regler för chatt med ChatGPT

## 1. Syfte och avgränsning

Detta dokument beskriver **hur ChatGPT och användaren ska arbeta tillsammans** med SVG BOX DESIGNER. Det ska ge kontinuitet när en lång konversation ersätts av en ny och ange hur diskussion, analys, implementation, verifiering, acceptans och dokumentation ska hanteras.

Dokumentet är inte:

- produktens roadmap,
- källa för vad som faktiskt är implementerat,
- arkitekturens auktoritet,
- projekthistorik, eller
- changelog.

Repositoryt är auktoritativt för projektets faktiska tillstånd. Reglerna här ska användas tillsammans med central dokumentation och aktuell kod, inte ersätta dem.

## 2. Hierarki för projektets sanningskällor

När ChatGPT behöver fastställa projektets aktuella sanning ska följande ordning användas:

1. **Koden på senast accepterade och mergade `main`** är sanningen om den faktiska implementationen.
2. **Senaste verkliga webbläsarbevis och användarens aktuella uttryckliga krav** visar vad som faktiskt måste fungera och vad användaren nu vill uppnå.
3. **`ROADMAP.md`** beskriver överenskommen framtida produktriktning, funktionsstatus och planerad utveckling.
4. **`PROJECT_MASTER.md`** beskriver aktuell produkt- och arkitekturkontext.
5. **`Architecture.md`** ger aktuell orientering om arkitektur och pipeline, särskilt för Box / Construction.
6. **`PROJECT_HISTORY.md`** beskriver projektets utveckling, viktigt avslutat arbete och historiska arkitekturbeslut.
7. **`CHANGELOG.md`** är en kortfattad förteckning över genomförda ändringar.
8. **`README.md`** ger en aktuell övergripande projektbeskrivning och orientering.
9. **Historiska och diagnostiska dokument i `docs/`** är endast stödjande historiska belägg, om de inte uttryckligen har upphöjts till aktuell auktoritet.

Om dokumentation motsäger accepterad aktuell kod eller ett nyare uttryckligt produktkrav ska ChatGPT påtala konflikten i stället för att gissa tyst. Historiska dokument blir inte automatiskt aktuella produktkrav.

## 3. Normal arbetsgång och beslutspunkt

Den normala samarbetsgången är:

> idé/problem → diskussion → analys → beslut → implementation → testning → merge → webbläsarverifiering → acceptans → dokumentationssynkronisering → nästa Roadmap-punkt

Att användaren beskriver ett problem eller en idé innebär **inte** automatiskt tillstånd att implementera. ChatGPT ska först hjälpa till att förstå:

- önskat beteende,
- aktuell implementation,
- arkitektonisk påverkan,
- samspel med befintlig funktionalitet,
- vad som redan är implementerat, och
- vad som ännu är odefinierat.

Implementation börjar först när användaren beslutar att gå vidare.

Normala svar ska vara kortfattade, tydliga och praktiska. Arbetet bör ske stegvis. Längre svar passar för kompletta Codex-promptar, arkitektursammanfattningar, dokumentutkast och större strukturerade analyser som användaren uttryckligen efterfrågar. ChatGPT ska inte automatiskt hålla med: konflikter med arkitekturen eller onödig duplicering ska förklaras tydligt.

## 4. Regler för Codex-promptar

### 4.1 Skriv inte en prompt automatiskt

ChatGPT ska endast skriva en Codex-prompt när användaren uttryckligen ber om det, till exempel:

- ”ge mig en prompt”,
- ”skriv prompten”, eller
- ”ge mig en Codex-prompt”.

Uttryck som ”fixa det”, ”det fungerar inte”, ”lös detta”, ”vad tycker du?” eller en inklistrad Codex-rapport ska inte automatiskt tolkas som en begäran om ännu en Codex-prompt.

Normal ordning är:

> diskutera → förstå → besluta → användaren ber uttryckligen om en prompt → skriv prompten

### 4.2 Prompten ska vara komplett

När användaren ber om en Codex-prompt ska ChatGPT lämna en **komplett, direkt kopierbar prompt** med alla relevanta krav och bevaranderegler. Lämna inte bara ett tilläggsstycke, ett ersättningsfragment, ”ändra avsnitt X i föregående prompt” eller instruktioner som användaren själv måste slå ihop med tidigare promptar.

### 4.3 Analysuppdrag ska vara strikt skrivskyddade

När uppgiften gäller analys och inte implementation ska prompten uttryckligen förbjuda repositoryändringar. Använd en stark instruktion motsvarande:

```text
OUTPUT ONLY ANALYSIS IN CHAT.
DO NOT CHANGE THE REPOSITORY.
DO NOT CREATE OR MODIFY FILES.
DO NOT CREATE TESTS.
DO NOT IMPLEMENT CODE.
DO NOT CREATE COMMITS.
DO NOT CREATE BRANCHES.
DO NOT CREATE A PR.
```

Analys och implementation ska hållas isär tills användaren uttryckligen väljer implementation.

## 5. Codex- och GitHub-arbetsflöde

Ny utveckling ska normalt börja från senast accepterade och mergade GitHub-`main`:

> accepterad main → ny branch/session → implementation → tester → commit → PR → användargranskning → merge → webbläsarverifiering → acceptans

Innan ChatGPT skapar en ny Codex-prompt för implementation eller dokumentation ska ChatGPT kontrollera den faktiskt accepterade `main`-branchen direkt mot GitHub, fastställa dess exakta aktuella commit-SHA och ange denna SHA i prompten som obligatorisk baseline.

Innan Codex ändrar repositoryt ska Codex kontrollera lokal `HEAD` och jämföra den med den verifierade GitHub-`main`-SHA som anges i prompten. Codex får fortsätta endast om de är identiska. Vid avvikelse ska Codex stoppa före implementation, inte arbeta vidare från checkouten och rapportera faktisk `HEAD`, förväntad SHA, aktuell branch, om en remote finns och om den förväntade commiten finns lokalt.

Codex behöver inte själv verifiera hostad GitHub-`main` när ChatGPT har gjort det omedelbart innan prompten skapades. Saknad Git-remote, saknad lokal `main` eller blockerad GitHub-/nätverksåtkomst är därför inte i sig ett baseline-fel: om lokal `HEAD` är identisk med den exakta verifierade SHA som ChatGPT angav är baselinen verifierad och Codex får fortsätta. Processen förhindrar arbete från inaktuella eller okända snapshots utan att skapa falska varningar när den redan verifierade checkouten är korrekt.

Efter att en PR har mergats är utvecklingsbranchen/sessionen avslutad. Nästa arbete ska normalt börja om från senaste accepterade `main`, inte fortsätta obegränsat på en gammal branch.

ChatGPT ska inspektera det faktiska repositoryt när aktuell implementation spelar roll. Antaganden om filstruktur, funktionalitet, arkitektur, implementationsstatus, tester eller minnen från äldre samtal får inte ersätta sådan kontroll.

Om Codex rapporterar en sådan miljöbegränsning ska ChatGPT nämna den utan att felaktigt underkänna en baseline som verifierats genom identiska SHA-värden.

## 6. Kritisk granskning av Codex-rapporter

När användaren klistrar in ett Codex-resultat ska ChatGPT granska det kritiskt och inte automatiskt svara ”ser bra ut”. Kontrollera:

- uppgiftens omfattning,
- samtliga krav,
- arkitektur,
- bevaranderegler,
- ändrade filer,
- utförda tester,
- om orelaterat arbete har införts,
- om etablerat beteende har tagits bort, och
- om Codex påstår mer än testerna faktiskt bevisar.

Tveksamheter ska förklaras innan ChatGPT rekommenderar merge.

## 7. Automatiska tester och verklig webbläsarverifiering

Enhetstester, integrationstester, build, TypeScript-kontroller, lint, statisk analys och repositoryinspektion är stödjande bevis. De är inte automatiskt slutligt bevis för att en interaktiv funktion fungerar korrekt.

För pekarinteraktion, visuellt beteende, snap/inference, markering, authoring-flöden och liknande interaktiv funktionalitet är **verklig verifiering av användaren i webbläsaren den slutliga acceptansauktoriteten**.

ChatGPT ska alltid skilja mellan:

- **tester godkända**, och
- **verifierat i webbläsaren**.

## 8. Ändringar i arkitekturen

Ett lokalt fel eller en liten funktionsbegäran får inte användas som förevändning för en orelaterad stor refaktorering. Om analysen visar att grundarkitekturen bör ändras ska ChatGPT:

1. förklara varför,
2. identifiera berörda system,
3. diskutera ändringen med användaren,
4. först besluta arkitekturriktning, och
5. därefter skapa implementationsarbete.

Större arkitektur får inte omformas tyst.

### 8.1 Gemensam arkitektur före specialfall

Föredra gemensam arkitektur framför duplicerade eller verktygsspecifika implementationer. Undvik parvisa hack, duplicerad geometrilogik, duplicerad presentationslogik, separata system för samma grundproblem och verktygsspecifika undantag där en gemensam modell passar.

Ett känt exempel är **Distance, Length och Angle**. Dessa ska kunna återanvändas mellan Dimensions och Constraints, inte implementeras oberoende två gånger. Samma princip gäller överallt där funktioner faktiskt delar semantik.

### 8.2 Grundregler för 2D Drawing

Bevara etablerade Drawing-principer, främst:

> **COMPATIBILITY BEFORE PRIORITY**

Flera geometriskt kompatibla relationer får samexistera. Prioritet ska välja mellan verkligt inkompatibla alternativ, inte radera kompatibel semantisk sanning.

Håll följande begrepp åtskilda:

- positionsauktoritet,
- riktningsauktoritet,
- topologiauktoritet,
- semantiska belägg/relationer,
- presentation, och
- persistens.

En Endpoint kan äga slutpositionen samtidigt som andra geometriskt kompatibla semantiska relationer förblir sanna. `Ctrl` förblir den tillfälliga authoring-förbikopplingen för automatiskt snap/inference-beteende. En accepterad placering får inte omtolkas vid commit.

### 8.3 Drawing: semantik och presentation

Semantisk/solver-betydelse och visuell presentation är separata ansvar:

> semantic/solver truth → presentation derivation → shared presentation layer

Transient inference och beständiga Constraints kan återanvända gemensam geometrisk markerings- och layoutlogik men behålla olika visuella tillstånd. Midpoint är en viktig webbläsarverifierad regressionsreferens och får inte förstöras vid ändringar av orelaterad inference- eller presentationsfunktionalitet.

### 8.4 Box / Construction

Bevara den etablerade pipelinen:

> source geometry → Panel Manager → construction semantics → generated geometry → panel composition → metadata reconciliation → FinalGeometry → manufacturing compensation → preview/export

Nya Construction-funktioner ska integreras i denna arkitektur, inte kringgå den. Flera kompatibla construction-operationer får bidra till samma panel. Ett verktyg ska inte ta över hela panelen om dess semantiska ansvar endast omfattar en viss region eller typ av genererad geometri.

## 9. Roadmap-regler

`ROADMAP.md` innehåller ackumulerade produktbeslut. Vid uppdatering ska ChatGPT:

- lägga till ny överenskommen produktriktning omsorgsfullt,
- bevara tidigare etablerat roadmap-innehåll,
- inte lättvindigt radera äldre åtaganden,
- inte förenkla orelaterade avsnitt, och
- inte omtolka etablerade krav utan diskussion.

Om ett äldre Roadmap-beslut verkligen behöver ändras ska ändringen först diskuteras med användaren. Redigering ska normalt vara additiv och fokuserad på det område som för närvarande diskuteras.

## 10. Historiskt material

Äldre dokument och diagnostiskt material är belägg för tidigare arbete, inte automatiskt aktuella krav. Historiska koncept som äldre **C**, **P1**, experimentella connection-modeller, föråldrade inference-förslag eller diagnostisk arkitektur får inte återinföras enbart för att de finns dokumenterade.

Jämför alltid historiskt material med aktuell `main`, aktuell `ROADMAP.md`, aktuell `PROJECT_MASTER.md` och användarens senaste uttryckliga beslut.

## 11. Bilder, skärmbilder, skisser och video

När användaren tillhandahåller en bild, skärmbild, skiss eller video är standardändamålet analys och kommunikation. Skapa eller redigera inte en bild om användaren inte uttryckligen ber om det.

Om ett visuellt exempel definierar framtida Codex-arbete ska beteendet översättas till tydliga textkrav. Anta inte att Codex kan se media som visades för ChatGPT. Prompten ska gå att förstå utan den visuella referensen, om filerna inte uttryckligen är tillgängliga för Codex.

## 12. Referenser till extern programvara

Andra CAD-, laser- eller designprogram kan användas för att visa önskat beteende. Behandla dem som beteendeinspiration och översätt beteendet till SVG BOX DESIGNERs begrepp.

Externa produktnamn ska inte byggas in i produktionsidentifierare, arkitektur, intern terminologi, tester eller implementationskommentarer, såvida en faktisk extern integration inte kräver det. Det önskade beteendet är relevant, inte namnet på den externa produkten.

## 13. Uppfinn inte oavgjorda produktdetaljer

Om användaren ännu inte har bestämt exakt UI, algoritm, parametrar, konfliktregler, markeringsbeteende, joint-katalog, geometriregler eller arbetsflödesdetaljer ska ChatGPT inte tyst uppfinna dem och göra dem till krav.

Markera dem i stället som **ännu inte definierat**, **design krävs** eller **planerat för senare diskussion**. Endast fattade beslut får låsas.

## 14. Startprocedur för en ny chatt

När en ny ChatGPT-konversation startar för projektet ska ChatGPT först läsa central dokumentation från senaste accepterade `main`, i denna ordning:

1. `REGLER_FOR_CHATT_MED_CHATGPT.md`
2. `ROADMAP.md`
3. `PROJECT_MASTER.md`
4. `Architecture.md`
5. `PROJECT_HISTORY.md`
6. `CHANGELOG.md`
7. `README.md`

Därefter ska relevant aktuell kod på `main` inspekteras för den specifika uppgiften. Det ger arbetsregler, framtida riktning, aktuell arkitektur, projekthistorik, historik över slutförda ändringar, allmän orientering och faktisk implementation. Projektets aktuella sanning ska inte rekonstrueras enbart från gamla ChatGPT-konversationer.

## 15. Systematiskt dokumentationsunderhåll

Dokumentation är en del av utvecklingslivscykeln. Efter att funktionellt arbete har accepterats ska **alla sex centrala projektdokument kontrolleras** mot den accepterade produkten:

- `ROADMAP.md`
- `PROJECT_MASTER.md`
- `Architecture.md`
- `PROJECT_HISTORY.md`
- `CHANGELOG.md`
- `README.md`

Kontroll betyder inte att varje fil alltid måste ändras. Endast dokument som har blivit inaktuella ska uppdateras, och endast i den omfattning som det accepterade arbetet påverkar dem.

### 15.1 Dokumentens skilda roller

| Dokument | Roll |
| --- | --- |
| `REGLER_FOR_CHATT_MED_CHATGPT.md` | Regler för samarbete och arbetsflöde |
| `ROADMAP.md` | Överenskommen framtida utveckling och funktionsstatus |
| `PROJECT_MASTER.md` | Aktuell produkt- och arkitektursanning |
| `Architecture.md` | Orientering om arkitektur och pipeline |
| `PROJECT_HISTORY.md` | Meningsfull produktutveckling och viktiga tidigare beslut |
| `CHANGELOG.md` | Kortfattad förteckning över slutförda ändringar |
| `README.md` | Övergripande och aktuell projektorientering |
| `docs/` | Stödjande detaljerat, historiskt och diagnostiskt material |

Dokumenten ska inte duplicera varandra; deras ansvar ska förbli åtskilda.

### 15.2 Underhåll per dokument

- **ROADMAP:** När valt Roadmap-arbete är genomfört och accepterat ska status uppdateras korrekt, exempelvis `PLANNED` → `PARTIALLY IMPLEMENTED`, `PLANNED` → `IMPLEMENTED` eller `PARTIALLY IMPLEMENTED` → `IMPLEMENTED`. Markera aldrig helheten som implementerad om endast en del är klar; återstående planerat arbete ska synas.
- **PROJECT_MASTER:** Ska beskriva aktuell produkt- och arkitektursanning. Uppdatera den när accepterad utveckling ändrar implementerade förmågor, viktigt beteende, arkitektur, auktoritetsregler, modellgränser eller viktiga begränsningar. Den är inte en önskelista; framtida arbete hör främst hemma i Roadmap.
- **Architecture:** Granska när accepterad utveckling påverkar pipeline, ägarskap, auktoritet, komposition, dataflöde eller stora arkitekturgränser. Registrera inte varje liten UI-ändring; dokumentet ska ge arkitekturell orientering.
- **PROJECT_HISTORY:** Registrera meningsfull utveckling när en Roadmap-förmåga blir implementerad eller ett viktigt arkitekturbeslut genomförs. Förklara vad som ändrades samt viktiga beslut och övergångar, utan att duplicera varje commit.
- **CHANGELOG:** Lägg vid behov till kortfattade poster om accepterade, slutförda produkt- och utvecklingsändringar, inte framtidsplaner.
- **README:** Granska efter accepterat arbete och uppdatera när övergripande produktförmågor, användarsynlig funktionsöversikt, projektorganisation, installations-/användningsinstruktioner eller viktig aktuell status påverkas. Lägg inte till onödiga interna implementationsdetaljer.

## 16. När en funktion är färdig

En funktion får inte markeras `IMPLEMENTED` endast för att Codex har skrivit kod, build lyckades, automatiska tester passerade eller en PR finns.

För interaktiv produktfunktionalitet gäller normalt:

> Roadmap-punkt vald → analys/design → implementation → automatisk validering → PR → merge till main → verklig webbläsarverifiering → användaracceptans → dokumentationssynkronisering

Först efter acceptans får dokumentationen beskriva funktionen som fullt implementerad. Om endast en del av avsett beteende är färdigt ska korrekt status, exempelvis `PARTIALLY IMPLEMENTED`, användas.

## 17. Dokumentationssynkronisering som slutsteg

Efter att en funktion har webbläsarverifierats och accepterats ska en fokuserad dokumentationssynkronisering göras. Jämför senaste accepterade `main` med samtliga sex centrala dokument och uppdatera endast de dokument som påverkas.

Den systematiska cykeln är:

> **PLAN → DEVELOP → VERIFY → ACCEPT → DOCUMENT → NEXT ROADMAP ITEM**

Dokumentationen får inte i förväg påstå att en funktion är implementerad. Under aktiv utveckling kan Roadmap fortsätta visa `PLANNED` eller `PARTIALLY IMPLEMENTED`. Synkroniseringen sker efter merge, webbläsarverifiering och acceptans, så att dokumentationen beskriver accepterad verklighet i stället för en avsikt.

Dokumentationssynkronisering kan med fördel göras som en separat, fokuserad dokumentations-PR efter att den funktionella PR:en har mergats, webbläsartestats och accepterats. Den ska inte tvingas in i en funktionell PR om acceptans ännu saknas.
