# Dortmund Kachel-Viewer mit Rettungswagen (Vorläufig)

Dieselbe Stadt in vier Detailstufen, die nach Kameraabstand geladen und wieder entladen werden – und darauf fährt ein Rettungswagen.
Quelle der Daten: dein 48-Zellen-Datensatz (LoD2-Gebäude und DGM1 aus NRW, Datenlizenz Deutschland – Zero – Version 2.0, laut Datensatz).

## Starten
Im Ordner einen Webserver starten und die Seite öffnen (direktes Öffnen per Doppelklick geht nicht, weil der Browser dann keine Kachel-Dateien lädt):

    python3 -m http.server 8099
    # dann http://localhost:8099/index.html

In einem Codespace: Befehl ausführen, Port 8099 weiterleiten, öffnen.

### Flugmodus (Standard)
Ziehen = umsehen, W A S D = fliegen, Q/E = hoch/runter, Umschalt = schnell, Mausrad = Tempo, Knopf „Rundflug“.
Adresszeile: `?debug=1` färbt die Stufen ein, `?th=450,1100,2400,3200` setzt die Radien (L0, L1, L2, Ladefenster), `?cam=x,y,z,gier,nick` setzt die Kamera.

### Fahrmodus (Knopf „Fahren (Rettungswagen)“ oder `?game=1`)
| Taste | Wirkung |
|---|---|
| W / S | Gas / Bremse und Rückwärts |
| A / D | Lenken |
| Leertaste | Handbremse |
| L | Blaulicht und Sirene an/aus |
| T | Tageszeit weiterschalten (Tag, Dämmerung, Nacht), Scheinwerfer gehen nachts an |
| R | Zurück zum Startpunkt |
| Esc | Zurück zum Flugmodus |

Parameter: `?game=1&t=14.5&npc=600` (Startuhrzeit, Anzahl Passanten; 0 = keine).

Der Einsatz: Patient am roten Punkt abholen (bis auf 7 m heranfahren und langsamer als ca. 20 km/h werden), dann ins Krankenhaus bringen. Punkte = 300 + Zeitbonus (bis 120 s) − 60 je Schaden.

## Was im Fahrmodus steckt
- **Fahrphysik** (Arcade): Lenkung wie beim Fahrrad-Modell, seitliche Haftung, Höchsttempo 30 m/s; vier Räder folgen dem Gelände (Nicken und Rollen); Räder drehen und lenken.
- **Kollision**: 15 Prüfpunkte rund um das Fahrzeug gegen eine 2-m-Belegungskarte aus den Gebäudegrundrissen (`tiles/col.bin`); an Wänden wird entlanggerutscht, Aufprall kostet Tempo und gibt Schaden.
- **Kamera**: Verfolgerkamera, die vor Wänden näher heranrückt.
- **Tag/Nacht**: Sonne, Himmel und Nebel wechseln; Scheinwerfer (2 Spots) nachts.
- **Blaulicht und Sirene**: abwechselnd blinkende Blau-Lichter, Sirene und Motor per WebAudio (Töne, keine Aufnahmen).
- **Minikarte**: vorgerenderte Draufsicht (Höhe + Gebäude), mit Fahrzeug und Ziel.
- **Passanten**: 600 Figuren (eine einzige Zeichenanweisung dank Instanzen). Sie schlendern, weichen Wänden aus, halten Abstand, flüchten vor dem fahrenden Wagen und besonders vor der Sirene; wer getroffen wird, fällt um und gibt Schaden. Sie spawnen in einem Ring 25–260 m um den Wagen und werden außerhalb von 330 m entfernt. Rechenzeit ca. 0,35 ms je Schritt.

## Stufen der Stadt
| Stufe | Gelände | Gebäude | Radius |
|---|---|---|---|
| L0 | 4 m Höhenkarte | die echten LoD2-Dreiecke | bis 450 m |
| L1 | 8 m Höhenkarte | Voxel-Säulen, 4 m, Höhe in 3-m-Stufen, nur sichtbare Flächen | bis 1100 m |
| L2 | 16 m Höhenkarte, Dächer eingerechnet | (steckt in der Höhenkarte) | bis 2400 m |
| L3 | 64 m Höhenkarte, Dächer eingerechnet | (steckt in der Höhenkarte) | bis Fensterrand |

Außerhalb des Fensterradius wird eine Kachel entladen. Zwischen den Stufen verdecken Schürzen die Risse.

## Dateien
- `index.html`: Viewer (Kacheln, Flug); `game.js`: Fahren, Einsatz, Passanten; `rtw.glb`: Rettungswagen; `GLTFLoader.js`, `three.min.js` (Three.js r147).
- `tiles/h{stufe}_{x}_{z}.bin`: Höhenkarte als uint16 (1 mm Auflösung ab −40 m); bei L2/L3 folgt je Knoten ein Byte „Gebäude ja/nein“.
- `tiles/b0_*.bin`, `tiles/b1_*.bin`: Gebäudenetz, Positionen als uint16 relativ zur Kachel-Box, Indizes uint16 oder uint32.
- `tiles/manifest.json`: Raster 6 × 8 Zellen à 512 m, Ursprung (EPSG:25832, E0 392192, N0 5704704), Größen je Datei.
- `tiles/ground.bin` (Höhe für Fahrzeug und Passanten), `tiles/col.bin` (Belegungskarte 2 m), `tiles/main.bin` (zusammenhängende freie Fläche, damit Ziele erreichbar sind), `tiles/mission.json` (Start, Krankenhaus).
- `tools/`: Python-Skripte, mit denen aus den 48 Zellen bereinigt und die Kacheln erzeugt wurden, `fetch_osm_roads.py` (Straßen, siehe unten) und die Playwright-Messungen (`pw_game.js`, `pw_crowd.js`, `pw_dortmund.js`, `pw_dortmund_window.js`; brauchen `npm i playwright` und den laufenden Server).

## Gemessen (Software-Rendering ohne GPU, 1280 × 720)
- Gesamtes Paket: ca. 23 MB (Kacheln ca. 16 MB, Rettungswagen 3 MB, Spieldaten 2,4 MB, Rest Skripte und Bibliotheken).
- Erstes Bild nach 0,4 s mit 1,5 MB; alles geladen nach 0,85 s (lokaler Server).
- Gezeichnet werden 0,2 bis 0,5 Mio. Dreiecke, im Speicher liegen höchstens 1,1 Mio. (alle Stufen zusammen) statt 2,7 Mio.
- Fahren: 58 km/h nach 6 s Vollgas (70 m), Kurvenrate 54 °/s; im Kollisionstest 0 Schritte im Gebäude und Stillstand an der Wand.
- Einsatzablauf (Patient → Laden → Krankenhaus → Ende) automatisch durchgespielt, 0 Seitenfehler.
- Die Bildrate lässt sich ohne GPU nicht beurteilen (dort ca. 1 Bild/s). Der Zähler im Viewer zeigt sie auf deinem Gerät.

## Bekannte Grenzen (ehrlich)
- **Das Krankenhaus ist ein Platzhalter** (größter Gebäudekomplex im Gebiet). Echte Koordinaten in `tiles/mission.json` eintragen: `x = Ost − 392192`, `z = −(Nord − 5704704)`.
- **Keine Straßen.** Im Datensatz stehen nur Gelände und Gebäude; Straßen sind einfach die Fläche zwischen den Häusern. Deshalb gibt es auch keinen Verkehr. `tools/fetch_osm_roads.py` holt die Straßen aus OpenStreetMap (nur mit Internet, also im Codespace; in der Claude-Sandbox ist Overpass gesperrt). Die Umrechnung ist getestet, der echte Abruf nicht. Anzeigen und Verkehr darauf sind der nächste Schritt.
- Keine Texturen (Farben aus Höhe und Gebäude ja/nein). Passanten sind einfache Kapseln mit simpler Ausweichlogik, kein Mass-AI wie in der Matrix-Demo.
- L1-Säulen sind bewusst grob (4 m); L2/L3 sehen aus der Nähe zackig aus.
- Es gibt keinen Zwischenspeicher: Wechselt eine Kachel die Stufe, wird sie neu geladen (bei einem 4,9-km-Flug wurden 17 MB übertragen).
- Nicht auf echter GPU getestet.
