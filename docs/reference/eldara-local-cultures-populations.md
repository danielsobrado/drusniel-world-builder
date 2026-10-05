# Eldara Local Cultures, Sub-Peoples, Settlements, and Population Model

Status: canonical worldbuilding and simulation reference

Source of truth:
- `maps/Eldara Full 2026-07-23-20-37.json`
- `config/cultures.yaml`

Map seed: `550306385`. Exported: `2026-07-23T16:37:20.939Z`. Population rate: `1000`. Urbanization: `1`.

The current source contains **502 named settlements**, **131 provinces**, **8 active states**, and **14 Azgaar culture records**.

This document is the bridge from continent-scale culture to local lived society. It is designed for direct use by NPC generation, simulation cohorts, settlement rendering, economy, factions, armies, quests, dialogue, migration, and future procedural village generation.

## 1. Non-negotiable identity model

Never flatten ancestry, culture, polity, faith, province, settlement, and faction into one value.

```text
ancestry
  -> canonical culture or cultural seed
    -> state / polity
      -> province
        -> local branch / sub-people
          -> settlement
            -> neighborhood or generated village
              -> household / faction / profession / faith
```

Azgaar culture IDs remain immutable source IDs. The local branches below are authored simulation identities layered on top.

## 2. Population interpretation

- Named-settlement population = `burg.population * populationRate * urbanization`.
- Rural population = `cell.pop * populationRate`.
- The current map does not contain a separate named village record for every rural settlement. Do not invent source-backed names.
- Generated villages must use deterministic IDs and exactly conserve each source cell's rural population.

### Simulation settlement classes

| Class | Population | Use |
|---|---:|---|
| named-village | <1,000 | local center with a few dominant households/factions |
| small-town | 1,000–2,999 | basic market and specialist crafts |
| town | 3,000–7,999 | multiple occupations and external trade |
| large-town | 8,000–14,999 | regional services and visible faction competition |
| city | 15,000–24,999 | several districts and professional institutions |
| major-city | >=25,000 | regional strategic/economic center |
| capital | source capital | political capital regardless of population |

## 3. Source-culture population baseline

| ID | Source culture | Canonical/seed | Rural | Named settlements | Total | Named burgs |
|---:|---|---|---:|---:|---:|---:|
| 0 | Wildlands | wildlands | 2,330 | 0 | 2,330 | 0 |
| 1 | Eldoria | elenori | 2,855,312 | 402,179 | 3,257,491 | 66 |
| 2 | Mercian | serpent-peoples | 90,138 | 5,405 | 95,543 | 3 |
| 3 | Kentland | lumish | 3,964,010 | 801,484 | 4,765,494 | 92 |
| 4 | Yotunn | jotunn | 527,419 | 123,971 | 651,390 | 22 |
| 5 | Enlandic | draconic-remnant | 5,959 | 0 | 5,959 | 0 |
| 6 | Valarans | zuraldarr | 77,867 | 2,062 | 79,929 | 1 |
| 7 | Norheim | norths | 1,779,397 | 392,110 | 2,171,507 | 42 |
| 8 | Darkhold | umbra-kori | 2,111,675 | 502,007 | 2,613,682 | 64 |
| 9 | Uruk | orc-peoples | 2,398,883 | 443,349 | 2,842,232 | 71 |
| 10 | Durinheim | vondari | 494,991 | 140,893 | 635,884 | 17 |
| 11 | Schwarzlicht | contian | 2,850,396 | 453,350 | 3,303,746 | 73 |
| 12 | Rakhnid | rakhnid-broods | 331,717 | 53,252 | 384,969 | 8 |
| 13 | Darkspire | goblin-peoples | 1,262,894 | 272,672 | 1,535,566 | 43 |

## 4. State demographic baseline

| State | Rural | Named-settlement | Total | Represented peoples |
|---|---:|---:|---:|---|
| Contia | 2,888,096 | 448,545 | 3,336,641 | Schwarzlicht 98%; Eldoria 1.8% |
| Wyrmreach | 2,202,654 | 416,973 | 2,619,627 | Uruk 66%; Yotunn 14%; Darkspire 11%; Rakhnid 4.1%; Mercian 3.6%; Norheim 1.1% |
| Umbra'kor | 2,041,069 | 490,452 | 2,531,521 | Darkhold 99%; Eldoria 1.1% |
| Lumeshire | 4,318,725 | 879,039 | 5,197,764 | Kentland 91%; Uruk 3.8%; Darkspire 1.9%; Valarans 1.5%; Norheim 1.1%; Durinheim 0.1% |
| Elenoria | 2,830,123 | 398,541 | 3,228,664 | Eldoria 98%; Darkspire 1.5%; Uruk 0.4% |
| Ironpeak | 665,566 | 171,156 | 836,722 | Durinheim 75%; Uruk 23%; Darkhold 2.1% |
| Grukmar | 1,896,547 | 343,554 | 2,240,101 | Darkspire 49%; Uruk 31%; Rakhnid 12%; Darkhold 4.1%; Yotunn 2.6%; Schwarzlicht 0.1% |
| Frostgard | 1,910,206 | 444,474 | 2,354,680 | Norheim 89%; Yotunn 9.9%; Schwarzlicht 0.9%; Kentland 0.6% |

## 5. Local branches and sub-peoples

These are not new species and are not automatically political factions. They are local cultural identities used to make settlements and people differ while remaining part of a broader culture.

### lumish

#### Imperial Heartlanders (`imperial-heartlanders`)

**Where:** Capital and senior administrative centers.

**What shapes them:** church, bureaucracy, guild rank, civic ritual, public works.

**How they differ:** more institution-minded and class-conscious than provincial Lumish.

#### Tideward Lumish (`tideward-lumish`)

**Where:** ports and naval towns.

**What shapes them:** merchant houses, sailors, customs, dock guilds, foreign quarters.

**How they differ:** more cosmopolitan and tariff-focused.

#### Waterside Lumish (`waterside-lumish`)

**Where:** river and lake towns.

**What shapes them:** mills, ferries, bridge tolls, gardens, water rights.

**How they differ:** more locally cooperative and economically water-dependent.

#### Pyreaz Marchers (`pyreaz-marchers`)

**Where:** mixed border districts.

**What shapes them:** militia, interpreters, smuggling, intermarriage, negotiated law.

**How they differ:** less species-essentialist but more likely to hold specific inter-town grudges.

#### Fortified Provincial Lumish (`fortified-provincials`)

**Where:** walled or citadel towns.

**What shapes them:** old charters, town watches, local noble houses, defensive memory.

**How they differ:** more protective of local privileges.

#### Shire Lumish (`shire-lumish`)

**Where:** ordinary inland settlements.

**What shapes them:** parish, market day, guild craft, family land, fairs.

**How they differ:** more local and practical than capital ideology.

### zuraldarr

#### Lexabusur Town Zuraldarr (`lexabusur-town`)

**Where:** the only named Zuraldarr burg in the current map.

**What shapes them:** caravan mediation, Imperial procedure, valley trade.

**How they differ:** more urban and politically divided over integration.

#### Valley Households (`valley-households`)

**Where:** agricultural valleys.

**What shapes them:** land, water, grazing, kin councils, ancestor places.

**How they differ:** strong local autonomy.

#### Pass Wardens (`pass-wardens`)

**Where:** high passes.

**What shapes them:** guides, rescue duty, watch posts, avalanche knowledge.

**How they differ:** more militarized and outward-facing.

#### Caravan Zuraldarr (`caravan-zuraldarr`)

**Where:** major routes.

**What shapes them:** pack animals, inns, arbitration, multilingual trade.

**How they differ:** more flexible on ritual and jurisdiction.

#### Upland Keepers (`upland-keepers`)

**Where:** remote highland cells.

**What shapes them:** pastoral mobility, sacred landscape, household autonomy.

**How they differ:** least accepting of centralization.

### contian

#### Pewald Administrative Contians (`pewald-administrators`)

**Where:** capital and senior institutions.

**What shapes them:** registries, courts, academies, inspectors, archives.

**How they differ:** strongest faith in central systems.

#### Academy Contians (`academy-contians`)

**Where:** large scholarly towns.

**What shapes them:** teachers, laboratories, instruments, medicine, licensed magic.

**How they differ:** more reform-minded but still credential-focused.

#### River and Port Registry Contians (`river-registry-contians`)

**Where:** ports, river towns, trade centers.

**What shapes them:** customs, shipping records, quarantine, warehouses, finance.

**How they differ:** pragmatic with outsiders but document-heavy.

#### Fortress Contians (`fortress-contians`)

**Where:** walled/citadel towns.

**What shapes them:** engineers, quartermasters, wards, military families.

**How they differ:** more security-minded.

#### Provincial Contians (`provincial-contians`)

**Where:** smaller inland settlements.

**What shapes them:** local temples, storage, craft licenses, irrigation.

**How they differ:** judge institutions by practical results.

#### Contian Diaspora (`diaspora-contians`)

**Where:** Contian-source settlements outside Contia.

**What shapes them:** merchant, scholarly, religious and administrative enclaves.

**How they differ:** less automatically loyal to Contia.

### norths

#### Crown Hall Norths (`frostgard-crown`)

**Where:** capital and senior political centers.

**What shapes them:** redistribution, elite halls, diplomats, warbands.

**How they differ:** more hierarchical and trade-dependent.

#### Sea-Road Norths (`sea-road-norths`)

**Where:** ports.

**What shapes them:** crews, fishers, shipwrights, merchants, navigators.

**How they differ:** more cosmopolitan and contract-aware.

#### Inland Hall Norths (`inland-hall-norths`)

**Where:** inland towns.

**What shapes them:** livestock, grain, smithing, hall justice, winter stores.

**How they differ:** stronger household reputation politics.

#### Giant-Border Norths (`giant-border-norths`)

**Where:** Jotunn-heavy provinces.

**What shapes them:** treaties, interpreters, mixed patrols, fortified stores.

**How they differ:** distinguish giant communities by treaty history.

#### Southern-Facing Norths (`southern-facing-norths`)

**Where:** diaspora and southern-border settlements.

**What shapes them:** trade, mercenary service, mixed marriage, written contracts.

**How they differ:** more bilingual and legally hybrid.

### vondari

#### Crown-Forge Vondari (`crown-forge-vondari`)

**Where:** capital.

**What shapes them:** royal works, master houses, state contracts, guild arbitration.

**How they differ:** most invested in established methods.

#### Deep-Hall Vondari (`deep-hall-vondari`)

**Where:** large inland/mountain settlements.

**What shapes them:** mining, ventilation, drainage, stonework, forging, apprenticeship.

**How they differ:** strongest guild identity.

#### Surface-Gate Vondari (`surface-gate-vondari`)

**Where:** ports and surface trade gates.

**What shapes them:** warehousing, customs, caravan engineering, foreign contracts.

**How they differ:** more flexible about certifying outsiders.

#### Survey Vondari (`survey-vondari`)

**Where:** small extraction/frontier settlements.

**What shapes them:** prospecting, camp law, temporary works, risk assessment.

**How they differ:** more improvisational.

#### Ironpeak Border Vondari (`ironpeak-border-vondari`)

**Where:** mixed frontier districts.

**What shapes them:** security engineering, mixed crews, tunnel diplomacy, resource claims.

**How they differ:** status based more on dependable conduct than ancestry.

### elenori

#### Royal-Grove Elenori (`royal-grove-elenori`)

**Where:** capital and senior memory institutions.

**What shapes them:** court custodians, archives, diplomacy, urban gardens.

**How they differ:** most invested in curated continuity.

#### Tidegrove Elenori (`tidegrove-elenori`)

**Where:** ports.

**What shapes them:** fishers, boat builders, coastal wardens, foreign traders.

**How they differ:** more open and fast-changing.

#### Lake Elenori (`lake-elenori`)

**Where:** lake settlements.

**What shapes them:** water stewardship, fisheries, reed crafts, wetland medicine.

**How they differ:** local ecology outranks distant bureaucracy.

#### Ranger-Border Elenori (`ranger-border-elenori`)

**Where:** frontier or mixed provinces.

**What shapes them:** rangers, scouts, hidden roads, controlled clearings.

**How they differ:** less patient with secrecy when field evidence conflicts.

#### Archive-Grove Elenori (`archive-grove-elenori`)

**Where:** inland settled regions.

**What shapes them:** craft lineages, woodland management, ritual calendars.

**How they differ:** continuity with generational reform tension.

#### Deep-Envoy Elenori (`deep-envoy-elenori`)

**Where:** Elenori communities inside Umbra'kor.

**What shapes them:** diplomats, translators, healers, old treaty families.

**How they differ:** more familiar with underground politics.

### umbra-kori

#### Metasadhell Civic Umbra'kori (`metasadhell-civic`)

**Where:** capital.

**What shapes them:** great houses, temples, tribute administration, intelligence.

**How they differ:** most committed to official doctrine.

#### Gate and Port Umbra'kori (`gate-port-umbra`)

**Where:** ports, river routes, major transit hubs.

**What shapes them:** gate guards, boat crews, tunnel markets, tolls, foreign merchants.

**How they differ:** more pragmatic with outsiders.

#### Deep-House Umbra'kori (`deep-house-umbra`)

**Where:** ordinary core settlements.

**What shapes them:** house compounds, fungi agriculture, crafts, temple duty.

**How they differ:** stronger house loyalty.

#### Warden Umbra'kori (`warden-umbra`)

**Where:** fortified or remote settlements.

**What shapes them:** depth wardens, engineers, seal keepers, scouts.

**How they differ:** security duty can outrank house privilege.

#### Surface-Enclave Umbra'kori (`surface-enclave-umbra`)

**Where:** Ironpeak or Grukmar enclaves.

**What shapes them:** trade agents, miners, translators, exiles, mixed households.

**How they differ:** less attached to central doctrine.

### orc-peoples

#### Wyrmreach Orcs (`wyrmreach-orcs`)

**Where:** Wyrmreach.

**What shapes them:** long-settled clan/town histories, Dominion politics, coastal and inland trade.

**How they differ:** town and clan identity usually matters more than pan-Orc identity.

#### Grukmar Orc Clans and Towns (`grukmar-orcs`)

**Where:** Grukmar.

**What shapes them:** clan obligations, town markets, temporary confederacies, shifting alliances.

**How they differ:** highly local political identity.

#### Lumish March Orcs (`lumish-march-orcs`)

**Where:** Lumeshire.

**What shapes them:** Imperial subjects, soldiers, tenants, traders, converts, treaty communities.

**How they differ:** bilingual and legally sophisticated.

#### Ironpeak Contract Orcs (`ironpeak-contract-orcs`)

**Where:** Ironpeak.

**What shapes them:** mining, caravan guard work, industrial labor, military contracts.

**How they differ:** strong contract-reputation norms.

### goblin-peoples

#### Grukmar Goblin Town Networks (`grukmar-goblins`)

**Where:** Grukmar.

**What shapes them:** markets, caravan families, salvage trades, information networks.

**How they differ:** strong town identity and portable patron networks.

#### Wyrmreach Goblins (`wyrmreach-goblins`)

**Where:** Wyrmreach.

**What shapes them:** ports, frontier crafts, caravan routes, Dominion demands.

**How they differ:** more territorially rooted than outsider stereotypes.

#### Lumish Border Goblins (`lumish-border-goblins`)

**Where:** Lumeshire.

**What shapes them:** legal minorities, traders, craftsmen, labor contractors, militia auxiliaries.

**How they differ:** switch comfortably among guild, household and Imperial law.

### jotunn

#### Frostgard Treaty Jotunn (`frostgard-treaty-jotunn`)

**Where:** Frostgard.

**What shapes them:** treaty communities, tribute, trade, feud, military cooperation.

**How they differ:** treaty history matters more than ancestry.

#### Wyrmreach Jotunn (`wyrmreach-jotunn`)

**Where:** Wyrmreach.

**What shapes them:** distinct coastal/inland giant communities shaped by Wyrmreach history.

**How they differ:** must not reuse Frostgard customs by default.

#### Grukmar Jotunn Holds (`grukmar-jotunn`)

**Where:** Grukmar.

**What shapes them:** small holds bargaining with clans, towns and caravans.

**How they differ:** settlement-specific relations range from predation to guardianship.

### rakhnid-broods

#### Grukmar Rakhnid Broods (`grukmar-rakhnid`)

**Where:** Grukmar.

**What shapes them:** broods embedded in multi-people trade and territorial politics.

**How they differ:** brood diplomacy and specialization vary sharply.

#### Wyrmreach Rakhnid Broods (`wyrmreach-rakhnid`)

**Where:** Wyrmreach.

**What shapes them:** broods shaped by different ecology and Dominion politics.

**How they differ:** no assumed common religion or allegiance with Grukmar broods.

### serpent-peoples

#### Wyrmreach Serpent Enclaves (`wyrmreach-serpent-enclaves`)

**Where:** Wyrmreach.

**What shapes them:** small locally rooted Mercian-source communities.

**How they differ:** origins, faith and deeper Wyrmreach links remain partly unresolved.

### draconic-remnant

#### Wyrmreach Draconic Remnant (`wyrmreach-draconic-remnant`)

**Where:** rural Wyrmreach cells.

**What shapes them:** tiny dispersed or hidden lineages associated with old dragon-war geography.

**How they differ:** do not turn this into a large visible civilization at launch.

## 6. State-by-people population branches

This table is the launch population basis for regional sub-peoples. It includes rural cells and named settlements.

| State | Source people | Canonical/seed | Rural | Named settlements | Combined |
|---|---|---|---:|---:|---:|
| Contia | Eldoria | elenori | 61,073 | 0 | 61,073 |
| Contia | Schwarzlicht | contian | 2,827,023 | 448,545 | 3,275,568 |
| Wyrmreach | Mercian | serpent-peoples | 88,267 | 5,405 | 93,672 |
| Wyrmreach | Yotunn | jotunn | 298,246 | 61,820 | 360,066 |
| Wyrmreach | Enlandic | draconic-remnant | 5,959 | 0 | 5,959 |
| Wyrmreach | Norheim | norths | 28,754 | 0 | 28,754 |
| Wyrmreach | Uruk | orc-peoples | 1,469,063 | 268,834 | 1,737,897 |
| Wyrmreach | Schwarzlicht | contian | 2,408 | 719 | 3,127 |
| Wyrmreach | Rakhnid | rakhnid-broods | 84,671 | 22,405 | 107,076 |
| Wyrmreach | Darkspire | goblin-peoples | 225,286 | 57,790 | 283,076 |
| Umbra'kor | Eldoria | elenori | 24,088 | 3,638 | 27,726 |
| Umbra'kor | Darkhold | umbra-kori | 2,016,981 | 486,814 | 2,503,795 |
| Lumeshire | Wildlands | wildlands | 2,330 | 0 | 2,330 |
| Lumeshire | Kentland | lumish | 3,949,675 | 801,484 | 4,751,159 |
| Lumeshire | Valarans | zuraldarr | 77,867 | 2,062 | 79,929 |
| Lumeshire | Norheim | norths | 56,010 | 2,413 | 58,423 |
| Lumeshire | Uruk | orc-peoples | 151,344 | 47,013 | 198,357 |
| Lumeshire | Durinheim | vondari | 7,268 | 0 | 7,268 |
| Lumeshire | Darkspire | goblin-peoples | 74,231 | 26,067 | 100,298 |
| Elenoria | Eldoria | elenori | 2,770,152 | 398,541 | 3,168,693 |
| Elenoria | Uruk | orc-peoples | 12,066 | 0 | 12,066 |
| Elenoria | Darkspire | goblin-peoples | 47,906 | 0 | 47,906 |
| Ironpeak | Darkhold | umbra-kori | 11,365 | 6,359 | 17,724 |
| Ironpeak | Uruk | orc-peoples | 166,479 | 23,904 | 190,383 |
| Ironpeak | Durinheim | vondari | 487,722 | 140,893 | 628,615 |
| Grukmar | Mercian | serpent-peoples | 1,871 | 0 | 1,871 |
| Grukmar | Yotunn | jotunn | 45,773 | 11,460 | 57,233 |
| Grukmar | Darkhold | umbra-kori | 83,328 | 8,834 | 92,162 |
| Grukmar | Uruk | orc-peoples | 599,929 | 103,598 | 703,527 |
| Grukmar | Schwarzlicht | contian | 3,128 | 0 | 3,128 |
| Grukmar | Rakhnid | rakhnid-broods | 247,046 | 30,847 | 277,893 |
| Grukmar | Darkspire | goblin-peoples | 915,472 | 188,815 | 1,104,287 |
| Frostgard | Kentland | lumish | 14,336 | 0 | 14,336 |
| Frostgard | Yotunn | jotunn | 183,400 | 50,691 | 234,091 |
| Frostgard | Norheim | norths | 1,694,633 | 389,697 | 2,084,330 |
| Frostgard | Schwarzlicht | contian | 17,838 | 4,086 | 21,924 |

## 7. Province population and cultural context

Province is the default scale for accent, minor clothing motifs, local law, saints/spirits, militia reputation, market rivalry, and everyday prejudice.

| Province ID | State | Province | Rural | Named settlements | Total | Burgs | Dominant people | Share | Other represented peoples | Main biome |
|---:|---|---|---:|---:|---:|---:|---|---:|---|---|
| 17 | Contia | Bartoncia | 148,887 | 21,781 | 170,668 | 4 | Schwarzlicht | 100% | — | Temperate rainforest |
| 116 | Contia | Blandbury | 662,653 | 98,459 | 761,112 | 18 | Schwarzlicht | 100% | — | Temperate rainforest |
| 1 | Contia | Conta | 61,073 | 0 | 61,073 | 0 | Eldoria | 100% | — | Temperate rainforest |
| 118 | Contia | Modmanchia | 468,767 | 134,995 | 603,762 | 14 | Schwarzlicht | 100% | — | Temperate rainforest |
| 117 | Contia | Shifractham | 750,370 | 71,234 | 821,604 | 15 | Schwarzlicht | 100% | — | Temperate rainforest |
| 120 | Contia | Watford | 11,294 | 1,823 | 13,117 | 1 | Schwarzlicht | 100% | — | Temperate rainforest |
| 119 | Contia | Watonley | 785,052 | 120,253 | 905,305 | 19 | Schwarzlicht | 100% | — | Temperate rainforest |
| 62 | Elenoria | Akzigzig | 1,975 | 0 | 1,975 | 0 | Eldoria | 100% | — | Taiga |
| 106 | Elenoria | Benia | 38,832 | 0 | 38,832 | 0 | Darkspire | 40% | Uruk 12,066; Eldoria 11,303 | Taiga |
| 64 | Elenoria | Bretland | 2,252 | 706 | 2,958 | 1 | Eldoria | 100% | — | Wetland |
| 65 | Elenoria | Chawburia | 7,206 | 0 | 7,206 | 0 | Eldoria | 100% | — | Taiga |
| 26 | Elenoria | Citria | 8,758 | 707 | 9,465 | 1 | Eldoria | 100% | — | Wetland |
| 100 | Elenoria | Cort | 263,924 | 49,046 | 312,970 | 7 | Eldoria | 100% | — | Temperate rainforest |
| 122 | Elenoria | Courquilia | 43,627 | 21,802 | 65,429 | 3 | Eldoria | 100% | — | Temperate rainforest |
| 10 | Elenoria | Gan'jes | 22,969 | 0 | 22,969 | 0 | Darkspire | 100% | — | Wetland |
| 42 | Elenoria | Gilukkzar | 145,876 | 14,467 | 160,343 | 5 | Eldoria | 100% | — | Taiga |
| 20 | Elenoria | Ischia | 18,978 | 1,588 | 20,566 | 1 | Eldoria | 100% | — | Temperate rainforest |
| 2 | Elenoria | Jarlingen | 251,143 | 49,723 | 300,866 | 4 | Eldoria | 100% | — | Temperate rainforest |
| 23 | Elenoria | Khatharbh | 67,928 | 2,789 | 70,717 | 1 | Eldoria | 100% | — | Taiga |
| 41 | Elenoria | Mazaglia | 20,391 | 14,629 | 35,020 | 1 | Eldoria | 100% | — | Wetland |
| 24 | Elenoria | Nazar | 93,881 | 2,933 | 96,814 | 2 | Eldoria | 90% | Darkspire 9,473 | Taiga |
| 126 | Elenoria | Pareanoville | 304,199 | 36,897 | 341,096 | 5 | Eldoria | 100% | — | Temperate rainforest |
| 39 | Elenoria | Santenia | 404,849 | 49,279 | 454,128 | 9 | Eldoria | 100% | — | Temperate rainforest |
| 22 | Elenoria | Senvil | 550,325 | 84,370 | 634,695 | 14 | Eldoria | 100% | — | Taiga |
| 27 | Elenoria | Thornteria | 0 | 0 | 0 | 0 | Eldoria | 0% | — | Tundra |
| 21 | Elenoria | Vilter | 583,010 | 69,605 | 652,615 | 11 | Eldoria | 100% | — | Temperate deciduous forest |
| 32 | Frostgard | Anland | 216,152 | 53,166 | 269,318 | 6 | Norheim | 100% | — | Temperate rainforest |
| 30 | Frostgard | Atfordbia | 477,846 | 60,398 | 538,244 | 8 | Norheim | 100% | — | Temperate rainforest |
| 31 | Frostgard | Dinez | 55,075 | 32,011 | 87,086 | 4 | Norheim | 100% | — | Temperate rainforest |
| 72 | Frostgard | Hatbury | 342,164 | 40,194 | 382,358 | 6 | Norheim | 100% | Kentland 1,126 | Temperate deciduous forest |
| 35 | Frostgard | New Noria | 18,748 | 1,946 | 20,694 | 1 | Norheim | 100% | — | Temperate rainforest |
| 4 | Frostgard | Noria | 123,172 | 22,741 | 145,913 | 3 | Yotunn | 90% | Norheim 15,132 | Temperate rainforest |
| 115 | Frostgard | Shatharake | 217,131 | 73,760 | 290,891 | 6 | Norheim | 100% | — | Temperate rainforest |
| 16 | Frostgard | Solehambe | 17,838 | 4,086 | 21,924 | 1 | Schwarzlicht | 100% | — | Temperate rainforest |
| 33 | Frostgard | Whitlere | 368,619 | 124,661 | 493,280 | 9 | Norheim | 97% | Kentland 13,210 | Temperate rainforest |
| 29 | Frostgard | Winchia | 71,799 | 31,511 | 103,310 | 4 | Yotunn | 100% | — | Temperate rainforest |
| 28 | Frostgard | Zugkez | 1,663 | 0 | 1,663 | 0 | Norheim | 100% | — | Wetland |
| 130 | Grukmar | Arukth | 1,621 | 0 | 1,621 | 0 | Uruk | 100% | — | Taiga |
| 128 | Grukmar | Benia | 259,072 | 50,406 | 309,478 | 6 | Darkspire | 70% | Rakhnid 94,117 | Taiga |
| 90 | Grukmar | Bolesolia | 4,027 | 0 | 4,027 | 0 | Darkspire | 100% | — | Wetland |
| 80 | Grukmar | Cockingham | 190,653 | 33,479 | 224,132 | 8 | Darkhold | 37% | Rakhnid 72,337; Uruk 58,521; Yotunn 11,252 | Taiga |
| 105 | Grukmar | Dunscombe | 80,870 | 9,962 | 90,832 | 3 | Uruk | 67% | Rakhnid 29,630 | Taiga |
| 14 | Grukmar | Fercilter | 10,578 | 3,555 | 14,133 | 1 | Darkspire | 100% | — | Temperate deciduous forest |
| 61 | Grukmar | Khunul | 26,988 | 1,846 | 28,834 | 1 | Darkspire | 100% | — | Taiga |
| 15 | Grukmar | Khuzanzar | 17,592 | 5,094 | 22,686 | 1 | Darkspire | 70% | Rakhnid 6,693 | Taiga |
| 88 | Grukmar | Marsh | 2,702 | 0 | 2,702 | 0 | Rakhnid | 100% | — | Taiga |
| 114 | Grukmar | Nakinbhur | 6,000 | 1,106 | 7,106 | 1 | Darkspire | 100% | — | Wetland |
| 25 | Grukmar | Narakzir | 15,472 | 0 | 15,472 | 0 | Darkspire | 100% | — | Taiga |
| 107 | Grukmar | Narukthar | 306,867 | 42,913 | 349,780 | 8 | Uruk | 93% | Rakhnid 24,471 | Taiga |
| 127 | Grukmar | Nazar | 16,265 | 6,803 | 23,068 | 1 | Darkspire | 71% | Uruk 3,813; Rakhnid 2,884 | Taiga |
| 129 | Grukmar | Nazar | 195,127 | 50,197 | 245,324 | 6 | Darkspire | 88% | Rakhnid 28,541; Uruk 1,777 | Taiga |
| 110 | Grukmar | New Darania | 21,139 | 8,696 | 29,835 | 2 | Uruk | 100% | — | Wetland |
| 113 | Grukmar | New Fercilter | 2,971 | 0 | 2,971 | 0 | Uruk | 100% | — | Wetland |
| 108 | Grukmar | Shundu | 286,117 | 36,393 | 322,510 | 9 | Darkspire | 99% | Schwarzlicht 3,128 | Taiga |
| 82 | Grukmar | Southesho | 104,704 | 17,412 | 122,116 | 6 | Darkspire | 51% | Yotunn 45,981; Rakhnid 13,946 | Taiga |
| 79 | Grukmar | Towbomer | 165,451 | 39,299 | 204,750 | 3 | Uruk | 94% | Darkspire 11,418 | Temperate deciduous forest |
| 109 | Grukmar | Ulnulbizi | 142,852 | 36,393 | 179,245 | 6 | Darkspire | 99% | Rakhnid 2,572 | Taiga |
| 89 | Grukmar | Walces | 7,604 | 0 | 7,604 | 0 | Darkhold | 100% | — | Wetland |
| 81 | Grukmar | Whitlere | 21,230 | 0 | 21,230 | 0 | Uruk | 79% | Darkhold 2,536; Mercian 1,871 | Taiga |
| 112 | Grukmar | Yeowia | 8,323 | 0 | 8,323 | 0 | Uruk | 100% | — | Wetland |
| 111 | Grukmar | Ziluk | 2,321 | 0 | 2,321 | 0 | Darkspire | 100% | — | Wetland |
| 103 | Ironpeak | Arukth | 41,857 | 0 | 41,857 | 0 | Uruk | 100% | — | Taiga |
| 84 | Ironpeak | Bardenden | 4,109 | 0 | 4,109 | 0 | Durinheim | 100% | — | Taiga |
| 78 | Ironpeak | Dunsfield | 102,699 | 21,410 | 124,109 | 3 | Durinheim | 83% | Uruk 20,909 | Taiga |
| 121 | Ironpeak | Emasingsbu | 200,727 | 62,450 | 263,177 | 8 | Durinheim | 100% | — | Temperate rainforest |
| 104 | Ironpeak | Garam | 24,242 | 3,602 | 27,844 | 1 | Uruk | 100% | — | Taiga |
| 102 | Ironpeak | Kehamney | 63,027 | 10,242 | 73,269 | 2 | Uruk | 91% | Durinheim 6,489 | Taiga |
| 123 | Ironpeak | New Tetford | 109,933 | 46,584 | 156,517 | 5 | Durinheim | 100% | — | Temperate rainforest |
| 12 | Ironpeak | Rothton | 11,365 | 6,359 | 17,724 | 1 | Darkhold | 100% | — | Temperate rainforest |
| 101 | Ironpeak | Treillons | 109,254 | 20,509 | 129,763 | 3 | Durinheim | 75% | Uruk 32,992 | Taiga |
| 83 | Lumeshire | Cockia | 1,240 | 0 | 1,240 | 0 | Kentland | 100% | — | Taiga |
| 77 | Lumeshire | Dodbridbia | 252,840 | 50,679 | 303,519 | 8 | Kentland | 100% | — | Temperate rainforest |
| 73 | Lumeshire | Dunwich | 956,055 | 155,556 | 1,111,611 | 20 | Kentland | 100% | — | Temperate deciduous forest |
| 8 | Lumeshire | Felingham | 148,673 | 19,476 | 168,149 | 4 | Kentland | 100% | — | Temperate rainforest |
| 131 | Lumeshire | Hatbury | 625,685 | 63,466 | 689,151 | 12 | Kentland | 84% | Norheim 58,423; Uruk 41,389; Valarans 9,176 | Temperate deciduous forest |
| 87 | Lumeshire | Horsburia | 2,330 | 0 | 2,330 | 0 | Wildlands | 100% | — | Wetland |
| 74 | Lumeshire | Kirlingdon | 614,695 | 186,568 | 801,263 | 16 | Kentland | 100% | — | Temperate deciduous forest |
| 7 | Lumeshire | Lurymock | 282,268 | 71,371 | 353,639 | 5 | Kentland | 100% | — | Temperate rainforest |
| 9 | Lumeshire | Manch | 410,263 | 87,735 | 497,998 | 9 | Kentland | 100% | — | Temperate deciduous forest |
| 76 | Lumeshire | Mitham | 252,714 | 35,095 | 287,809 | 7 | Kentland | 100% | — | Temperate deciduous forest |
| 34 | Lumeshire | Persbury | 52,383 | 0 | 52,383 | 0 | Valarans | 88% | Kentland 6,402 | Wetland |
| 75 | Lumeshire | Pyreaz | 206,610 | 72,072 | 278,682 | 7 | Uruk | 56% | Darkspire 100,298; Valarans 18,930; Durinheim 2,486 | Temperate deciduous forest |
| 85 | Lumeshire | Salbor | 10,071 | 0 | 10,071 | 0 | Kentland | 100% | — | Taiga |
| 71 | Lumeshire | Stothersia | 490,790 | 137,021 | 627,811 | 13 | Kentland | 100% | — | Temperate deciduous forest |
| 124 | Lumeshire | Westclesia | 8,978 | 0 | 8,978 | 0 | Valarans | 65% | Durinheim 3,135 | Taiga |
| 125 | Lumeshire | Westclesia | 0 | 0 | 0 | 0 | Valarans | 0% | — | Glacier |
| 86 | Lumeshire | Witburland | 1,483 | 0 | 1,483 | 0 | Kentland | 100% | — | Taiga |
| 37 | Umbra'kor | Albrid | 49,119 | 6,194 | 55,313 | 3 | Darkhold | 100% | — | Temperate rainforest |
| 48 | Umbra'kor | Bucking | 48,641 | 8,961 | 57,602 | 2 | Darkhold | 100% | — | Wetland |
| 98 | Umbra'kor | Burmouth | 2,694 | 0 | 2,694 | 0 | Darkhold | 100% | — | Wetland |
| 19 | Umbra'kor | Craftfordia | 15,072 | 0 | 15,072 | 0 | Darkhold | 100% | — | Temperate rainforest |
| 5 | Umbra'kor | Felonia | 24,088 | 3,638 | 27,726 | 1 | Eldoria | 100% | — | Temperate rainforest |
| 51 | Umbra'kor | Hathambia | 3,412 | 0 | 3,412 | 0 | Darkhold | 100% | — | Wetland |
| 99 | Umbra'kor | Hertheria | 36,367 | 24,068 | 60,435 | 2 | Darkhold | 100% | — | Wetland |
| 13 | Umbra'kor | Leigh | 45,742 | 22,160 | 67,902 | 2 | Darkhold | 100% | — | Wetland |
| 52 | Umbra'kor | Manch | 17,485 | 0 | 17,485 | 0 | Darkhold | 100% | — | Wetland |
| 38 | Umbra'kor | New Ania | 52,049 | 17,450 | 69,499 | 2 | Darkhold | 100% | — | Wetland |
| 36 | Umbra'kor | New Felonia | 302,178 | 56,834 | 359,012 | 9 | Darkhold | 100% | — | Temperate rainforest |
| 18 | Umbra'kor | New Jarlingen | 739,336 | 132,650 | 871,986 | 18 | Darkhold | 100% | — | Temperate rainforest |
| 97 | Umbra'kor | Newleighia | 8,093 | 0 | 8,093 | 0 | Darkhold | 100% | — | Temperate rainforest |
| 46 | Umbra'kor | Ormswestia | 72,436 | 7,216 | 79,652 | 3 | Darkhold | 100% | — | Wetland |
| 50 | Umbra'kor | Pildonia | 5,413 | 2,716 | 8,129 | 1 | Darkhold | 100% | — | Wetland |
| 49 | Umbra'kor | Presinbia | 20,466 | 10,694 | 31,160 | 1 | Darkhold | 100% | — | Temperate rainforest |
| 55 | Umbra'kor | Tigan | 59,932 | 10,234 | 70,166 | 1 | Darkhold | 100% | — | Temperate rainforest |
| 47 | Umbra'kor | Wabinglia | 1,212 | 0 | 1,212 | 0 | Darkhold | 100% | — | Wetland |
| 96 | Umbra'kor | Wareria | 436,466 | 152,953 | 589,419 | 13 | Darkhold | 100% | — | Wetland |
| 53 | Umbra'kor | Watford | 100,868 | 34,684 | 135,552 | 4 | Darkhold | 100% | — | Temperate rainforest |
| 69 | Wyrmreach | Aldon | 8,096 | 0 | 8,096 | 0 | Rakhnid | 100% | — | Wetland |
| 70 | Wyrmreach | Atham | 8,105 | 0 | 8,105 | 0 | Uruk | 100% | — | Wetland |
| 60 | Wyrmreach | Bostonveria | 12,117 | 0 | 12,117 | 0 | Rakhnid | 51% | Enlandic 5,959 | Taiga |
| 56 | Wyrmreach | Cleowia | 53,616 | 2,185 | 55,801 | 1 | Mercian | 100% | — | Temperate rainforest |
| 67 | Wyrmreach | Cong | 88,189 | 17,164 | 105,353 | 4 | Uruk | 100% | — | Wetland |
| 45 | Wyrmreach | Kan'ji | 12,865 | 661 | 13,526 | 1 | Yotunn | 64% | Rakhnid 4,850 | Wetland |
| 6 | Wyrmreach | Kar'than | 105,658 | 19,301 | 124,959 | 3 | Uruk | 100% | — | Temperate rainforest |
| 92 | Wyrmreach | Kra'han | 277,588 | 64,814 | 342,402 | 7 | Uruk | 52% | Darkspire 161,641; Mercian 2,486 | Taiga |
| 58 | Wyrmreach | Nash | 38,351 | 2,997 | 41,348 | 1 | Uruk | 100% | — | Taiga |
| 40 | Wyrmreach | New Kar'than | 568,895 | 120,665 | 689,560 | 17 | Uruk | 100% | — | Temperate rainforest |
| 59 | Wyrmreach | Norhamia | 2,607 | 0 | 2,607 | 0 | Uruk | 100% | — | Wetland |
| 54 | Wyrmreach | Osbowenia | 218,432 | 39,833 | 258,265 | 8 | Yotunn | 100% | — | Temperate rainforest |
| 43 | Wyrmreach | Pepjaj | 174,821 | 34,687 | 209,508 | 4 | Darkspire | 36% | Uruk 68,024; Rakhnid 25,661; Yotunn 24,005; Mercian 16,205 | Taiga |
| 63 | Wyrmreach | Ras | 1,427 | 0 | 1,427 | 0 | Mercian | 100% | — | Taiga |
| 95 | Wyrmreach | Ruthituk | 3,005 | 0 | 3,005 | 0 | Uruk | 100% | — | Taiga |
| 91 | Wyrmreach | Sa'ker | 345,991 | 33,780 | 379,771 | 8 | Uruk | 100% | Darkspire 1,034 | Taiga |
| 93 | Wyrmreach | Shur | 25,972 | 16,016 | 41,988 | 2 | Darkspire | 100% | — | Wetland |
| 94 | Wyrmreach | Skalzaj | 15,907 | 2,297 | 18,204 | 3 | Uruk | 69% | Schwarzlicht 3,127; Norheim 2,442 | Wetland |
| 11 | Wyrmreach | Skaphjerej | 28,766 | 0 | 28,766 | 0 | Uruk | 100% | — | Taiga |
| 68 | Wyrmreach | South | 88,298 | 22,518 | 110,816 | 4 | Uruk | 87% | Rakhnid 14,292 | Taiga |
| 66 | Wyrmreach | Stapia | 12,319 | 3,220 | 15,539 | 2 | Mercian | 100% | — | Wetland |
| 3 | Wyrmreach | Watonia | 26,312 | 0 | 26,312 | 0 | Norheim | 100% | — | Temperate rainforest |
| 57 | Wyrmreach | Winkneth | 4,867 | 0 | 4,867 | 0 | Yotunn | 100% | — | Taiga |
| 44 | Wyrmreach | Zasiph | 80,450 | 36,835 | 117,285 | 5 | Yotunn | 55% | Rakhnid 48,019; Darkspire 2,799; Mercian 2,214 | Wetland |

## 8. Deterministic local-identity rules for named settlements

Resolver inputs:

1. `burg.culture` -> canonical culture/seed from `config/cultures.yaml`.
2. `burg.state` and cell `province` -> polity and regional history.
3. Province represented-culture mix -> local majority/minority pressure.
4. Burg population -> simulation settlement class.
5. `type`, `port`, `walls`, `citadel`, `temple`, `plaza`, `market`, `shanty` -> civic role.
6. Cell biome -> environmental modifier.

Province context:

- `strong-majority`: dominant represented culture >=90%.
- `mixed-majority`: dominant represented culture >=70% and <90%.
- `plural-frontier`: dominant represented culture <70%.
- `enclave`: settlement source culture differs from the province's dominant represented culture.

An enclave must not be rendered or simulated as a cosmetic copy of the province majority. It needs its own names, institutions, household networks, faith mix, architecture accents, political concerns, and relations with nearby settlements.

## 9. Named settlement registry

Every current source-backed named burg appears below. `Local branch` is the starting authored identity, not an immutable future state.

### Contia — Contian Theocracy

| ID | Settlement | Province | Population | Class | Source culture | Canonical/seed | Local branch | Biome | Role | Civic features | Province context |
|---:|---|---|---:|---|---|---|---|---|---|---|---|
| 202 | Rhein | Bartoncia | 16,411 | city | Schwarzlicht | contian | River and Port Registry Contians | Temperate rainforest | Naval; port | port, temple, market | strong-majority |
| 17 | Goriedbad | Bartoncia | 2,023 | small-town | Schwarzlicht | contian | Fortress Contians | Temperate rainforest | Hunting | walls, temple, plaza, market | strong-majority |
| 236 | Ettengendin | Bartoncia | 1,751 | small-town | Schwarzlicht | contian | Fortress Contians | Temperate rainforest | Hunting | citadel, temple, market | strong-majority |
| 63 | Feldberg | Bartoncia | 1,596 | small-town | Schwarzlicht | contian | Provincial Contians | Temperate rainforest | Hunting | temple, market | strong-majority |
| 102 | Schenhau | Blandbury | 15,115 | city | Schwarzlicht | contian | Fortress Contians | Temperate deciduous forest | Generic | walls, temple, plaza, market | strong-majority |
| 103 | Sulzkirch | Blandbury | 11,616 | large-town | Schwarzlicht | contian | Fortress Contians | Temperate deciduous forest | Generic | walls, temple, market | strong-majority |
| 388 | Gernsfeld | Blandbury | 10,839 | large-town | Schwarzlicht | contian | Fortress Contians | Temperate rainforest | Generic | walls, temple, market | strong-majority |
| 225 | Lieuen | Blandbury | 8,981 | large-town | Schwarzlicht | contian | Provincial Contians | Temperate rainforest | Generic | temple, market | strong-majority |
| 177 | Schozin | Blandbury | 7,829 | town | Schwarzlicht | contian | Fortress Contians | Temperate rainforest | Generic | citadel, temple, market | strong-majority |
| 70 | Husen | Blandbury | 6,604 | town | Schwarzlicht | contian | Fortress Contians | Temperate rainforest | Generic | citadel, temple, market | strong-majority |
| 80 | Hardt | Blandbury | 5,985 | town | Schwarzlicht | contian | Fortress Contians | Temperate deciduous forest | Hunting | citadel, temple, plaza, market | strong-majority |
| 154 | Acherken | Blandbury | 5,054 | town | Schwarzlicht | contian | Provincial Contians | Temperate rainforest | Hunting | temple, market | strong-majority |
| 142 | Gusengen | Blandbury | 4,354 | town | Schwarzlicht | contian | Provincial Contians | Temperate rainforest | Hunting | temple, market | strong-majority |
| 99 | Oberten | Blandbury | 4,279 | town | Schwarzlicht | contian | Fortress Contians | Temperate deciduous forest | Hunting | citadel, temple, market | strong-majority |
| 115 | Lauweinach | Blandbury | 3,889 | town | Schwarzlicht | contian | Provincial Contians | Temperate rainforest | Hunting | temple, plaza, market | strong-majority |
| 360 | Freilerbach | Blandbury | 3,179 | town | Schwarzlicht | contian | River and Port Registry Contians | Temperate rainforest | Naval; port | port, temple, market | strong-majority |
| 69 | Monch | Blandbury | 2,463 | small-town | Schwarzlicht | contian | River and Port Registry Contians | Temperate rainforest | Naval; port | port, citadel, temple, market | strong-majority |
| 146 | Weilrech | Blandbury | 1,756 | small-town | Schwarzlicht | contian | Provincial Contians | Temperate rainforest | Hunting | temple, market | strong-majority |
| 279 | Herbachengen | Blandbury | 1,669 | small-town | Schwarzlicht | contian | Fortress Contians | Temperate rainforest | Hunting | citadel, temple, market | strong-majority |
| 129 | Birmersgau | Blandbury | 1,633 | small-town | Schwarzlicht | contian | Provincial Contians | Temperate deciduous forest | Hunting | temple, market | strong-majority |
| 216 | Sulzburg | Blandbury | 1,612 | small-town | Schwarzlicht | contian | Fortress Contians | Temperate rainforest | Hunting | walls, citadel, temple, market | strong-majority |
| 79 | Gorisch | Blandbury | 1,602 | small-town | Schwarzlicht | contian | Fortress Contians | Temperate deciduous forest | Hunting | citadel, temple, plaza, market | strong-majority |
| 10 | Pewald | Modmanchia | 26,303 | capital | Schwarzlicht | contian | Pewald Administrative Contians | Temperate rainforest | Naval; port | port, walls, citadel, temple, plaza, market | strong-majority |
| 26 | Schonach | Modmanchia | 17,224 | city | Schwarzlicht | contian | Academy Contians | Temperate rainforest | Generic | temple, plaza, market | strong-majority |
| 261 | Kipbach | Modmanchia | 14,556 | large-town | Schwarzlicht | contian | Academy Contians | Temperate rainforest | Generic | temple, plaza, market | strong-majority |
| 188 | Laubusen | Modmanchia | 11,819 | large-town | Schwarzlicht | contian | Academy Contians | Temperate rainforest | Generic | temple, market | strong-majority |
| 284 | Liebach | Modmanchia | 11,754 | large-town | Schwarzlicht | contian | Fortress Contians | Temperate rainforest | Generic | walls, citadel, temple, market | strong-majority |
| 132 | Gernsteig | Modmanchia | 10,282 | large-town | Schwarzlicht | contian | Fortress Contians | Temperate rainforest | Generic | walls, citadel, temple, market | strong-majority |
| 203 | Todtlin | Modmanchia | 9,690 | large-town | Schwarzlicht | contian | Provincial Contians | Temperate rainforest | Generic | temple, plaza, market | strong-majority |
| 336 | Onigsbach | Modmanchia | 8,859 | large-town | Schwarzlicht | contian | Provincial Contians | Temperate rainforest | Generic | temple, market | strong-majority |
| 122 | Buhllstad | Modmanchia | 8,527 | large-town | Schwarzlicht | contian | Fortress Contians | Temperate rainforest | Generic | citadel, temple, plaza, market | strong-majority |
| 95 | Rasbach | Modmanchia | 5,604 | town | Schwarzlicht | contian | Fortress Contians | Temperate rainforest | Hunting | citadel, temple, market | strong-majority |
| 316 | Serach | Modmanchia | 5,394 | town | Schwarzlicht | contian | Fortress Contians | Temperate rainforest | Hunting | citadel, temple, plaza, market | strong-majority |
| 436 | Dotnaubusen | Modmanchia | 2,811 | small-town | Schwarzlicht | contian | River and Port Registry Contians | Temperate rainforest | Naval; port | port, walls, citadel, temple, plaza, market | strong-majority |
| 86 | Woldinbach | Modmanchia | 1,505 | small-town | Schwarzlicht | contian | Fortress Contians | Temperate rainforest | Hunting | walls, citadel, temple, market | strong-majority |
| 467 | Dorns | Modmanchia | 667 | named-village | Schwarzlicht | contian | Fortress Contians | Wetland | Generic | walls, citadel, temple, market | strong-majority |
| 212 | Todtlin | Shifractham | 13,857 | large-town | Schwarzlicht | contian | Fortress Contians | Temperate deciduous forest | Generic | walls, temple, plaza, market | strong-majority |
| 181 | Senen | Shifractham | 10,696 | large-town | Schwarzlicht | contian | River and Port Registry Contians | Temperate rainforest | Naval; port | port, walls, citadel, temple, plaza, market | strong-majority |
| 126 | Tiengen | Shifractham | 10,371 | large-town | Schwarzlicht | contian | Fortress Contians | Temperate rainforest | Generic | walls, temple, market | strong-majority |
| 130 | Steiberg | Shifractham | 7,737 | town | Schwarzlicht | contian | Fortress Contians | Temperate rainforest | Generic | citadel, temple, market | strong-majority |
| 368 | Trienhanburg | Shifractham | 6,632 | town | Schwarzlicht | contian | Provincial Contians | Temperate rainforest | Generic | temple, plaza, market | strong-majority |
| 210 | Breinach | Shifractham | 3,928 | town | Schwarzlicht | contian | Provincial Contians | Temperate deciduous forest | Hunting | temple, plaza, market | strong-majority |
| 157 | Soldenter | Shifractham | 2,686 | small-town | Schwarzlicht | contian | Fortress Contians | Temperate rainforest | Hunting | citadel, temple, market | strong-majority |
| 120 | Inztal | Shifractham | 2,555 | small-town | Schwarzlicht | contian | River and Port Registry Contians | Temperate rainforest | Naval; port | port, citadel, temple, market | strong-majority |
| 172 | Kaptengen | Shifractham | 2,255 | small-town | Schwarzlicht | contian | Fortress Contians | Temperate rainforest | Hunting | citadel, temple, market | strong-majority |
| 19 | Glotnausen | Shifractham | 2,023 | small-town | Schwarzlicht | contian | Fortress Contians | Temperate rainforest | Hunting | citadel, temple, market | strong-majority |
| 245 | Losfeldt | Shifractham | 1,814 | small-town | Schwarzlicht | contian | Provincial Contians | Temperate rainforest | Hunting | temple, market | strong-majority |
| 417 | Heitertal | Shifractham | 1,789 | small-town | Schwarzlicht | contian | Provincial Contians | Temperate rainforest | Hunting | temple, market | strong-majority |
| 268 | Sasweierzar | Shifractham | 1,717 | small-town | Schwarzlicht | contian | Fortress Contians | Temperate deciduous forest | Hunting | citadel, temple, market | strong-majority |
| 419 | Monch | Shifractham | 1,682 | small-town | Schwarzlicht | contian | Provincial Contians | Temperate rainforest | Hunting | temple, market | strong-majority |
| 137 | Kofen | Shifractham | 1,492 | small-town | Schwarzlicht | contian | Fortress Contians | Temperate rainforest | Hunting | walls, temple, market | strong-majority |
| 411 | Renchrin | Watford | 1,823 | small-town | Schwarzlicht | contian | Provincial Contians | Temperate rainforest | Hunting | temple, plaza, market | strong-majority |
| 182 | Bollsburg | Watonley | 19,297 | city | Schwarzlicht | contian | Fortress Contians | Temperate rainforest | Generic | citadel, temple, plaza, market | strong-majority |
| 226 | Birbach | Watonley | 18,644 | city | Schwarzlicht | contian | River and Port Registry Contians | Temperate deciduous forest | Naval; port | port, walls, citadel, temple, plaza, market | strong-majority |
| 270 | Efewaldberg | Watonley | 16,893 | city | Schwarzlicht | contian | Fortress Contians | Temperate rainforest | Generic | citadel, temple, plaza, market | strong-majority |
| 147 | Elzkirchach | Watonley | 14,683 | large-town | Schwarzlicht | contian | River and Port Registry Contians | Temperate rainforest | Naval; port | port, walls, temple, plaza, market | strong-majority |
| 235 | Karlsgauben | Watonley | 9,107 | large-town | Schwarzlicht | contian | Provincial Contians | Temperate rainforest | Generic | temple, plaza, market | strong-majority |
| 444 | Schwonigswe | Watonley | 6,774 | town | Schwarzlicht | contian | Fortress Contians | Temperate deciduous forest | Generic | citadel, temple, market | strong-majority |
| 29 | Tiebach | Watonley | 5,552 | town | Schwarzlicht | contian | River and Port Registry Contians | Temperate rainforest | Naval; port | port, citadel, temple, market | strong-majority |
| 314 | Obermersfeld | Watonley | 5,491 | town | Schwarzlicht | contian | Fortress Contians | Temperate rainforest | Hunting | citadel, temple, market | strong-majority |
| 239 | Wutach | Watonley | 5,312 | town | Schwarzlicht | contian | Provincial Contians | Temperate deciduous forest | Hunting | temple, market | strong-majority |
| 204 | Badeierbach | Watonley | 2,556 | small-town | Schwarzlicht | contian | River and Port Registry Contians | Temperate rainforest | Naval; port | port, temple, market | strong-majority |
| 32 | Kelden | Watonley | 2,482 | small-town | Schwarzlicht | contian | River and Port Registry Contians | Temperate deciduous forest | Naval; port | port, temple, market | strong-majority |
| 51 | Oberleiamt | Watonley | 1,954 | small-town | Schwarzlicht | contian | Provincial Contians | Temperate rainforest | Hunting | temple, market | strong-majority |
| 296 | Bollsbachwe | Watonley | 1,800 | small-town | Schwarzlicht | contian | Fortress Contians | Temperate rainforest | Hunting | walls, citadel, temple, market | strong-majority |
| 277 | Marxzell | Watonley | 1,741 | small-town | Schwarzlicht | contian | Fortress Contians | Temperate rainforest | Hunting | citadel, temple, plaza, market | strong-majority |
| 92 | Wufenhau | Watonley | 1,676 | small-town | Schwarzlicht | contian | Fortress Contians | Temperate rainforest | Hunting | citadel, temple, market | strong-majority |
| 178 | Stein | Watonley | 1,657 | small-town | Schwarzlicht | contian | Provincial Contians | Temperate rainforest | Hunting | temple, plaza, market | strong-majority |
| 163 | Neutenweiler | Watonley | 1,630 | small-town | Schwarzlicht | contian | Fortress Contians | Temperate deciduous forest | Hunting | walls, citadel, temple, market | strong-majority |
| 257 | Munstett | Watonley | 1,523 | small-town | Schwarzlicht | contian | Provincial Contians | Temperate rainforest | Hunting | temple, market | strong-majority |
| 124 | Esenwald | Watonley | 1,481 | small-town | Schwarzlicht | contian | Provincial Contians | Temperate rainforest | Hunting | temple, market | strong-majority |

### Wyrmreach — Wyrmreach Dominion

| ID | Settlement | Province | Population | Class | Source culture | Canonical/seed | Local branch | Biome | Role | Civic features | Province context |
|---:|---|---|---:|---|---|---|---|---|---|---|---|
| 97 | Grath'te | Cleowia | 2,185 | small-town | Mercian | serpent-peoples | Wyrmreach Serpent Enclaves | Temperate rainforest | Hunting | market | strong-majority |
| 311 | Adigh | Cong | 8,146 | large-town | Uruk | orc-peoples | Wyrmreach Orcs | Wetland | Generic | market | strong-majority |
| 328 | Durmekh | Cong | 6,337 | town | Uruk | orc-peoples | Wyrmreach Orcs | Wetland | Generic | walls, citadel, market | strong-majority |
| 494 | Gribrokh | Cong | 2,009 | small-town | Uruk | orc-peoples | Wyrmreach Orcs | Wetland | Generic | plaza, market | strong-majority |
| 476 | Krarrugh | Cong | 672 | named-village | Uruk | orc-peoples | Wyrmreach Orcs | Wetland | Generic | walls, citadel, plaza, market | strong-majority |
| 474 | Kharb | Kan'ji | 661 | named-village | Yotunn | jotunn | Wyrmreach Jotunn | Taiga | Hunting | citadel, market | plural-frontier |
| 13 | Uzar | Kar'than | 15,237 | capital | Uruk | orc-peoples | Wyrmreach Orcs | Temperate rainforest | Naval; port | port, walls, citadel, plaza, market | strong-majority |
| 285 | Kazza | Kar'than | 2,559 | small-town | Uruk | orc-peoples | Wyrmreach Orcs | Temperate rainforest | Naval; port | port, market | strong-majority |
| 187 | Nird | Kar'than | 1,505 | small-town | Uruk | orc-peoples | Wyrmreach Orcs | Temperate rainforest | Hunting | citadel, plaza, market | strong-majority |
| 84 | Razad | Kra'han | 23,101 | city | Uruk | orc-peoples | Wyrmreach Orcs | Taiga | Naval; port | port, walls, citadel, plaza, shanty, market | plural-frontier |
| 89 | Kashas | Kra'han | 10,490 | large-town | Darkspire | goblin-peoples | Wyrmreach Goblins | Taiga | Generic | citadel, plaza, market | enclave; plural-frontier |
| 200 | Glervaq | Kra'han | 9,384 | large-town | Darkspire | goblin-peoples | Wyrmreach Goblins | Taiga | Lake | market | enclave; plural-frontier |
| 456 | Morbrez | Kra'han | 6,704 | town | Uruk | orc-peoples | Wyrmreach Orcs | Taiga | Lake | market | plural-frontier |
| 410 | Chugvol | Kra'han | 6,587 | town | Uruk | orc-peoples | Wyrmreach Orcs | Taiga | Generic | market | plural-frontier |
| 497 | Kezegh | Kra'han | 5,287 | town | Uruk | orc-peoples | Wyrmreach Orcs | Taiga | Lake | citadel, market | plural-frontier |
| 359 | Drukh | Kra'han | 3,261 | town | Uruk | orc-peoples | Wyrmreach Orcs | Taiga | Hunting | market | plural-frontier |
| 258 | Vrazon | Nash | 2,997 | small-town | Uruk | orc-peoples | Wyrmreach Orcs | Taiga | Naval; port | port, citadel, market | strong-majority |
| 66 | Qid-Zrar | New Kar'than | 17,728 | city | Uruk | orc-peoples | Wyrmreach Orcs | Temperate rainforest | Generic | walls, plaza, market | strong-majority |
| 230 | Bror | New Kar'than | 15,150 | city | Uruk | orc-peoples | Wyrmreach Orcs | Temperate rainforest | Naval; port | port, citadel, plaza, market | strong-majority |
| 119 | Ikh-Ghal | New Kar'than | 14,607 | large-town | Uruk | orc-peoples | Wyrmreach Orcs | Temperate rainforest | Generic | walls, citadel, market | strong-majority |
| 61 | Ormekh | New Kar'than | 13,549 | large-town | Uruk | orc-peoples | Wyrmreach Orcs | Temperate rainforest | Generic | walls, plaza, market | strong-majority |
| 179 | Khuzd | New Kar'than | 9,721 | large-town | Uruk | orc-peoples | Wyrmreach Orcs | Temperate rainforest | Generic | citadel, plaza, market | strong-majority |
| 98 | Uzgar | New Kar'than | 8,773 | large-town | Uruk | orc-peoples | Wyrmreach Orcs | Temperate rainforest | Generic | citadel, market | strong-majority |
| 218 | Vrazad | New Kar'than | 7,807 | town | Uruk | orc-peoples | Wyrmreach Orcs | Temperate rainforest | Generic | citadel, market | strong-majority |
| 290 | Velgnan | New Kar'than | 7,807 | town | Uruk | orc-peoples | Wyrmreach Orcs | Temperate rainforest | Generic | citadel, market | strong-majority |
| 363 | Khegan | New Kar'than | 4,760 | town | Uruk | orc-peoples | Wyrmreach Orcs | Temperate rainforest | Hunting | market | strong-majority |
| 186 | Dhodh | New Kar'than | 4,520 | town | Uruk | orc-peoples | Wyrmreach Orcs | Temperate rainforest | Hunting | plaza, market | strong-majority |
| 356 | Kalbrokh | New Kar'than | 4,095 | town | Uruk | orc-peoples | Wyrmreach Orcs | Taiga | Hunting | market | strong-majority |
| 67 | Qicrur | New Kar'than | 3,436 | town | Uruk | orc-peoples | Wyrmreach Orcs | Temperate rainforest | Hunting | market | strong-majority |
| 83 | Kudigh | New Kar'than | 1,985 | small-town | Uruk | orc-peoples | Wyrmreach Orcs | Temperate rainforest | Hunting | citadel, plaza, market | strong-majority |
| 376 | Gugh | New Kar'than | 1,772 | small-town | Uruk | orc-peoples | Wyrmreach Orcs | Temperate rainforest | Hunting | market | strong-majority |
| 329 | Ighukh | New Kar'than | 1,748 | small-town | Uruk | orc-peoples | Wyrmreach Orcs | Temperate rainforest | Hunting | citadel, plaza, market | strong-majority |
| 374 | Velgrudh | New Kar'than | 1,653 | small-town | Uruk | orc-peoples | Wyrmreach Orcs | Temperate rainforest | Hunting | walls, citadel, plaza, market | strong-majority |
| 138 | Broghird | New Kar'than | 1,554 | small-town | Uruk | orc-peoples | Wyrmreach Orcs | Temperate rainforest | Hunting | walls, citadel, market | strong-majority |
| 396 | Vorkila | Osbowenia | 11,482 | large-town | Yotunn | jotunn | Wyrmreach Jotunn | Wetland | Naval; port | port, walls, citadel, plaza, market | strong-majority |
| 319 | Mergin | Osbowenia | 10,445 | large-town | Yotunn | jotunn | Wyrmreach Jotunn | Taiga | Naval; port | port, market | strong-majority |
| 196 | Wyle | Osbowenia | 6,461 | town | Yotunn | jotunn | Wyrmreach Jotunn | Temperate rainforest | Generic | plaza, market | strong-majority |
| 254 | Ustand | Osbowenia | 4,584 | town | Yotunn | jotunn | Wyrmreach Jotunn | Temperate rainforest | Hunting | walls, market | strong-majority |
| 434 | Fyngarth | Osbowenia | 1,801 | small-town | Yotunn | jotunn | Wyrmreach Jotunn | Temperate rainforest | Hunting | citadel, market | strong-majority |
| 387 | Gunarguzan | Osbowenia | 1,756 | small-town | Yotunn | jotunn | Wyrmreach Jotunn | Temperate rainforest | Hunting | citadel, market | strong-majority |
| 293 | Ranmoth | Osbowenia | 1,715 | small-town | Yotunn | jotunn | Wyrmreach Jotunn | Temperate rainforest | Hunting | plaza, market | strong-majority |
| 62 | Varkirumun | Osbowenia | 1,589 | small-town | Yotunn | jotunn | Wyrmreach Jotunn | Temperate rainforest | Hunting | plaza, market | strong-majority |
| 350 | Proldai | Pepjaj | 17,377 | city | Darkspire | goblin-peoples | Wyrmreach Goblins | Taiga | Naval; port | port, walls, citadel, plaza, market | plural-frontier |
| 330 | Bhic | Pepjaj | 9,260 | large-town | Uruk | orc-peoples | Wyrmreach Orcs | Taiga | Naval; port | port, citadel, market | enclave; plural-frontier |
| 464 | Kleabsilt | Pepjaj | 4,523 | town | Darkspire | goblin-peoples | Wyrmreach Goblins | Tundra | Generic | market | plural-frontier |
| 469 | Cherbold | Pepjaj | 3,527 | town | Yotunn | jotunn | Wyrmreach Jotunn | Taiga | Hunting | citadel, plaza, market | enclave; plural-frontier |
| 485 | Drukh | Sa'ker | 10,498 | large-town | Uruk | orc-peoples | Wyrmreach Orcs | Taiga | Generic | walls, citadel, market | strong-majority |
| 274 | Zrald | Sa'ker | 7,501 | town | Uruk | orc-peoples | Wyrmreach Orcs | Taiga | Generic | market | strong-majority |
| 375 | Ghegniz | Sa'ker | 6,753 | town | Uruk | orc-peoples | Wyrmreach Orcs | Taiga | Naval; port | port, market | strong-majority |
| 418 | Kudrared | Sa'ker | 3,152 | town | Uruk | orc-peoples | Wyrmreach Orcs | Taiga | Hunting | citadel, market | strong-majority |
| 198 | Dhog | Sa'ker | 2,370 | small-town | Uruk | orc-peoples | Wyrmreach Orcs | Taiga | Naval; port | port, walls, market | strong-majority |
| 470 | Khuzd | Sa'ker | 1,890 | small-town | Uruk | orc-peoples | Wyrmreach Orcs | Wetland | Generic | citadel, market | strong-majority |
| 378 | Ghol | Sa'ker | 907 | named-village | Uruk | orc-peoples | Wyrmreach Orcs | Taiga | Hunting | market | strong-majority |
| 486 | Mazred | Sa'ker | 709 | named-village | Uruk | orc-peoples | Wyrmreach Orcs | Taiga | Hunting | citadel, market | strong-majority |
| 426 | Crild | Shur | 11,583 | large-town | Darkspire | goblin-peoples | Wyrmreach Goblins | Wetland | Generic | walls, citadel, market | strong-majority |
| 442 | Celkeh | Shur | 4,433 | town | Darkspire | goblin-peoples | Wyrmreach Goblins | Wetland | Generic | walls, citadel, market | strong-majority |
| 495 | Brogrun | Skalzaj | 842 | named-village | Uruk | orc-peoples | Wyrmreach Orcs | Wetland | Generic | citadel, plaza, market | plural-frontier |
| 493 | Khorb | Skalzaj | 736 | named-village | Uruk | orc-peoples | Wyrmreach Orcs | Wetland | Generic | citadel, plaza, market | plural-frontier |
| 477 | Neuninburg | Skalzaj | 719 | named-village | Schwarzlicht | contian | Contian Diaspora | Wetland | Generic | market | enclave; plural-frontier |
| 478 | Digroc | South | 14,999 | large-town | Uruk | orc-peoples | Wyrmreach Orcs | Taiga | Generic | walls, plaza, market | mixed-majority |
| 479 | Zhaveeh | South | 3,369 | town | Rakhnid | rakhnid-broods | Wyrmreach Rakhnid Broods | Taiga | Hunting | walls, market | enclave; mixed-majority |
| 333 | Zalbrol | South | 3,213 | town | Uruk | orc-peoples | Wyrmreach Orcs | Wetland | Generic | market | mixed-majority |
| 416 | Bhirkudh | South | 937 | named-village | Uruk | orc-peoples | Wyrmreach Orcs | Taiga | Hunting | walls, citadel, market | mixed-majority |
| 491 | Zar'th'jen | Stapia | 1,636 | small-town | Mercian | serpent-peoples | Wyrmreach Serpent Enclaves | Wetland | Generic | citadel, market | strong-majority |
| 438 | Slallaless | Stapia | 1,584 | small-town | Mercian | serpent-peoples | Wyrmreach Serpent Enclaves | Wetland | Generic | walls, citadel, plaza, market | strong-majority |
| 315 | Eqanchros | Zasiph | 11,172 | large-town | Rakhnid | rakhnid-broods | Wyrmreach Rakhnid Broods | Taiga | Generic | walls, market | enclave; plural-frontier |
| 344 | Irgatrek | Zasiph | 8,267 | large-town | Yotunn | jotunn | Wyrmreach Jotunn | Wetland | Generic | walls, citadel, plaza, market | plural-frontier |
| 385 | Neeqas | Zasiph | 7,864 | town | Rakhnid | rakhnid-broods | Wyrmreach Rakhnid Broods | Wetland | Generic | citadel, market | enclave; plural-frontier |
| 496 | Khazinkuc | Zasiph | 7,411 | town | Yotunn | jotunn | Wyrmreach Jotunn | Wetland | Generic | market | plural-frontier |
| 489 | Nuzinez | Zasiph | 2,121 | small-town | Yotunn | jotunn | Wyrmreach Jotunn | Taiga | Hunting | citadel, market | plural-frontier |

### Umbra'kor — Umbra'kor Dominion

| ID | Settlement | Province | Population | Class | Source culture | Canonical/seed | Local branch | Biome | Role | Civic features | Province context |
|---:|---|---|---:|---|---|---|---|---|---|---|---|
| 123 | Nolaiober | Albrid | 2,242 | small-town | Darkhold | umbra-kori | Warden Umbra'kori | Temperate rainforest | Hunting | citadel, plaza, market | strong-majority |
| 482 | T'lama | Albrid | 2,172 | small-town | Darkhold | umbra-kori | Warden Umbra'kori | Wetland | Generic | citadel, plaza, market | strong-majority |
| 366 | Glaritheas | Albrid | 1,780 | small-town | Darkhold | umbra-kori | Warden Umbra'kori | Temperate rainforest | Hunting | plaza, market | strong-majority |
| 307 | Veldnahet | Bucking | 8,059 | large-town | Darkhold | umbra-kori | Warden Umbra'kori | Temperate rainforest | Generic | walls, citadel, market | strong-majority |
| 448 | Kerarithalk | Bucking | 902 | named-village | Darkhold | umbra-kori | Warden Umbra'kori | Wetland | Generic | citadel, market | strong-majority |
| 9 | Narirethlas | Felonia | 3,638 | town | Eldoria | elenori | Deep-Envoy Elenori | Temperate rainforest | Naval; port | port, citadel, market | strong-majority |
| 299 | Uldarcrindra | Hertheria | 12,688 | large-town | Darkhold | umbra-kori | Gate and Port Umbra'kori | Wetland | Naval; port | port, walls, plaza, market | strong-majority |
| 437 | Ullheilau | Hertheria | 11,380 | large-town | Darkhold | umbra-kori | Warden Umbra'kori | Wetland | Generic | walls, citadel, plaza, market | strong-majority |
| 38 | Skaallorth | Leigh | 14,428 | large-town | Darkhold | umbra-kori | Gate and Port Umbra'kori | Temperate rainforest | Naval; port | port, walls, citadel, plaza, market | strong-majority |
| 455 | Dregref | Leigh | 7,732 | town | Darkhold | umbra-kori | Gate and Port Umbra'kori | Wetland | Naval; port | port, market | strong-majority |
| 121 | Nauthaladlynd | New Ania | 11,372 | large-town | Darkhold | umbra-kori | Warden Umbra'kori | Temperate rainforest | Generic | walls, citadel, plaza, market | strong-majority |
| 484 | Seyranghe | New Ania | 6,078 | town | Darkhold | umbra-kori | Warden Umbra'kori | Wetland | Generic | citadel, plaza, market | strong-majority |
| 167 | Farondnaneth | New Felonia | 16,560 | city | Darkhold | umbra-kori | Warden Umbra'kori | Temperate rainforest | Generic | citadel, market | strong-majority |
| 35 | Farondrynnde | New Felonia | 15,836 | city | Darkhold | umbra-kori | Gate and Port Umbra'kori | Temperate rainforest | Lake | walls, market | strong-majority |
| 131 | Triz'rir | New Felonia | 9,154 | large-town | Darkhold | umbra-kori | Deep-House Umbra'kori | Temperate rainforest | Generic | market | strong-majority |
| 423 | Skaalluhel | New Felonia | 4,079 | town | Darkhold | umbra-kori | Gate and Port Umbra'kori | Wetland | Naval; port | port, market | strong-majority |
| 265 | Bugaust | New Felonia | 3,959 | town | Darkhold | umbra-kori | Deep-House Umbra'kori | Temperate rainforest | Hunting | market | strong-majority |
| 263 | Hluireryndra | New Felonia | 1,909 | small-town | Darkhold | umbra-kori | Warden Umbra'kori | Temperate rainforest | Hunting | walls, market | strong-majority |
| 325 | Duskhynnocrin | New Felonia | 1,862 | small-town | Darkhold | umbra-kori | Warden Umbra'kori | Temperate rainforest | Hunting | walls, market | strong-majority |
| 334 | Duskhyn | New Felonia | 1,745 | small-town | Darkhold | umbra-kori | Warden Umbra'kori | Temperate rainforest | Hunting | walls, citadel, plaza, market | strong-majority |
| 224 | Farond | New Felonia | 1,730 | small-town | Darkhold | umbra-kori | Warden Umbra'kori | Temperate rainforest | Hunting | citadel, market | strong-majority |
| 238 | Vhaltha | New Jarlingen | 15,747 | city | Darkhold | umbra-kori | Deep-House Umbra'kori | Temperate rainforest | Generic | plaza, market | strong-majority |
| 42 | D'elnar | New Jarlingen | 14,862 | large-town | Darkhold | umbra-kori | Warden Umbra'kori | Temperate rainforest | Generic | walls, plaza, market | strong-majority |
| 90 | Velanethmyryb | New Jarlingen | 13,783 | large-town | Darkhold | umbra-kori | Gate and Port Umbra'kori | Temperate rainforest | Naval; port | port, plaza, market | strong-majority |
| 232 | Lothes | New Jarlingen | 11,311 | large-town | Darkhold | umbra-kori | Warden Umbra'kori | Temperate rainforest | Generic | walls, market | strong-majority |
| 158 | Veldrasad | New Jarlingen | 9,256 | large-town | Darkhold | umbra-kori | Deep-House Umbra'kori | Temperate rainforest | Generic | market | strong-majority |
| 105 | Llurtheneadhet | New Jarlingen | 8,995 | large-town | Darkhold | umbra-kori | Deep-House Umbra'kori | Temperate rainforest | Generic | market | strong-majority |
| 60 | Sshanderi | New Jarlingen | 8,560 | large-town | Darkhold | umbra-kori | Deep-House Umbra'kori | Temperate rainforest | Generic | plaza, market | strong-majority |
| 56 | Veldrynn | New Jarlingen | 8,011 | large-town | Darkhold | umbra-kori | Gate and Port Umbra'kori | Temperate rainforest | Naval; port | port, citadel, market | strong-majority |
| 58 | Xaalben | New Jarlingen | 7,962 | town | Darkhold | umbra-kori | Warden Umbra'kori | Temperate rainforest | Generic | citadel, market | strong-majority |
| 214 | Raugaust | New Jarlingen | 7,875 | town | Darkhold | umbra-kori | Warden Umbra'kori | Temperate rainforest | Generic | walls, citadel, market | strong-majority |
| 295 | Dedhlondra | New Jarlingen | 7,288 | town | Darkhold | umbra-kori | Deep-House Umbra'kori | Temperate rainforest | Generic | market | strong-majority |
| 113 | Falanenerwin | New Jarlingen | 6,256 | town | Darkhold | umbra-kori | Warden Umbra'kori | Temperate rainforest | Generic | walls, citadel, market | strong-majority |
| 100 | Haggheihauiy | New Jarlingen | 3,490 | town | Darkhold | umbra-kori | Deep-House Umbra'kori | Temperate rainforest | Hunting | plaza, market | strong-majority |
| 149 | Wetheirillu | New Jarlingen | 2,526 | small-town | Darkhold | umbra-kori | Gate and Port Umbra'kori | Temperate rainforest | Naval; port | port, walls, plaza, market | strong-majority |
| 369 | Ben'a | New Jarlingen | 1,732 | small-town | Darkhold | umbra-kori | Warden Umbra'kori | Temperate rainforest | Hunting | walls, citadel, market | strong-majority |
| 291 | Dobeth | New Jarlingen | 1,714 | small-town | Darkhold | umbra-kori | Warden Umbra'kori | Temperate rainforest | Hunting | market | strong-majority |
| 322 | Uiylathrrhin | New Jarlingen | 1,693 | small-town | Darkhold | umbra-kori | Warden Umbra'kori | Temperate rainforest | Hunting | citadel, plaza, market | strong-majority |
| 189 | Olraharit | New Jarlingen | 1,589 | small-town | Darkhold | umbra-kori | Warden Umbra'kori | Temperate rainforest | Hunting | citadel, market | strong-majority |
| 468 | Zirwin | Ormswestia | 4,320 | town | Darkhold | umbra-kori | Warden Umbra'kori | Wetland | Generic | walls, plaza, market | strong-majority |
| 280 | Ugref | Ormswestia | 1,673 | small-town | Darkhold | umbra-kori | Warden Umbra'kori | Temperate rainforest | Hunting | citadel, plaza, market | strong-majority |
| 365 | Gnilanilhei | Ormswestia | 1,223 | small-town | Darkhold | umbra-kori | Gate and Port Umbra'kori | Wetland | Naval; port | port, market | strong-majority |
| 483 | Chagroth | Pildonia | 2,716 | small-town | Darkhold | umbra-kori | Warden Umbra'kori | Wetland | Generic | market | strong-majority |
| 370 | Keier | Presinbia | 10,694 | large-town | Darkhold | umbra-kori | Warden Umbra'kori | Temperate rainforest | Generic | walls, plaza, market | strong-majority |
| 96 | Olothionfena | Tigan | 10,234 | large-town | Darkhold | umbra-kori | Gate and Port Umbra'kori | Temperate rainforest | Naval; port | port, walls, citadel, plaza, market | strong-majority |
| 6 | Metasadhell | Wareria | 36,533 | capital | Darkhold | umbra-kori | Metasadhell Civic Umbra'kori | Temperate rainforest | Naval; port | port, walls, citadel, plaza, shanty, market | strong-majority |
| 313 | Buguall | Wareria | 31,573 | major-city | Darkhold | umbra-kori | Gate and Port Umbra'kori | Temperate rainforest | Naval; port | port, walls, citadel, temple, plaza, shanty, market | strong-majority |
| 18 | Cyvazin | Wareria | 28,290 | major-city | Darkhold | umbra-kori | Warden Umbra'kori | Temperate rainforest | Generic | walls, citadel, plaza, market | strong-majority |
| 288 | Allorthimyd | Wareria | 12,632 | large-town | Darkhold | umbra-kori | Gate and Port Umbra'kori | Wetland | Naval; port | port, plaza, market | strong-majority |
| 460 | Glanathakayda | Wareria | 8,303 | large-town | Darkhold | umbra-kori | Gate and Port Umbra'kori | Wetland | Naval; port | port, plaza, market | strong-majority |
| 480 | Harnaiolon | Wareria | 8,191 | large-town | Darkhold | umbra-kori | Warden Umbra'kori | Wetland | Generic | citadel, market | strong-majority |
| 481 | Yryburth | Wareria | 7,808 | town | Darkhold | umbra-kori | Warden Umbra'kori | Wetland | Generic | citadel, plaza, market | strong-majority |
| 135 | Llurthihau | Wareria | 6,454 | town | Darkhold | umbra-kori | Deep-House Umbra'kori | Temperate rainforest | Generic | plaza, market | strong-majority |
| 382 | Munntyrrvhei | Wareria | 4,439 | town | Darkhold | umbra-kori | Gate and Port Umbra'kori | Wetland | Naval; port | port, market | strong-majority |
| 256 | Uialmanillalad | Wareria | 4,076 | town | Darkhold | umbra-kori | Gate and Port Umbra'kori | Wetland | Naval; port | port, market | strong-majority |
| 176 | Chedrarant | Wareria | 1,937 | small-town | Darkhold | umbra-kori | Warden Umbra'kori | Temperate rainforest | Hunting | walls, citadel, market | strong-majority |
| 141 | Mel-Zedhet | Wareria | 1,469 | small-town | Darkhold | umbra-kori | Warden Umbra'kori | Temperate rainforest | Hunting | market | strong-majority |
| 447 | Melranderi | Wareria | 1,248 | small-town | Darkhold | umbra-kori | Gate and Port Umbra'kori | Wetland | Naval; port | port, market | strong-majority |
| 318 | Heneadrarond | Watford | 21,217 | city | Darkhold | umbra-kori | Gate and Port Umbra'kori | Temperate rainforest | Naval; port | port, walls, citadel, temple, plaza, shanty, market | strong-majority |
| 337 | Betheimyd | Watford | 10,277 | large-town | Darkhold | umbra-kori | Warden Umbra'kori | Temperate rainforest | Generic | walls, citadel, plaza, market | strong-majority |
| 145 | Haulshela | Watford | 1,616 | small-town | Darkhold | umbra-kori | Warden Umbra'kori | Temperate rainforest | Hunting | citadel, market | strong-majority |
| 114 | Sirdluven | Watford | 1,574 | small-town | Darkhold | umbra-kori | Warden Umbra'kori | Temperate rainforest | Hunting | plaza, market | strong-majority |

### Lumeshire — Lumeshirean Divine Empire

| ID | Settlement | Province | Population | Class | Source culture | Canonical/seed | Local branch | Biome | Role | Civic features | Province context |
|---:|---|---|---:|---|---|---|---|---|---|---|---|
| 45 | Bridbuton | Dodbridbia | 18,455 | city | Kentland | lumish | Tideward Lumish | Temperate rainforest | Naval; port | port, walls, citadel, temple, plaza, market | strong-majority |
| 413 | Torkley | Dodbridbia | 12,360 | large-town | Kentland | lumish | Tideward Lumish | Taiga | Naval; port | port, walls, citadel, temple, plaza, market | strong-majority |
| 294 | Bolcesterne | Dodbridbia | 7,231 | town | Kentland | lumish | Fortified Provincial Lumish | Temperate rainforest | Generic | walls, citadel, temple, plaza, market | strong-majority |
| 55 | Baltashes | Dodbridbia | 6,632 | town | Kentland | lumish | Tideward Lumish | Temperate rainforest | Naval; port | port, temple, market | strong-majority |
| 48 | Betonden | Dodbridbia | 1,928 | small-town | Kentland | lumish | Waterside Lumish | Temperate rainforest | Lake | citadel, temple, market | strong-majority |
| 197 | Bridford | Dodbridbia | 1,712 | small-town | Kentland | lumish | Shire Lumish | Temperate rainforest | Hunting | temple, plaza, market | strong-majority |
| 500 | Redchambe | Dodbridbia | 1,193 | small-town | Kentland | lumish | Tideward Lumish | Taiga | Naval; port | port, temple, market | strong-majority |
| 453 | Castryles | Dodbridbia | 1,168 | small-town | Kentland | lumish | Tideward Lumish | Taiga | Naval; port | port, citadel, temple, market | strong-majority |
| 4 | Winchwark | Dunwich | 38,543 | capital | Kentland | lumish | Imperial Heartlanders | Temperate rainforest | Naval; port | port, walls, citadel, temple, plaza, shanty, market | strong-majority |
| 52 | Teton | Dunwich | 25,045 | major-city | Kentland | lumish | Tideward Lumish | Temperate rainforest | Naval; port | port, walls, temple, plaza, shanty, market | strong-majority |
| 394 | Barwickwar | Dunwich | 16,478 | city | Kentland | lumish | Fortified Provincial Lumish | Temperate deciduous forest | Generic | walls, temple, plaza, market | strong-majority |
| 397 | Darford | Dunwich | 12,242 | large-town | Kentland | lumish | Fortified Provincial Lumish | Temperate rainforest | Generic | walls, temple, plaza, market | strong-majority |
| 303 | Altley | Dunwich | 11,978 | large-town | Kentland | lumish | Fortified Provincial Lumish | Temperate deciduous forest | Generic | walls, citadel, temple, market | strong-majority |
| 205 | Bernefordge | Dunwich | 11,540 | large-town | Kentland | lumish | Tideward Lumish | Temperate deciduous forest | Naval; port | port, walls, temple, plaza, market | strong-majority |
| 101 | Maltongay | Dunwich | 7,998 | town | Kentland | lumish | Shire Lumish | Temperate deciduous forest | Generic | temple, plaza, market | strong-majority |
| 420 | Hatbury | Dunwich | 7,744 | town | Kentland | lumish | Fortified Provincial Lumish | Temperate deciduous forest | Generic | citadel, temple, market | strong-majority |
| 50 | Wickleigh | Dunwich | 3,104 | town | Kentland | lumish | Tideward Lumish | Temperate deciduous forest | Naval; port | port, walls, temple, plaza, market | strong-majority |
| 20 | Readeham | Dunwich | 2,660 | small-town | Kentland | lumish | Fortified Provincial Lumish | Temperate rainforest | Hunting | walls, citadel, temple, plaza, market | strong-majority |
| 139 | Wentave | Dunwich | 2,506 | small-town | Kentland | lumish | Fortified Provincial Lumish | Temperate deciduous forest | Hunting | walls, temple, plaza, market | strong-majority |
| 393 | Bostonden | Dunwich | 1,974 | small-town | Kentland | lumish | Shire Lumish | Temperate deciduous forest | Hunting | temple, market | strong-majority |
| 165 | Albole | Dunwich | 1,822 | small-town | Kentland | lumish | Shire Lumish | Temperate deciduous forest | Hunting | temple, market | strong-majority |
| 251 | Lewenton | Dunwich | 1,819 | small-town | Kentland | lumish | Fortified Provincial Lumish | Temperate deciduous forest | Hunting | citadel, temple, plaza, market | strong-majority |
| 425 | Bundowey | Dunwich | 1,766 | small-town | Kentland | lumish | Shire Lumish | Temperate deciduous forest | Hunting | temple, market | strong-majority |
| 77 | Baltonor | Dunwich | 1,754 | small-town | Kentland | lumish | Fortified Provincial Lumish | Temperate deciduous forest | Hunting | citadel, temple, market | strong-majority |
| 269 | Prestowbig | Dunwich | 1,714 | small-town | Kentland | lumish | Shire Lumish | Temperate deciduous forest | Hunting | temple, market | strong-majority |
| 192 | Westry | Dunwich | 1,651 | small-town | Kentland | lumish | Shire Lumish | Temperate deciduous forest | Hunting | temple, market | strong-majority |
| 107 | Yeowenverbu | Dunwich | 1,614 | small-town | Kentland | lumish | Fortified Provincial Lumish | Temperate deciduous forest | Hunting | walls, temple, market | strong-majority |
| 76 | Brample | Dunwich | 1,604 | small-town | Kentland | lumish | Fortified Provincial Lumish | Temperate deciduous forest | Hunting | citadel, temple, market | strong-majority |
| 266 | Thetfordge | Felingham | 6,424 | town | Kentland | lumish | Shire Lumish | Temperate rainforest | Generic | temple, plaza, market | strong-majority |
| 424 | Watchester | Felingham | 6,167 | town | Kentland | lumish | Shire Lumish | Temperate rainforest | Generic | temple, plaza, market | strong-majority |
| 40 | Waringle | Felingham | 4,142 | town | Kentland | lumish | Tideward Lumish | Temperate rainforest | Naval; port | port, temple, market | strong-majority |
| 11 | Marlne | Felingham | 2,743 | small-town | Kentland | lumish | Tideward Lumish | Temperate rainforest | Naval; port | port, temple, market | strong-majority |
| 57 | Salewen | Hatbury | 13,944 | large-town | Kentland | lumish | Shire Lumish | Temperate deciduous forest | Generic | temple, plaza, market | mixed-majority |
| 240 | Persfordbu | Hatbury | 11,040 | large-town | Kentland | lumish | Fortified Provincial Lumish | Temperate deciduous forest | Generic | citadel, temple, plaza, market | mixed-majority |
| 289 | Balton | Hatbury | 8,695 | large-town | Kentland | lumish | Shire Lumish | Temperate rainforest | Generic | temple, market | mixed-majority |
| 193 | Shersbury | Hatbury | 7,034 | town | Kentland | lumish | Shire Lumish | Temperate rainforest | Generic | temple, market | mixed-majority |
| 400 | Walingra | Hatbury | 4,046 | town | Kentland | lumish | Shire Lumish | Temperate deciduous forest | Hunting | temple, market | mixed-majority |
| 140 | Uxbrighton | Hatbury | 3,592 | town | Kentland | lumish | Fortified Provincial Lumish | Temperate rainforest | Hunting | citadel, temple, market | mixed-majority |
| 463 | Pershead | Hatbury | 3,250 | town | Kentland | lumish | Fortified Provincial Lumish | Temperate deciduous forest | Hunting | walls, citadel, temple, market | mixed-majority |
| 208 | Korkrukh | Hatbury | 3,070 | town | Uruk | orc-peoples | Lumish March Orcs | Temperate rainforest | Hunting | temple, market | enclave; mixed-majority |
| 215 | Wickham | Hatbury | 2,653 | small-town | Kentland | lumish | Fortified Provincial Lumish | Temperate deciduous forest | Hunting | citadel, temple, market | mixed-majority |
| 108 | Hogurbak | Hatbury | 2,413 | small-town | Norheim | norths | Southern-Facing Norths | Temperate deciduous forest | Hunting | walls, citadel, temple, plaza, market | enclave; mixed-majority |
| 191 | Leighleach | Hatbury | 2,131 | small-town | Kentland | lumish | Shire Lumish | Temperate deciduous forest | Hunting | temple, plaza, market | mixed-majority |
| 164 | Stotford | Hatbury | 1,598 | small-town | Kentland | lumish | Fortified Provincial Lumish | Temperate deciduous forest | Hunting | citadel, temple, market | mixed-majority |
| 372 | Toteskirk | Kirlingdon | 36,394 | major-city | Kentland | lumish | Tideward Lumish | Temperate deciduous forest | Naval; port | port, walls, temple, plaza, shanty, market | strong-majority |
| 143 | Olworth | Kirlingdon | 24,024 | city | Kentland | lumish | Fortified Provincial Lumish | Temperate rainforest | Generic | walls, citadel, temple, plaza, shanty, market | strong-majority |
| 31 | Whitfordbu | Kirlingdon | 20,558 | city | Kentland | lumish | Fortified Provincial Lumish | Temperate deciduous forest | Generic | walls, citadel, temple, shanty, market | strong-majority |
| 136 | Burwickhamp | Kirlingdon | 19,425 | city | Kentland | lumish | Fortified Provincial Lumish | Temperate deciduous forest | Generic | citadel, temple, plaza, market | strong-majority |
| 217 | Gatester | Kirlingdon | 11,608 | large-town | Kentland | lumish | Fortified Provincial Lumish | Temperate rainforest | Generic | citadel, temple, market | strong-majority |
| 175 | Holtonsey | Kirlingdon | 11,034 | large-town | Kentland | lumish | Fortified Provincial Lumish | Temperate rainforest | Generic | walls, citadel, temple, market | strong-majority |
| 301 | Knutswesthe | Kirlingdon | 9,617 | large-town | Kentland | lumish | Fortified Provincial Lumish | Temperate deciduous forest | Generic | walls, citadel, temple, plaza, market | strong-majority |
| 228 | Pilton | Kirlingdon | 8,643 | large-town | Kentland | lumish | Fortified Provincial Lumish | Temperate deciduous forest | Generic | citadel, temple, market | strong-majority |
| 317 | Feltongay | Kirlingdon | 8,352 | large-town | Kentland | lumish | Shire Lumish | Temperate deciduous forest | Generic | temple, market | strong-majority |
| 46 | Stapingmo | Kirlingdon | 7,782 | town | Kentland | lumish | Tideward Lumish | Temperate rainforest | Naval; port | port, temple, plaza, market | strong-majority |
| 78 | Dunstabrigh | Kirlingdon | 7,547 | town | Kentland | lumish | Fortified Provincial Lumish | Temperate deciduous forest | Generic | walls, temple, market | strong-majority |
| 153 | Kingford | Kirlingdon | 7,344 | town | Kentland | lumish | Fortified Provincial Lumish | Temperate deciduous forest | Generic | walls, citadel, temple, plaza, market | strong-majority |
| 30 | Camble | Kirlingdon | 6,603 | town | Kentland | lumish | Fortified Provincial Lumish | Temperate deciduous forest | Generic | citadel, temple, market | strong-majority |
| 222 | Chilton | Kirlingdon | 3,336 | town | Kentland | lumish | Fortified Provincial Lumish | Temperate deciduous forest | Hunting | walls, temple, plaza, market | strong-majority |
| 150 | Causton | Kirlingdon | 2,713 | small-town | Kentland | lumish | Tideward Lumish | Temperate deciduous forest | Naval; port | port, citadel, temple, market | strong-majority |
| 117 | Rocheapton | Kirlingdon | 1,588 | small-town | Kentland | lumish | Shire Lumish | Temperate rainforest | Hunting | temple, market | strong-majority |
| 22 | Hornby | Lurymock | 28,763 | major-city | Kentland | lumish | Waterside Lumish | Temperate rainforest | Lake | walls, citadel, temple, market | strong-majority |
| 283 | Redchambe | Lurymock | 19,946 | city | Kentland | lumish | Tideward Lumish | Temperate rainforest | Naval; port | port, walls, citadel, temple, plaza, market | strong-majority |
| 233 | Thorningt | Lurymock | 12,975 | large-town | Kentland | lumish | Fortified Provincial Lumish | Temperate deciduous forest | Generic | walls, temple, plaza, market | strong-majority |
| 383 | Gatbutewich | Lurymock | 8,080 | large-town | Kentland | lumish | Fortified Provincial Lumish | Temperate rainforest | Generic | citadel, temple, market | strong-majority |
| 227 | Dodbrigh | Lurymock | 1,607 | small-town | Kentland | lumish | Fortified Provincial Lumish | Temperate rainforest | Hunting | walls, citadel, temple, plaza, market | strong-majority |
| 180 | Dudgeford | Manch | 23,056 | city | Kentland | lumish | Fortified Provincial Lumish | Temperate deciduous forest | Generic | walls, citadel, temple, market | strong-majority |
| 159 | Ormskirk | Manch | 15,837 | city | Kentland | lumish | Fortified Provincial Lumish | Temperate deciduous forest | Generic | walls, temple, plaza, market | strong-majority |
| 348 | Fenley | Manch | 14,825 | large-town | Kentland | lumish | Fortified Provincial Lumish | Temperate deciduous forest | Generic | citadel, temple, plaza, market | strong-majority |
| 260 | Babing | Manch | 13,072 | large-town | Kentland | lumish | Fortified Provincial Lumish | Temperate deciduous forest | Generic | walls, temple, plaza, market | strong-majority |
| 347 | Swararingmo | Manch | 8,947 | large-town | Kentland | lumish | Shire Lumish | Temperate deciduous forest | Generic | temple, market | strong-majority |
| 37 | Skiple | Manch | 6,001 | town | Kentland | lumish | Fortified Provincial Lumish | Temperate deciduous forest | Generic | citadel, temple, plaza, market | strong-majority |
| 16 | Fatontonton | Manch | 2,572 | small-town | Kentland | lumish | Tideward Lumish | Temperate deciduous forest | Naval; port | port, temple, market | strong-majority |
| 156 | Pentondeny | Manch | 1,782 | small-town | Kentland | lumish | Shire Lumish | Temperate deciduous forest | Hunting | temple, market | strong-majority |
| 211 | Dalseaton | Manch | 1,643 | small-town | Kentland | lumish | Fortified Provincial Lumish | Temperate deciduous forest | Hunting | citadel, temple, market | strong-majority |
| 68 | Norwick | Mitham | 10,119 | large-town | Kentland | lumish | Fortified Provincial Lumish | Temperate rainforest | Generic | walls, temple, plaza, market | strong-majority |
| 304 | Bodhurstbu | Mitham | 9,051 | large-town | Kentland | lumish | Fortified Provincial Lumish | Temperate deciduous forest | Generic | citadel, temple, plaza, market | strong-majority |
| 72 | Apseasal | Mitham | 4,794 | town | Kentland | lumish | Fortified Provincial Lumish | Temperate rainforest | Hunting | walls, citadel, temple, market | strong-majority |
| 209 | Hatford | Mitham | 3,557 | town | Kentland | lumish | Shire Lumish | Temperate rainforest | Hunting | temple, market | strong-majority |
| 373 | Ormstoreton | Mitham | 2,702 | small-town | Kentland | lumish | Tideward Lumish | Temperate rainforest | Naval; port | port, temple, market | strong-majority |
| 162 | Guildbury | Mitham | 2,509 | small-town | Kentland | lumish | Fortified Provincial Lumish | Temperate deciduous forest | Hunting | walls, citadel, temple, market | strong-majority |
| 24 | Harbotle | Mitham | 2,363 | small-town | Kentland | lumish | Tideward Lumish | Temperate rainforest | Naval; port | port, temple, market | strong-majority |
| 185 | Orzodh | Pyreaz | 25,314 | major-city | Uruk | orc-peoples | Lumish March Orcs | Temperate deciduous forest | Generic | walls, citadel, temple, market | plural-frontier |
| 452 | Chalk | Pyreaz | 19,969 | city | Darkspire | goblin-peoples | Lumish Border Goblins | Temperate rainforest | Generic | citadel, temple, plaza, market | enclave; plural-frontier |
| 433 | Vrur | Pyreaz | 17,073 | city | Uruk | orc-peoples | Lumish March Orcs | Temperate rainforest | Generic | walls, temple, plaza, market | plural-frontier |
| 399 | Bhia | Pyreaz | 4,339 | town | Darkspire | goblin-peoples | Lumish Border Goblins | Temperate deciduous forest | Hunting | citadel, temple, market | enclave; plural-frontier |
| 430 | Lexabusur | Pyreaz | 2,062 | small-town | Valarans | zuraldarr | Lexabusur Town Zuraldarr | Wetland | Generic | temple, market | enclave; plural-frontier |
| 300 | Fard | Pyreaz | 1,759 | small-town | Darkspire | goblin-peoples | Lumish Border Goblins | Temperate rainforest | Hunting | citadel, temple, market | enclave; plural-frontier |
| 207 | Graz | Pyreaz | 1,556 | small-town | Uruk | orc-peoples | Lumish March Orcs | Temperate rainforest | Hunting | temple, market | plural-frontier |
| 242 | Kington | Stothersia | 28,351 | major-city | Kentland | lumish | Fortified Provincial Lumish | Temperate rainforest | Generic | walls, temple, shanty, market | strong-majority |
| 14 | Towbone | Stothersia | 25,138 | major-city | Kentland | lumish | Tideward Lumish | Temperate deciduous forest | Naval; port | port, walls, citadel, temple, plaza, market | strong-majority |
| 91 | Fihul | Stothersia | 21,944 | city | Kentland | lumish | Fortified Provincial Lumish | Temperate deciduous forest | Generic | walls, citadel, temple, shanty, market | strong-majority |
| 234 | Cudford | Stothersia | 17,006 | city | Kentland | lumish | Fortified Provincial Lumish | Temperate deciduous forest | Generic | citadel, temple, plaza, market | strong-majority |
| 21 | Hatleham | Stothersia | 13,794 | large-town | Kentland | lumish | Tideward Lumish | Temperate deciduous forest | Naval; port | port, citadel, temple, market | strong-majority |
| 361 | Macury | Stothersia | 7,310 | town | Kentland | lumish | Fortified Provincial Lumish | Temperate rainforest | Generic | citadel, temple, market | strong-majority |
| 184 | Dudford | Stothersia | 6,203 | town | Kentland | lumish | Shire Lumish | Temperate deciduous forest | Generic | temple, market | strong-majority |
| 104 | Watheford | Stothersia | 5,081 | town | Kentland | lumish | Tideward Lumish | Temperate deciduous forest | Naval; port | port, temple, market | strong-majority |
| 183 | Cleoney | Stothersia | 4,608 | town | Kentland | lumish | Fortified Provincial Lumish | Temperate deciduous forest | Hunting | walls, citadel, temple, plaza, market | strong-majority |
| 27 | Hertford | Stothersia | 2,622 | small-town | Kentland | lumish | Tideward Lumish | Temperate deciduous forest | Naval; port | port, citadel, temple, plaza, market | strong-majority |
| 127 | Lympsbuton | Stothersia | 1,709 | small-town | Kentland | lumish | Shire Lumish | Temperate deciduous forest | Hunting | temple, market | strong-majority |
| 73 | Lympsfield | Stothersia | 1,675 | small-town | Kentland | lumish | Fortified Provincial Lumish | Temperate deciduous forest | Hunting | citadel, temple, plaza, market | strong-majority |
| 75 | Olneweskirk | Stothersia | 1,580 | small-town | Kentland | lumish | Fortified Provincial Lumish | Temperate deciduous forest | Hunting | walls, citadel, temple, market | strong-majority |

### Elenoria — Kingdom of Elenoria

| ID | Settlement | Province | Population | Class | Source culture | Canonical/seed | Local branch | Biome | Role | Civic features | Province context |
|---:|---|---|---:|---|---|---|---|---|---|---|---|
| 472 | Ellenemyuet | Bretland | 706 | named-village | Eldoria | elenori | Archive-Grove Elenori | Wetland | Generic | market | strong-majority |
| 499 | Ashlondra | Citria | 707 | named-village | Eldoria | elenori | Archive-Grove Elenori | Wetland | Generic | market | strong-majority |
| 273 | Himnanarith | Cort | 15,014 | city | Eldoria | elenori | Tidegrove Elenori | Temperate rainforest | Naval; port | port, walls, plaza, market | strong-majority |
| 71 | Mithmesesi | Cort | 9,889 | large-town | Eldoria | elenori | Tidegrove Elenori | Temperate deciduous forest | Naval; port | port, citadel, market | strong-majority |
| 439 | Onenya | Cort | 9,262 | large-town | Eldoria | elenori | Archive-Grove Elenori | Temperate rainforest | Generic | market | strong-majority |
| 144 | Thilmanat | Cort | 8,174 | large-town | Eldoria | elenori | Archive-Grove Elenori | Temperate rainforest | Generic | plaza, market | strong-majority |
| 237 | Indestheas | Cort | 4,263 | town | Eldoria | elenori | Ranger-Border Elenori | Temperate rainforest | Hunting | walls, plaza, market | strong-majority |
| 106 | Ishlumasalo | Cort | 1,544 | small-town | Eldoria | elenori | Ranger-Border Elenori | Temperate rainforest | Hunting | plaza, market | strong-majority |
| 465 | Thilsaluma | Cort | 900 | named-village | Eldoria | elenori | Ranger-Border Elenori | Taiga | Hunting | plaza, market | strong-majority |
| 82 | Machriondell | Courquilia | 17,136 | city | Eldoria | elenori | Tidegrove Elenori | Temperate rainforest | Naval; port | port, walls, citadel, plaza, market | strong-majority |
| 432 | Meethinde | Courquilia | 2,780 | small-town | Eldoria | elenori | Archive-Grove Elenori | Wetland | Generic | market | strong-majority |
| 65 | Tlauma | Courquilia | 1,886 | small-town | Eldoria | elenori | Ranger-Border Elenori | Temperate rainforest | Hunting | walls, citadel, plaza, market | strong-majority |
| 415 | Omasethan | Gilukkzar | 7,548 | town | Eldoria | elenori | Tidegrove Elenori | Taiga | Naval; port | port, citadel, market | strong-majority |
| 259 | Dretheas | Gilukkzar | 2,731 | small-town | Eldoria | elenori | Tidegrove Elenori | Wetland | Naval; port | port, market | strong-majority |
| 292 | Thenarienor | Gilukkzar | 1,707 | small-town | Eldoria | elenori | Tidegrove Elenori | Taiga | Naval; port | port, market | strong-majority |
| 377 | Jalssadrin | Gilukkzar | 1,363 | small-town | Eldoria | elenori | Ranger-Border Elenori | Taiga | Hunting | market | strong-majority |
| 408 | Thilhalon | Gilukkzar | 1,118 | small-town | Eldoria | elenori | Tidegrove Elenori | Taiga | Naval; port | port, walls, market | strong-majority |
| 64 | Nelmana | Ischia | 1,588 | small-town | Eldoria | elenori | Ranger-Border Elenori | Temperate rainforest | Hunting | citadel, market | strong-majority |
| 3 | Yuethelonana | Jarlingen | 21,673 | city | Eldoria | elenori | Tidegrove Elenori | Temperate rainforest | Naval; port | port, walls, citadel, temple, plaza, shanty, market | strong-majority |
| 1 | Lyalofeluma | Jarlingen | 14,468 | capital | Eldoria | elenori | Royal-Grove Elenori | Wetland | Naval; port | port, walls, citadel, plaza, market | strong-majority |
| 8 | Lellortheas | Jarlingen | 9,908 | large-town | Eldoria | elenori | Archive-Grove Elenori | Temperate rainforest | Generic | market | strong-majority |
| 2 | Sylnenor | Jarlingen | 3,674 | town | Eldoria | elenori | Ranger-Border Elenori | Temperate rainforest | Hunting | walls, market | strong-majority |
| 346 | Umenofenelu | Khatharbh | 2,789 | small-town | Eldoria | elenori | Tidegrove Elenori | Wetland | Naval; port | port, market | strong-majority |
| 219 | Amsenase | Mazaglia | 14,629 | large-town | Eldoria | elenori | Archive-Grove Elenori | Temperate rainforest | Generic | plaza, market | strong-majority |
| 246 | Thynead-Sin | Nazar | 1,588 | small-town | Eldoria | elenori | Ranger-Border Elenori | Taiga | Hunting | market | strong-majority |
| 281 | Linemyhe | Nazar | 1,345 | small-town | Eldoria | elenori | Ranger-Border Elenori | Taiga | Hunting | citadel, market | strong-majority |
| 74 | Eshlond | Pareanoville | 15,629 | city | Eldoria | elenori | Archive-Grove Elenori | Temperate rainforest | Generic | walls, market | strong-majority |
| 133 | Lindra | Pareanoville | 8,039 | large-town | Eldoria | elenori | Archive-Grove Elenori | Temperate rainforest | Generic | citadel, market | strong-majority |
| 5 | Lefran | Pareanoville | 6,867 | town | Eldoria | elenori | Tidegrove Elenori | Temperate rainforest | Naval; port | port, walls, market | strong-majority |
| 28 | Lahilmethyr | Pareanoville | 4,879 | town | Eldoria | elenori | Tidegrove Elenori | Temperate rainforest | Naval; port | port, walls, citadel, market | strong-majority |
| 206 | Ollsrion | Pareanoville | 1,483 | small-town | Eldoria | elenori | Ranger-Border Elenori | Temperate rainforest | Hunting | market | strong-majority |
| 306 | Innssadrin | Santenia | 23,863 | city | Eldoria | elenori | Tidegrove Elenori | Wetland | Naval; port | port, walls, plaza, shanty, market | strong-majority |
| 353 | Dranleanlene | Santenia | 10,516 | large-town | Eldoria | elenori | Archive-Grove Elenori | Wetland | Generic | walls, plaza, market | strong-majority |
| 310 | Olhanathei | Santenia | 4,884 | town | Eldoria | elenori | Ranger-Border Elenori | Temperate rainforest | Hunting | walls, market | strong-majority |
| 47 | Himlarran | Santenia | 1,890 | small-town | Eldoria | elenori | Ranger-Border Elenori | Temperate rainforest | Hunting | citadel, market | strong-majority |
| 297 | Ullhoninerin | Santenia | 1,844 | small-town | Eldoria | elenori | Ranger-Border Elenori | Temperate rainforest | Hunting | citadel, market | strong-majority |
| 249 | Iulillelion | Santenia | 1,705 | small-town | Eldoria | elenori | Ranger-Border Elenori | Temperate rainforest | Hunting | citadel, market | strong-majority |
| 309 | Wlarenneas | Santenia | 1,672 | small-town | Eldoria | elenori | Ranger-Border Elenori | Temperate rainforest | Hunting | walls, citadel, market | strong-majority |
| 93 | Themarmel | Santenia | 1,609 | small-town | Eldoria | elenori | Ranger-Border Elenori | Temperate rainforest | Hunting | plaza, market | strong-majority |
| 324 | Eltenyalin | Santenia | 1,296 | small-town | Eldoria | elenori | Archive-Grove Elenori | Wetland | Generic | citadel, market | strong-majority |
| 255 | Ullana | Senvil | 21,429 | city | Eldoria | elenori | Lake Elenori | Temperate rainforest | Lake | citadel, plaza, market | strong-majority |
| 173 | Efranthyr | Senvil | 9,981 | large-town | Eldoria | elenori | Archive-Grove Elenori | Temperate rainforest | Generic | market | strong-majority |
| 427 | Ullean | Senvil | 9,446 | large-town | Eldoria | elenori | Lake Elenori | Wetland | Lake | plaza, market | strong-majority |
| 264 | Keathindemar | Senvil | 8,794 | large-town | Eldoria | elenori | Archive-Grove Elenori | Temperate rainforest | Generic | citadel, market | strong-majority |
| 195 | Anorranntyr | Senvil | 8,522 | large-town | Eldoria | elenori | Tidegrove Elenori | Temperate rainforest | Naval; port | port, citadel, market | strong-majority |
| 403 | Ormelve | Senvil | 8,199 | large-town | Eldoria | elenori | Archive-Grove Elenori | Taiga | Generic | citadel, plaza, market | strong-majority |
| 169 | Himlari | Senvil | 5,041 | town | Eldoria | elenori | Ranger-Border Elenori | Taiga | Hunting | citadel, market | strong-majority |
| 462 | Nelaselosea | Senvil | 4,475 | town | Eldoria | elenori | Ranger-Border Elenori | Taiga | Hunting | citadel, market | strong-majority |
| 250 | Eterius | Senvil | 1,769 | small-town | Eldoria | elenori | Ranger-Border Elenori | Temperate rainforest | Hunting | plaza, market | strong-majority |
| 161 | Iumenor | Senvil | 1,639 | small-town | Eldoria | elenori | Ranger-Border Elenori | Temperate deciduous forest | Hunting | plaza, market | strong-majority |
| 213 | Thaquasadi | Senvil | 1,484 | small-town | Eldoria | elenori | Ranger-Border Elenori | Temperate rainforest | Hunting | market | strong-majority |
| 352 | Nealean | Senvil | 1,472 | small-town | Eldoria | elenori | Ranger-Border Elenori | Taiga | Hunting | market | strong-majority |
| 402 | Rymamargor | Senvil | 1,117 | small-town | Eldoria | elenori | Ranger-Border Elenori | Taiga | Hunting | market | strong-majority |
| 354 | Hlurtherise | Senvil | 1,002 | small-town | Eldoria | elenori | Ranger-Border Elenori | Taiga | Hunting | citadel, market | strong-majority |
| 25 | Jalfa | Vilter | 15,496 | city | Eldoria | elenori | Tidegrove Elenori | Temperate rainforest | Naval; port | port, walls, plaza, market | strong-majority |
| 395 | Onemar | Vilter | 13,652 | large-town | Eldoria | elenori | Archive-Grove Elenori | Temperate deciduous forest | Generic | citadel, plaza, market | strong-majority |
| 152 | Neanalosthas | Vilter | 8,748 | large-town | Eldoria | elenori | Archive-Grove Elenori | Temperate rainforest | Generic | citadel, plaza, market | strong-majority |
| 386 | Matheas | Vilter | 7,840 | town | Eldoria | elenori | Archive-Grove Elenori | Temperate rainforest | Generic | plaza, market | strong-majority |
| 15 | Felnesine | Vilter | 7,124 | town | Eldoria | elenori | Lake Elenori | Temperate deciduous forest | Lake | citadel, market | strong-majority |
| 39 | Ulluna | Vilter | 4,488 | town | Eldoria | elenori | Ranger-Border Elenori | Temperate deciduous forest | Hunting | walls, citadel, market | strong-majority |
| 286 | Doranalandhe | Vilter | 4,017 | town | Eldoria | elenori | Ranger-Border Elenori | Temperate rainforest | Hunting | citadel, plaza, market | strong-majority |
| 53 | Shemnashesi | Vilter | 2,618 | small-town | Eldoria | elenori | Tidegrove Elenori | Temperate deciduous forest | Naval; port | port, citadel, plaza, market | strong-majority |
| 262 | Cyranderius | Vilter | 2,183 | small-town | Eldoria | elenori | Lake Elenori | Temperate deciduous forest | Lake | market | strong-majority |
| 134 | Sellean | Vilter | 1,769 | small-town | Eldoria | elenori | Ranger-Border Elenori | Temperate deciduous forest | Hunting | citadel, market | strong-majority |
| 229 | Nioress | Vilter | 1,670 | small-town | Eldoria | elenori | Ranger-Border Elenori | Temperate deciduous forest | Hunting | citadel, market | strong-majority |

### Ironpeak — Mountain Kingdom of Stonehold

| ID | Settlement | Province | Population | Class | Source culture | Canonical/seed | Local branch | Biome | Role | Civic features | Province context |
|---:|---|---|---:|---|---|---|---|---|---|---|---|
| 422 | Zrazzed | Dunsfield | 8,408 | large-town | Uruk | orc-peoples | Ironpeak Contract Orcs | Wetland | Naval; port | port, walls, market | enclave; mixed-majority |
| 49 | Bizarbar | Dunsfield | 7,059 | capital | Durinheim | vondari | Crown-Forge Vondari | Temperate rainforest | Naval; port | port, walls, citadel, market | mixed-majority |
| 401 | Zaled | Dunsfield | 5,943 | town | Durinheim | vondari | Deep-Hall Vondari | Taiga | Lake | market | mixed-majority |
| 118 | Kilarar | Emasingsbu | 32,366 | major-city | Durinheim | vondari | Deep-Hall Vondari | Temperate rainforest | Generic | walls, plaza, market | strong-majority |
| 398 | Gundinzar | Emasingsbu | 10,626 | large-town | Durinheim | vondari | Surface-Gate Vondari | Wetland | Naval; port | port, citadel, market | strong-majority |
| 109 | Shiz | Emasingsbu | 9,729 | large-town | Durinheim | vondari | Deep-Hall Vondari | Temperate rainforest | Generic | market | strong-majority |
| 371 | Nulnabiln | Emasingsbu | 2,795 | small-town | Durinheim | vondari | Surface-Gate Vondari | Temperate rainforest | Naval; port | port, citadel, plaza, market | strong-majority |
| 87 | Binarg | Emasingsbu | 2,201 | small-town | Durinheim | vondari | Survey Vondari | Temperate rainforest | Hunting | market | strong-majority |
| 349 | Nunarg | Emasingsbu | 2,148 | small-town | Durinheim | vondari | Survey Vondari | Temperate rainforest | Hunting | citadel, market | strong-majority |
| 345 | Khunzad | Emasingsbu | 1,438 | small-town | Durinheim | vondari | Surface-Gate Vondari | Taiga | Naval; port | port, market | strong-majority |
| 461 | Kharb | Emasingsbu | 1,147 | small-town | Durinheim | vondari | Surface-Gate Vondari | Wetland | Naval; port | port, citadel, market | strong-majority |
| 435 | Bhirkiz | Garam | 3,602 | town | Uruk | orc-peoples | Ironpeak Contract Orcs | Taiga | Naval; port | port, market | strong-majority |
| 390 | Gidh | Kehamney | 9,394 | large-town | Uruk | orc-peoples | Ironpeak Contract Orcs | Taiga | Naval; port | port, walls, citadel, market | strong-majority |
| 431 | Zordin | Kehamney | 848 | named-village | Uruk | orc-peoples | Ironpeak Contract Orcs | Taiga | Hunting | market | strong-majority |
| 429 | Zibuled | New Tetford | 14,179 | large-town | Durinheim | vondari | Deep-Hall Vondari | Wetland | Generic | citadel, market | strong-majority |
| 54 | Shiz | New Tetford | 14,171 | large-town | Durinheim | vondari | Deep-Hall Vondari | Temperate rainforest | Generic | plaza, market | strong-majority |
| 88 | Shuzanbund | New Tetford | 9,055 | large-town | Durinheim | vondari | Deep-Hall Vondari | Temperate rainforest | Generic | market | strong-majority |
| 340 | Zaddush | New Tetford | 5,055 | town | Durinheim | vondari | Deep-Hall Vondari | Temperate rainforest | Hunting | market | strong-majority |
| 407 | Zaragzad | New Tetford | 4,124 | town | Durinheim | vondari | Deep-Hall Vondari | Temperate rainforest | Hunting | citadel, market | strong-majority |
| 112 | Sschizex | Rothton | 6,359 | town | Darkhold | umbra-kori | Surface-Enclave Umbra'kori | Temperate rainforest | Generic | citadel, market | strong-majority |
| 252 | Abaram | Treillons | 13,662 | large-town | Durinheim | vondari | Deep-Hall Vondari | Temperate rainforest | Generic | plaza, market | mixed-majority |
| 160 | Nulbamunz | Treillons | 5,195 | town | Durinheim | vondari | Deep-Hall Vondari | Temperate rainforest | Hunting | market | mixed-majority |
| 253 | Luzar | Treillons | 1,652 | small-town | Uruk | orc-peoples | Ironpeak Contract Orcs | Taiga | Naval; port | port, market | enclave; mixed-majority |

### Grukmar — Grukmar Tribes

| ID | Settlement | Province | Population | Class | Source culture | Canonical/seed | Local branch | Biome | Role | Civic features | Province context |
|---:|---|---|---:|---|---|---|---|---|---|---|---|
| 267 | Kas | Benia | 14,203 | large-town | Darkspire | goblin-peoples | Grukmar Goblin Town Networks | Taiga | Generic | citadel, plaza, market | plural-frontier |
| 384 | Sioshaila | Benia | 11,828 | large-town | Darkspire | goblin-peoples | Grukmar Goblin Town Networks | Taiga | Generic | walls, citadel, market | plural-frontier |
| 459 | Blusee | Benia | 9,155 | large-town | Darkspire | goblin-peoples | Grukmar Goblin Town Networks | Taiga | Generic | plaza, market | plural-frontier |
| 454 | Qaqesned | Benia | 8,930 | large-town | Rakhnid | rakhnid-broods | Grukmar Rakhnid Broods | Taiga | Generic | citadel, market | enclave; plural-frontier |
| 428 | Klear | Benia | 5,422 | town | Darkspire | goblin-peoples | Grukmar Goblin Town Networks | Taiga | Hunting | citadel, market | plural-frontier |
| 458 | Joim | Benia | 868 | named-village | Darkspire | goblin-peoples | Grukmar Goblin Town Networks | Taiga | Hunting | walls, citadel, market | plural-frontier |
| 449 | Chix | Cockingham | 8,925 | large-town | Rakhnid | rakhnid-broods | Grukmar Rakhnid Broods | Taiga | Naval; port | port, walls, plaza, market | enclave; plural-frontier |
| 364 | Chol | Cockingham | 7,915 | town | Rakhnid | rakhnid-broods | Grukmar Rakhnid Broods | Taiga | Generic | market | enclave; plural-frontier |
| 392 | Velwen | Cockingham | 7,661 | town | Darkhold | umbra-kori | Surface-Enclave Umbra'kori | Taiga | Naval; port | port, citadel, market | plural-frontier |
| 282 | Brur | Cockingham | 3,894 | town | Uruk | orc-peoples | Grukmar Orc Clans and Towns | Taiga | Naval; port | port, citadel, market | enclave; plural-frontier |
| 335 | Dighakh | Cockingham | 1,730 | small-town | Uruk | orc-peoples | Grukmar Orc Clans and Towns | Taiga | Naval; port | port, citadel, market | enclave; plural-frontier |
| 358 | Qeqashuth | Cockingham | 1,224 | small-town | Rakhnid | rakhnid-broods | Grukmar Rakhnid Broods | Taiga | Naval; port | port, market | enclave; plural-frontier |
| 440 | Thyvariolavet | Cockingham | 1,173 | small-town | Darkhold | umbra-kori | Surface-Enclave Umbra'kori | Taiga | Naval; port | port, walls, plaza, market | plural-frontier |
| 343 | Zribagh | Cockingham | 957 | named-village | Uruk | orc-peoples | Grukmar Orc Clans and Towns | Taiga | Hunting | market | enclave; plural-frontier |
| 414 | Ulbazzez | Dunscombe | 5,384 | town | Uruk | orc-peoples | Grukmar Orc Clans and Towns | Taiga | Naval; port | port, citadel, market | plural-frontier |
| 357 | Hovarhir | Dunscombe | 3,853 | town | Rakhnid | rakhnid-broods | Grukmar Rakhnid Broods | Taiga | Lake | citadel, plaza, market | enclave; plural-frontier |
| 471 | Broghukh | Dunscombe | 725 | named-village | Uruk | orc-peoples | Grukmar Orc Clans and Towns | Taiga | Hunting | walls, market | plural-frontier |
| 298 | Styrdeek | Fercilter | 3,555 | town | Darkspire | goblin-peoples | Grukmar Goblin Town Networks | Temperate deciduous forest | Naval; port | port, citadel, plaza, market | strong-majority |
| 409 | Prolhob | Khunul | 1,846 | small-town | Darkspire | goblin-peoples | Grukmar Goblin Town Networks | Taiga | Naval; port | port, market | strong-majority |
| 320 | Qeenis | Khuzanzar | 5,094 | town | Darkspire | goblin-peoples | Grukmar Goblin Town Networks | Taiga | Naval; port | port, citadel, market | mixed-majority |
| 308 | Stiaghel | Nakinbhur | 1,106 | small-town | Darkspire | goblin-peoples | Grukmar Goblin Town Networks | Wetland | Generic | market | strong-majority |
| 332 | Uld | Narukthar | 12,388 | large-town | Uruk | orc-peoples | Grukmar Orc Clans and Towns | Taiga | Generic | walls, plaza, market | strong-majority |
| 451 | Gholkin | Narukthar | 10,463 | large-town | Uruk | orc-peoples | Grukmar Orc Clans and Towns | Wetland | Naval; port | port, walls, citadel, plaza, market | strong-majority |
| 342 | Chaz | Narukthar | 8,996 | large-town | Uruk | orc-peoples | Grukmar Orc Clans and Towns | Taiga | Lake | market | strong-majority |
| 404 | Ghag | Narukthar | 2,659 | small-town | Uruk | orc-peoples | Grukmar Orc Clans and Towns | Taiga | Hunting | market | strong-majority |
| 487 | Brurkug | Narukthar | 2,496 | small-town | Uruk | orc-peoples | Grukmar Orc Clans and Towns | Taiga | Lake | market | strong-majority |
| 380 | Bogril | Narukthar | 2,365 | small-town | Uruk | orc-peoples | Grukmar Orc Clans and Towns | Taiga | Naval; port | port, market | strong-majority |
| 43 | Mugrord | Narukthar | 2,250 | small-town | Uruk | orc-peoples | Grukmar Orc Clans and Towns | Taiga | Hunting | citadel, market | strong-majority |
| 247 | Egvukh | Narukthar | 1,296 | small-town | Uruk | orc-peoples | Grukmar Orc Clans and Towns | Taiga | Hunting | walls, citadel, plaza, market | strong-majority |
| 199 | Zigbigbig | Nazar | 19,077 | city | Darkspire | goblin-peoples | Grukmar Goblin Town Networks | Taiga | Naval; port | port, walls, plaza, market | mixed-majority |
| 445 | Vrea | Nazar | 10,344 | large-town | Darkspire | goblin-peoples | Grukmar Goblin Town Networks | Taiga | Generic | walls, citadel, plaza, market | mixed-majority |
| 278 | Watmelt | Nazar | 9,278 | large-town | Darkspire | goblin-peoples | Grukmar Goblin Town Networks | Taiga | Naval; port | port, walls, citadel, plaza, market | mixed-majority |
| 412 | Moftvielx | Nazar | 8,113 | large-town | Darkspire | goblin-peoples | Grukmar Goblin Town Networks | Taiga | Naval; port | port, citadel, market | mixed-majority |
| 457 | Sleh | Nazar | 6,803 | town | Darkspire | goblin-peoples | Grukmar Goblin Town Networks | Taiga | Generic | plaza, market | mixed-majority |
| 341 | Chox | Nazar | 1,855 | small-town | Darkspire | goblin-peoples | Grukmar Goblin Town Networks | Taiga | Hunting | walls, citadel, market | mixed-majority |
| 331 | Stryt | Nazar | 1,530 | small-town | Darkspire | goblin-peoples | Grukmar Goblin Town Networks | Taiga | Naval; port | port, market | mixed-majority |
| 327 | Modh | New Darania | 5,284 | town | Uruk | orc-peoples | Grukmar Orc Clans and Towns | Wetland | Generic | market | strong-majority |
| 475 | Bodrush | New Darania | 3,412 | town | Uruk | orc-peoples | Grukmar Orc Clans and Towns | Wetland | Generic | market | strong-majority |
| 12 | Glam | Shundu | 9,018 | capital | Darkspire | goblin-peoples | Grukmar Goblin Town Networks | Taiga | Generic | walls, citadel, market | strong-majority |
| 488 | Zriokots | Shundu | 5,805 | town | Darkspire | goblin-peoples | Grukmar Goblin Town Networks | Taiga | Hunting | plaza, market | strong-majority |
| 441 | Chiafta | Shundu | 4,916 | town | Darkspire | goblin-peoples | Grukmar Goblin Town Networks | Taiga | Naval; port | port, citadel, plaza, market | strong-majority |
| 490 | Uthasinx | Shundu | 4,590 | town | Darkspire | goblin-peoples | Grukmar Goblin Town Networks | Taiga | Hunting | citadel, market | strong-majority |
| 381 | Nilkeh | Shundu | 4,543 | town | Darkspire | goblin-peoples | Grukmar Goblin Town Networks | Taiga | Hunting | market | strong-majority |
| 492 | Sioshaila | Shundu | 3,135 | town | Darkspire | goblin-peoples | Grukmar Goblin Town Networks | Wetland | Generic | walls, citadel, market | strong-majority |
| 243 | Joim | Shundu | 1,870 | small-town | Darkspire | goblin-peoples | Grukmar Goblin Town Networks | Taiga | Hunting | citadel, market | strong-majority |
| 502 | Sios | Shundu | 1,424 | small-town | Darkspire | goblin-peoples | Grukmar Goblin Town Networks | Taiga | Naval; port | port, plaza, market | strong-majority |
| 367 | Stiolsirt | Shundu | 1,092 | small-town | Darkspire | goblin-peoples | Grukmar Goblin Town Networks | Taiga | Naval; port | port, citadel, market | strong-majority |
| 379 | Elfirth | Southesho | 9,605 | large-town | Yotunn | jotunn | Grukmar Jotunn Holds | Taiga | Naval; port | port, market | enclave; plural-frontier |
| 326 | Stiol | Southesho | 4,133 | town | Darkspire | goblin-peoples | Grukmar Goblin Town Networks | Taiga | Hunting | plaza, market | plural-frontier |
| 450 | Grimtibi | Southesho | 1,158 | small-town | Yotunn | jotunn | Grukmar Jotunn Holds | Wetland | Naval; port | port, market | enclave; plural-frontier |
| 405 | Klear | Southesho | 1,068 | small-town | Darkspire | goblin-peoples | Grukmar Goblin Town Networks | Wetland | Generic | market | plural-frontier |
| 473 | Bukex | Southesho | 751 | named-village | Darkspire | goblin-peoples | Grukmar Goblin Town Networks | Taiga | Hunting | walls, plaza, market | plural-frontier |
| 501 | Girkanbane | Southesho | 697 | named-village | Yotunn | jotunn | Grukmar Jotunn Holds | Taiga | Hunting | walls, citadel, plaza, market | enclave; plural-frontier |
| 220 | Zulbrul | Towbomer | 17,013 | city | Uruk | orc-peoples | Grukmar Orc Clans and Towns | Temperate rainforest | Generic | citadel, plaza, market | strong-majority |
| 148 | Qidadh | Towbomer | 14,443 | large-town | Uruk | orc-peoples | Grukmar Orc Clans and Towns | Temperate deciduous forest | Generic | walls, citadel, market | strong-majority |
| 231 | Zigrodri | Towbomer | 7,843 | town | Uruk | orc-peoples | Grukmar Orc Clans and Towns | Temperate deciduous forest | Naval; port | port, walls, citadel, market | strong-majority |
| 338 | Wroggek | Ulnulbizi | 13,542 | large-town | Darkspire | goblin-peoples | Grukmar Goblin Town Networks | Taiga | Naval; port | port, walls, plaza, market | strong-majority |
| 248 | Stuik | Ulnulbizi | 11,113 | large-town | Darkspire | goblin-peoples | Grukmar Goblin Town Networks | Taiga | Generic | walls, citadel, market | strong-majority |
| 446 | Rekx | Ulnulbizi | 6,210 | town | Darkspire | goblin-peoples | Grukmar Goblin Town Networks | Taiga | Generic | market | strong-majority |
| 276 | Bresheaf | Ulnulbizi | 3,810 | town | Darkspire | goblin-peoples | Grukmar Goblin Town Networks | Taiga | Hunting | citadel, plaza, market | strong-majority |
| 443 | Utiarm | Ulnulbizi | 966 | named-village | Darkspire | goblin-peoples | Grukmar Goblin Town Networks | Taiga | Hunting | market | strong-majority |
| 498 | Chiaf | Ulnulbizi | 752 | named-village | Darkspire | goblin-peoples | Grukmar Goblin Town Networks | Taiga | Hunting | plaza, market | strong-majority |

### Frostgard — Empire of Frostgard

| ID | Settlement | Province | Population | Class | Source culture | Canonical/seed | Local branch | Biome | Role | Civic features | Province context |
|---:|---|---|---:|---|---|---|---|---|---|---|---|
| 155 | Hofngiver | Anland | 17,299 | city | Norheim | norths | Inland Hall Norths | Temperate rainforest | Generic | plaza, market | strong-majority |
| 312 | Austrand | Anland | 12,685 | large-town | Norheim | norths | Inland Hall Norths | Temperate rainforest | Generic | walls, citadel, market | strong-majority |
| 85 | Braufar | Anland | 7,810 | town | Norheim | norths | Inland Hall Norths | Temperate rainforest | Generic | citadel, market | strong-majority |
| 23 | Tvervobyg | Anland | 7,286 | town | Norheim | norths | Inland Hall Norths | Temperate rainforest | Generic | walls, market | strong-majority |
| 339 | Silvikken | Anland | 5,436 | town | Norheim | norths | Inland Hall Norths | Temperate deciduous forest | Hunting | market | strong-majority |
| 201 | Eikalero | Anland | 2,650 | small-town | Norheim | norths | Sea-Road Norths | Temperate rainforest | Naval; port | port, market | strong-majority |
| 125 | Lopskar | Atfordbia | 10,888 | large-town | Norheim | norths | Sea-Road Norths | Temperate rainforest | Naval; port | port, walls, plaza, market | strong-majority |
| 7 | Lonsnesber | Atfordbia | 9,805 | capital | Norheim | norths | Crown Hall Norths | Temperate rainforest | Naval; port | port, walls, citadel, plaza, market | strong-majority |
| 351 | Hellan | Atfordbia | 9,442 | large-town | Norheim | norths | Inland Hall Norths | Temperate rainforest | Generic | market | strong-majority |
| 305 | Haumen | Atfordbia | 9,216 | large-town | Norheim | norths | Inland Hall Norths | Temperate deciduous forest | Generic | market | strong-majority |
| 389 | Drangdak | Atfordbia | 6,795 | town | Norheim | norths | Inland Hall Norths | Temperate rainforest | Generic | walls, citadel, market | strong-majority |
| 128 | Kjersbak | Atfordbia | 6,478 | town | Norheim | norths | Inland Hall Norths | Temperate rainforest | Generic | walls, market | strong-majority |
| 41 | Stokkvik | Atfordbia | 6,112 | town | Norheim | norths | Inland Hall Norths | Temperate rainforest | Generic | walls, citadel, market | strong-majority |
| 166 | Vikroya | Atfordbia | 1,662 | small-town | Norheim | norths | Inland Hall Norths | Temperate deciduous forest | Hunting | walls, citadel, market | strong-majority |
| 406 | Bokurdalde | Dinez | 13,394 | large-town | Norheim | norths | Inland Hall Norths | Temperate rainforest | Generic | plaza, market | strong-majority |
| 244 | Sleroyave | Dinez | 12,936 | large-town | Norheim | norths | Inland Hall Norths | Temperate rainforest | Generic | walls, citadel, market | strong-majority |
| 321 | Setnes | Dinez | 4,042 | town | Norheim | norths | Inland Hall Norths | Temperate rainforest | Hunting | citadel, market | strong-majority |
| 174 | Fjerdisaf | Dinez | 1,639 | small-town | Norheim | norths | Inland Hall Norths | Temperate rainforest | Hunting | market | strong-majority |
| 81 | Meroya | Hatbury | 21,750 | city | Norheim | norths | Inland Hall Norths | Temperate deciduous forest | Generic | walls, temple, shanty, market | strong-majority |
| 33 | Bjerver | Hatbury | 8,479 | large-town | Norheim | norths | Inland Hall Norths | Temperate deciduous forest | Generic | walls, plaza, market | strong-majority |
| 110 | Sellurbak | Hatbury | 3,835 | town | Norheim | norths | Inland Hall Norths | Temperate deciduous forest | Hunting | market | strong-majority |
| 111 | Gjenesberg | Hatbury | 2,824 | small-town | Norheim | norths | Inland Hall Norths | Temperate deciduous forest | Hunting | walls, plaza, market | strong-majority |
| 271 | Garkalur | Hatbury | 1,685 | small-town | Norheim | norths | Inland Hall Norths | Temperate deciduous forest | Hunting | walls, market | strong-majority |
| 194 | Hafjor | Hatbury | 1,621 | small-town | Norheim | norths | Inland Hall Norths | Temperate deciduous forest | Hunting | plaza, market | strong-majority |
| 421 | Soforsmoen | New Noria | 1,946 | small-town | Norheim | norths | Sea-Road Norths | Wetland | Naval; port | port, walls, citadel, market | strong-majority |
| 59 | Vigkangord | Noria | 17,606 | city | Yotunn | jotunn | Frostgard Treaty Jotunn | Temperate rainforest | Generic | plaza, market | mixed-majority |
| 272 | Sannes | Noria | 3,561 | town | Norheim | norths | Giant-Border Norths | Temperate rainforest | Hunting | citadel, market | enclave; mixed-majority |
| 116 | Rurgatho | Noria | 1,574 | small-town | Yotunn | jotunn | Frostgard Treaty Jotunn | Temperate rainforest | Hunting | walls, market | mixed-majority |
| 171 | Klakki | Shatharake | 22,271 | city | Norheim | norths | Inland Hall Norths | Temperate rainforest | Generic | walls, plaza, market | strong-majority |
| 151 | Bringnan | Shatharake | 20,577 | city | Norheim | norths | Inland Hall Norths | Temperate rainforest | Generic | walls, citadel, market | strong-majority |
| 36 | Eykengar | Shatharake | 19,728 | city | Norheim | norths | Sea-Road Norths | Temperate rainforest | Naval; port | port, walls, plaza, market | strong-majority |
| 241 | Sundengen | Shatharake | 7,038 | town | Norheim | norths | Inland Hall Norths | Temperate rainforest | Generic | citadel, market | strong-majority |
| 223 | Innhalur | Shatharake | 2,617 | small-town | Norheim | norths | Sea-Road Norths | Temperate rainforest | Naval; port | port, citadel, market | strong-majority |
| 94 | Brudarvo | Shatharake | 1,529 | small-town | Norheim | norths | Inland Hall Norths | Temperate rainforest | Hunting | citadel, plaza, market | strong-majority |
| 355 | Durisch | Solehambe | 4,086 | town | Schwarzlicht | contian | Contian Diaspora | Temperate rainforest | Naval; port | port, market | strong-majority |
| 287 | Keflabygd | Whitlere | 30,491 | major-city | Norheim | norths | Sea-Road Norths | Temperate rainforest | Naval; port | port, walls, plaza, market | strong-majority |
| 34 | Djudanes | Whitlere | 22,722 | city | Norheim | norths | Sea-Road Norths | Temperate rainforest | Naval; port | port, walls, temple, shanty, market | strong-majority |
| 391 | Bilfostad | Whitlere | 18,376 | city | Norheim | norths | Inland Hall Norths | Temperate rainforest | Generic | walls, citadel, plaza, market | strong-majority |
| 221 | Gopavikjar | Whitlere | 15,379 | city | Norheim | norths | Inland Hall Norths | Temperate rainforest | Generic | citadel, market | strong-majority |
| 323 | Ekurnavo | Whitlere | 14,435 | large-town | Norheim | norths | Inland Hall Norths | Temperate rainforest | Generic | citadel, market | strong-majority |
| 190 | Hvenes | Whitlere | 9,542 | large-town | Norheim | norths | Inland Hall Norths | Temperate rainforest | Generic | citadel, market | strong-majority |
| 302 | Thorsver | Whitlere | 8,340 | large-town | Norheim | norths | Inland Hall Norths | Temperate rainforest | Generic | citadel, market | strong-majority |
| 168 | Nehamn | Whitlere | 3,613 | town | Norheim | norths | Inland Hall Norths | Temperate rainforest | Hunting | walls, market | strong-majority |
| 362 | Stokkafjor | Whitlere | 1,763 | small-town | Norheim | norths | Inland Hall Norths | Temperate rainforest | Hunting | market | strong-majority |
| 170 | Naric | Winchia | 17,499 | city | Yotunn | jotunn | Frostgard Treaty Jotunn | Temperate rainforest | Generic | walls, citadel, plaza, market | strong-majority |
| 466 | Akinb | Winchia | 8,187 | large-town | Yotunn | jotunn | Frostgard Treaty Jotunn | Wetland | Generic | citadel, plaza, market | strong-majority |
| 275 | Kozigkiz | Winchia | 3,938 | town | Yotunn | jotunn | Frostgard Treaty Jotunn | Temperate rainforest | Hunting | market | strong-majority |
| 44 | Dagddam | Winchia | 1,887 | small-town | Yotunn | jotunn | Frostgard Treaty Jotunn | Temperate rainforest | Hunting | plaza, market | strong-majority |

## 10. Procedural rural villages and hamlets

Most people are outside named burgs. Rural settlement generation should be deterministic and population-conserving.

### Stable IDs

```text
rural-settlement:azgaar-cell:<cellId>:<ordinal>
```

Never use random UUIDs for definition-level villages.

### Cell allocation

For each populated land cell:

1. `ruralPopulation = round(cell.pop * populationRate)`.
2. Reserve a terrain-dependent dispersed share for farms, camps, isolated households, seasonal workers, or pastoral groups.
3. Deterministically partition the remaining people into hamlets/villages.
4. The exact sum of generated settlements plus dispersed population must equal the cell population.
5. Never create a village larger than the source cell population.

Recommended initial ranges:

| Environment | Dispersed share | Cluster target | Typical feel |
|---|---:|---:|---|
| fertile river / agricultural | 15% | 350–700 | compact villages, mills, bridges, market greens |
| forest | 25% | 180–450 | hamlets, foresters, charcoal, hunting, woodland craft |
| highland / tundra | 35% | 100–300 | herding, seasonal holdings, pass stations |
| wetland | 30% | 120–350 | raised villages, fishing, ferries, reed industries |
| poor habitability / dry | 45% | 80–220 | camps, wells, dispersed holdings |

These are configuration targets, not lore absolutes.

### Village cultural composition

Use cell culture as the starting majority, then draw minorities from province demographics modified by connectivity:

```text
minorityPressure += road / river / port connectivity
minorityPressure += proximity to another-culture burg
minorityPressure += border proximity
minorityPressure -= geographic isolation
```

Do not convert canonical ancestry weights into exact local census counts.

### Minimum generated village record

```js
{
  id,
  sourceCellId,
  generatedName,
  population,
  dispersedPopulationShare,
  stateId,
  provinceId,
  sourceCultureId,
  cultureKey,
  localBranchKey,
  minorityShares,
  faithShares,
  biomeId,
  economicRole,
  authorityType,
  publicVirtue,
  localGrievance,
  externalDependency,
  neighborRelationship,
}
```

That minimum is required to stop rural settlements from becoming repeated scenery.

## 11. NPC generation contract

Generate from locality outward, not species inward:

```text
settlement
 -> local branch
 -> province
 -> household / faction
 -> ancestry
 -> faith
 -> profession
 -> personal traits
```

Examples:

- Pyreaz March Orcs should know Imperial border law and have opinions about specific nearby towns, not generic 'human versus orc' dialogue.
- Frostgard Jotunn-border residents should know which giant holds are allied, hostile, indebted, or protected by treaty.
- Surface-Gate Vondari should have more foreign contacts and weaker guild isolation than Deep-Hall Vondari.
- Umbra'kori surface enclaves should have different loyalties and prejudices from deep-house communities.
- A Contian port clerk, Contian academy physician, and Contian fortress engineer share culture but should produce different behaviors and social networks.

Dialogue lookup order should prefer the most local available tag:

```text
settlement:<burgId>
province:<provinceId>
local:<branchKey>
culture:<cultureKey>
state:<stateId>
class:<classKey>
faith:<faithKey>
profession:<professionKey>
```

## 12. Architecture and visual generation

Use culture as grammar, not as a single kit.

Final settlement visuals should combine:

- canonical culture materials/forms
- local branch
- biome and available materials
- settlement wealth
- port/river/lake infrastructure
- walls/citadel/temple/plaza flags
- state public buildings
- minority neighborhoods
- recent war/fire/flood/decline
- current prosperity and maintenance

A mixed province should visibly mix construction traditions without making every building randomly multicultural.

## 13. Economy integration

Culture modifies institutions and preferences; geography supplies resources.

- Vondari craft culture can improve maintenance or processing efficiency, but it cannot create ore without deposits.
- Tideward Lumish can have stronger brokerage and shipping institutions, but blockade still removes trade.
- Zuraldarr pass communities can reduce mountain transit friction through local knowledge.
- Goblin caravan networks can improve connectivity without making every Goblin a merchant.
- Elenori stewardship may restrict extraction rates in protected areas at the cost of short-term revenue.
- Contian regulation may reduce some hazards while increasing bureaucracy and black markets.

Settlement economic specialization should first read actual Azgaar production/trade data, then apply cultural modifiers.

## 14. Military integration

Recruitment is population-constrained.

Local branch affects doctrine and unit weighting, never free manpower:

- Pyreaz Marchers: scouts, interpreters, mixed militia, border cavalry/infantry.
- Frostgard giant-border communities: treaty auxiliaries or anti-giant specialists based on local relations.
- Warden Umbra'kori: depth scouts, engineers, choke-point defense.
- Surface-Gate Vondari: contract troops, engineers, logistics specialists.
- Tidegrove Elenori: coastal scouts, boat crews, wardens.
- Contian fortress towns: engineers, ward specialists, disciplined garrison formations.

## 15. Politics and faction behavior

Local branch should influence issue salience:

- capital branches: legitimacy, offices, court/church/academy competition;
- frontier branches: defense, autonomy, land, local law;
- trade branches: route security, tariffs, treaties, piracy;
- enclave branches: legal protection, bilingual brokers, protection from collective punishment;
- custodial branches: archive/resource restrictions and inherited authority;
- reform branches: reinterpret parent cultural values rather than simply rejecting them.

Conflict probability must come from interests, institutions, history and leadership, not ancestry alone.

## 16. Runtime settlement profile

Recommended derived definition object:

```js
{
  settlementId: 'settlement:azgaar-burg:<id>',
  sourceBurgId: <id>,
  initialPopulation: <integer>,
  stateId: 'region:azgaar-state:<id>',
  provinceId: 'region:azgaar-province:<id>',
  sourceCultureId: <integer>,
  cultureKey: '<canonical-or-seed>',
  localBranchKey: '<branch>',
  provinceContext: 'strong-majority | mixed-majority | plural-frontier',
  enclave: <boolean>,
  biomeId: <Azgaar biome id>,
  settlementClass: '<class>',
  settlementRole: '<Azgaar burg type>',
  civicFlags: [],
}
```

Definition-level source facts are immutable. Current population, current cultural shares, prosperity, faction control, damage, migration, and recent history become mutable world state after simulation begins.

## 17. Population evolution

- births/deaths modify cohorts;
- migration moves cohorts between rural cells and settlements;
- war, famine, disease, persecution, opportunity and route access modify migration pressure;
- conquest does not instantly replace culture;
- mixed households can shift language/identity over generations without changing ancestry;
- a generated village can grow into a town, merge, or disappear;
- a source burg can decline without losing its stable source ID;
- state borders can move while local culture persists.

Use cohorts, not one global population number and not one entity per citizen.

## 18. Anti-flattening rules

1. Ancestry is not culture.
2. State identity is not culture.
3. Province majority is not every resident.
4. A culture is not one architectural kit.
5. Minorities require households, livelihoods, institutions and internal factions.
6. Orc, Goblin, Jotunn, Rakhnid, serpent and draconic ancestry never gets one universal personality template.
7. Azgaar culture IDs are never rewritten to fit lore.
8. Generated villages are explicitly generated and use stable deterministic IDs.
9. Culture ancestry weights are not exact local census counts.
10. Cultural conflict is contingent, not inevitable.

## 19. Implementation priority

1. Implement a local-culture resolver for source burgs.
2. Add province demographic aggregation from cells + burgs.
3. Expose `cultureKey`, `localBranchKey`, province context, enclave flag and settlement class through world queries.
4. Generate rural settlements deterministically from populated cells.
5. Feed local identity into NPC, dialogue, economy, military, faction and rendering systems.
6. Move changing demographics into mutable simulation cohorts while preserving immutable source IDs.

The registry in this document is the launch baseline. Future hand-authored overrides should be explicit and keyed by stable burg or generated-village ID.
