# Dortmund Kachel-Viewer (Vorläufig)

Dieselbe Stadt in vier Detailstufen, die nach Kameraabstand geladen und wieder entladen werden.
Quelle der Daten: dein 48-Zellen-Datensatz (LoD2-Gebäude und DGM1 aus NRW, Datenlizenz Deutschland – Zero – Version 2.0, laut Datensatz).

## Starten
Im Ordner einen Webserver starten und die Seite öffnen (direktes Öffnen per Doppelklick geht nicht, weil der Browser dann keine Kachel-Dateien lädt):

    python3 -m http.server 8099
    # dann http://localhost:8099/index.html

In einem Codespace: Befehl ausführen, Port 8099 weiterleiten, öffnen.
Steuerung: Ziehen = umsehen, W A S D = fliegen, Q/E = hoch/runter, Umschalt = schnell, Mausrad = Tempo, Knopf „Rundflug“.
Adresszeile: `?debug=1` färbt die Stufen ein, `?th=450,1100,2400,3200` setzt die Radien (L0, L1, L2, Ladefenster), `?cam=x,y,z,gier,nick` setzt die Kamera.

## Stufen
| Stufe | Gelände | Gebäude | Radius |
|---|---|---|---|
| L0 | 4 m Höhenkarte | die echten LoD2-Dreiecke | bis 450 m |
| L1 | 8 m Höhenkarte | Voxel-Säulen, 4 m, Höhe in 3-m-Stufen, nur sichtbare Flächen | bis 1100 m |
| L2 | 16 m Höhenkarte, Dächer eingerechnet | (steckt in der Höhenkarte) | bis 2400 m |
| L3 | 64 m Höhenkarte, Dächer eingerechnet | (steckt in der Höhenkarte) | bis Fensterrand |

Außerhalb des Fensterradius wird eine Kachel entladen. Zwischen den Stufen verdecken Schürzen die Risse.

## Dateien
- `tiles/h{stufe}_{x}_{z}.bin`: Höhenkarte als uint16 (1 mm Auflösung ab −40 m); bei L2/L3 folgt je Knoten ein Byte „Gebäude ja/nein“.
- `tiles/b0_*.bin`, `tiles/b1_*.bin`: Gebäudenetz, Positionen als uint16 relativ zur Kachel-Box, Indizes uint16 oder uint32.
- `tiles/manifest.json`: Raster 6 × 8 Zellen à 512 m, Ursprung (EPSG:25832, E0 392192, N0 5704704), Größen je Datei.
- `tools/`: die Python-Skripte, mit denen aus den 48 Zellen bereinigt und die Kacheln erzeugt wurden, und die Playwright-Messungen.

## Gemessen (Software-Rendering ohne GPU, 1280 × 720)
- Gesamtes Kachelpaket: 14,7 MB statt 95 MB Gesamt-GLB.
- Erstes Bild nach 0,4 s mit 1,5 MB; alles geladen nach 0,85 s (lokaler Server).
- Gezeichnet werden 0,2 bis 0,5 Mio. Dreiecke, im Speicher liegen höchstens 1,1 Mio. (alle Stufen zusammen) statt 2,7 Mio.
- Die Bildrate lässt sich ohne GPU nicht beurteilen (dort ca. 1 Bild/s). Der Zähler im Viewer zeigt sie auf deinem Gerät.

## Bekannte Grenzen
- Keine Texturen, keine Straßen als eigene Objekte; die Farben kommen aus Höhe und Gebäude ja/nein.
- L1-Säulen sind bewusst grob (4 m); L2/L3 sehen aus der Nähe zackig aus.
- Es gibt keinen Zwischenspeicher: Wechselt eine Kachel die Stufe, wird sie neu geladen.
