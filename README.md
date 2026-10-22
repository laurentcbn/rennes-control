# Rennes Control

Tableau de bord pour iPad (paysage) : heure de Paris, météo de Rennes et
**prochains départs STAR à l'arrêt Pont de Châteaudun** :

- **C4** → Saint-Grégoire (Grand Quartier)
- **C6** → Saint-Jacques-de-la-Lande (Aéroport)

Les horaires viennent uniquement des données officielles STAR. Rien n'est inventé ni estimé par l'application.

## Sources de données

| Donnée | Source | Format | Accès navigateur |
|---|---|---|---|
| Temps réel | [STAR GTFS-RT Trip Updates](https://proxy.transport.data.gouv.fr/resource/star-rennes-integration-gtfs-rt-trip-update) (proxy officiel transport.data.gouv.fr) | Protobuf GTFS-RT 2.0 | Oui, réponse `Access-Control-Allow-Origin: *` |
| Horaires théoriques | [GTFS STAR en cours](https://eu.ftp.opendatasoft.com/star/gtfs/GTFS_STAR_BUS_METRO_EN_COURS.zip), référencé sur [transport.data.gouv.fr](https://transport.data.gouv.fr/datasets/versions-des-horaires-theoriques-des-lignes-de-bus-et-de-metro-du-reseau-star-dans-les-formats-gtfs-et-netex-ainsi-que-les-urls-dacces-au-gtfs-rt-1) | GTFS (zip) → `data/schedule.json` | Fichier statique du site |
| Bus en approche (GPS) | [STAR GTFS-RT Vehicle Positions](https://proxy.transport.data.gouv.fr/resource/star-rennes-integration-gtfs-rt-vehicle-position) | Protobuf GTFS-RT 2.0 | Oui (CORS `*`) |
| Grèves, travaux | [STAR GTFS-RT Alerts](https://proxy.transport.data.gouv.fr/resource/star-rennes-integration-gtfs-rt-alerts) | Protobuf GTFS-RT 2.0 | Oui (CORS `*`) |
| Météo | [Open-Meteo](https://open-meteo.com/) | JSON | Oui, sans clé |

**Aucun backend ni aucune clé n'est nécessaire.** Le flux GTFS-RT autorise les
requêtes depuis n'importe quel site (CORS). Le navigateur le télécharge toutes les 30 s et le décode
lui-même (`assets/gtfsrt.js`, décodeur Protobuf sans dépendance).

Le jeu de données JSON *« prochains passages des lignes de bus STAR en temps réel »*
(data.rennesmetropole.fr / data.explore.star.fr) n'a pas pu être testé depuis
l'environnement de développement (hôtes bloqués par le réseau). L'intégration
repose donc sur le GTFS-RT, vérifié de bout en bout.

### Identifiants vérifiés (GTFS du 20/10/2026)

| Élément | Valeur |
|---|---|
| Arrêt Pont de Châteaudun, quai sens C4 → Saint-Grégoire et C6 → Aéroport | `stop_id 7-1164` (code 1164) |
| Quai opposé (C4 → ZA Saint-Sulpice, C6 → Cesson) | `7-1171`, non affiché |
| Ligne C4 | `route_id 7-0004`, `direction_id 0`, terminus `Grand Quartier` |
| Ligne C6 | `route_id 7-0006`, `direction_id 0`, termini `Aéroport` / `Saint-Jacques Aéroport` |

Les courses C4 limitées à *République* (même quai, même sens) ne vont pas à
Saint-Grégoire : elles sont volontairement exclues.

## Règles d'affichage

- **Temps réel** (pastille rouge) : la course a un **véhicule assigné** dans le
  flux GTFS-RT. L'heure affichée est la prévision STAR. Le retard (`+2 min`,
  `−1 min`, `à l'heure`) est l'écart entre cette prévision et l'horaire GTFS de
  la même course (`trip_id`). Il n'est affiché que dans ce cas.
- **Théorique** (cadre pointillé) : aucun véhicule suivi. C'est l'horaire publié.
  Le flux STAR contient aussi des courses sans véhicule dont l'heure est
  la copie de l'horaire théorique. Elles ne sont jamais présentées comme du temps réel.
- **Supprimé** : course `CANCELED`/`DELETED` ou arrêt `SKIPPED` dans le flux.
- Les départs sont triés par heure, 4 par ligne (3 si Safari affiche sa
  barre d'outils ou si un avertissement est affiché).
- **Fraîcheur** : le pied de page affiche l'heure de génération du flux STAR et
  l'heure de la dernière actualisation. Au-delà de 2 min 30, un avertissement
  apparaît. Au-delà de 7 min, le flux est ignoré et seuls les horaires théoriques
  restent, avec un bandeau explicite.
- **Fuseau / changement d'heure** : toutes les heures sont des timestamps UTC.
  La conversion GTFS → UTC suit la règle « midi moins 12 h » du jour de service
  (`zoneinfo` Europe/Paris), et l'affichage force `Europe/Paris` quel que soit le
  réglage de l'appareil.

## Bus en approche

Le C4 et le C6 empruntent les mêmes 6 arrêts avant Pont de Châteaudun
(Tournebride → Les Préales → Plaine de Baud → François Château → Pont de
Strasbourg → Robidou). Une piste unique montre les bus de ces deux lignes qui roulent
vers l'arrêt, à partir du flux GPS STAR (rafraîchi toutes les 15 s) :

- position = arrêt où le bus est à l'arrêt (`STOPPED_AT`), ou entre deux arrêts
  par projection de sa position GPS sur le segment ;
- seules les courses du tableau (bonne ligne, bon sens, bonne destination) sont
  affichées. Une position GPS de plus de 5 min est ignorée ;
- un bus suivi en temps réel qui n'est pas encore sur ces 6 arrêts apparaît
  à gauche avec « ← plus loin ».

La liste des arrêts est extraite du GTFS par `tools/build_schedule.py` (champ `tracks`).

## Grèves et info trafic

Le flux d'alertes STAR est relu toutes les 5 min. Seules les alertes utiles à
Pont de Châteaudun sont affichées :

- **bandeau rouge** : grève, manifestation, service supprimé ou réduit sur tout
  le réseau ou sur le C4 / C6, en cours ou annoncé dans les 36 h ;
- **ligne discrète sous la piste** : autres alertes en cours sur le C4 / C6 qui
  touchent l'arrêt ou les 6 arrêts précédents (les arrêts déplacés sont en
  pointillés orange sur la piste). Plusieurs alertes défilent toutes les 8 s ;
- les alertes sur des arrêts éloignés des lignes sont ignorées.

## Bars du centre-ville

De 16h à 3h, le bloc « heure par heure » laisse la place à « Ce soir · bars » :
ouvert / ferme bientôt / ouvre à…, calculé en heure de Paris (fermetures après
minuit gérées). Les horaires sont dans `data/bars.json` : ce sont des horaires
**habituels**, repris de schlouk-map.com (oct. 2026), non officiels et parfois
contradictoires d'un site à l'autre. Il suffit de modifier ce fichier pour
corriger un horaire ou ajouter un bar.

## Le majordome

Une phrase en haut de l'écran commente la situation réelle : grève, bus imminent,
pluie, retard, avance, heure de la journée (`assets/butler.js`, testé dans
`tests/butler.js`).

## Lancer en local

```bash
cd rennes-control
python3 tools/build_schedule.py      # télécharge le GTFS STAR → data/schedule.json
python3 -m http.server 8000          # puis ouvrir http://localhost:8000
```

Python 3.9+ suffit, sans dépendance. Ouvrir `index.html` directement en `file://` ne
fonctionne pas, car le navigateur bloque la lecture de `data/schedule.json` : il faut un serveur HTTP.

## Tests

```bash
node tests/unit.js                   # fusion théorique / temps réel, annulations, retards, libellés
node tests/track.js                  # placement des bus sur la piste (coordonnées réelles des arrêts)
node tests/alerts.js                 # tri des alertes (grève annoncée, travaux, alertes hors zone)
node tests/butler.js                 # phrases du majordome
node tests/bars.js                   # ouverture des bars (y compris après minuit)
node tests/live_board.js             # télécharge le vrai flux et affiche le tableau C4 / C6
pip install gtfs-realtime-bindings
python3 tests/compare_decoder.py feed.pb   # compare le décodeur JS au décodeur de référence Google
python3 tests/compare_vehicles.py vp.pb    # idem pour les positions GPS
python3 tests/compare_alerts.py alerts.pb  # idem pour les alertes
NODE_PATH=$(npm root -g) node tests/browser_check.js http://localhost:8000/   # Playwright, viewport iPad
```

Si `live_board.js` affiche `feed HTTP 5xx` ou `fetch failed`, c'est le flux STAR
ou le réseau qui est indisponible, pas le code. La page affiche alors les horaires
théoriques avec le bandeau « Temps réel indisponible ».

## Déploiement (GitHub Pages)

1. Créer un dépôt GitHub (par ex. `rennes-control`) et y pousser ce dossier sur `main`.
2. *Settings → Pages → Build and deployment → Source : **GitHub Actions***.
3. Le workflow `.github/workflows/deploy.yml` régénère `data/schedule.json` à
   chaque push **et chaque nuit** (le GTFS STAR change chaque semaine), lance les
   tests et publie le site sur `https://<utilisateur>.github.io/rennes-control/`.

Le site est 100 % statique. N'importe quel hébergeur statique (Netlify,
Cloudflare Pages, un Raspberry Pi avec nginx…) convient, à condition de relancer
`tools/build_schedule.py` au moins une fois par semaine (cron).

Si un jour le proxy transport.data.gouv.fr retirait l'en-tête CORS, il suffirait
d'un relais qui recopie le flux (aucune clé requise). Pour l'utiliser, ouvrir
`index.html?feed=https://mon-relais/trip-update`.

## Sur l'iPad Air 2

- Safari → Partager → **Sur l'écran d'accueil** : plein écran, sans barre d'outils.
- Réglages → Luminosité → Verrouillage auto : **Jamais** (ou Accès guidé) pour un écran permanent.
- Compatible iOS 12 à 15 : JavaScript ES2017, aucune bibliothèque.

## Structure

```
index.html              page
assets/style.css        design (noir, crème, rouge sombre)
assets/app.js           horloge, météo, rafraîchissement, rendu
assets/gtfsrt.js        décodeur GTFS-RT (Protobuf)
assets/departures.js    fusion horaires théoriques + temps réel
data/schedule.json      horaires théoriques extraits du GTFS (généré)
tools/build_schedule.py extraction GTFS → schedule.json
tests/                  tests unitaires, test du flux réel, test navigateur
```
