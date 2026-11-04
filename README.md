# Formwerk 3D

3D-Viewer und Editor in **einer einzigen HTML-Datei** – gemacht zum Einfügen in KI-Chats, läuft aber genauso lokal im Browser (kein Server, keine Anmeldung, alle Daten bleiben auf dem Gerät).

**Dateien:**
- `dist/formwerk3d.min.html` (≈ 1480 KB): zum Öffnen im Browser, lädt three.js aus dem Netz.
- `dist/formwerk3d.offline.html` (≈ 2.6 MB, mit Manifold-WASM): komplett offline, three.js und Zusatzmodule sind eingebettet, keine Netzanfragen.
- `dist/formwerk3d.artifact.min.html`: für Artefakt-Fenster in KI-Chats (ohne Doctype/head/body).

## Was drin ist

| Bereich | Inhalt |
|---|---|
| **CAD** | Parametrische Körper, Boolesche Operationen mit der Manifold-Engine (Vereinigen/Abziehen/Schneiden, robust auch bei 100.000+ Dreiecken, Farben und Texturen bleiben erhalten), Skizze → Extrusion / Drehkörper, Messen, Spiegeln, Array, Shell |
| **Mesh** | Punkte auswählen (Rahmen, alle/keine/umkehren/erweitern), verschieben/drehen/skalieren mit weichem Abfall, Auswahl glätten. Flächen: **Extrudieren, Einsetzen, Fase, Löschen, Abtrennen, Kopieren, Verschmelzen, Kantenschleife**. Unterteilen (Loop/flach), UV-Projektion (Box, Planar, Kugel, Zylinder), Vereinfachen |
| **Sculpt** | Pinsel Aufbauen, Aufblasen, Glätten, Kneifen, Planieren, Greifen; Radius, Stärke, Abfall, Symmetrie |
| **Textur-Studio** | Ebenen, Pinsel, Filter, Generatoren, direktes Malen auf dem 3D-Modell |
| **Rigging** | Knochen, Auto-Gewichte, Pose, Keyframes, IK (CCD) |
| **Karte → 3D** | GeoJSON / Overpass-JSON → Gebäude, Straßen, Wasser, Grün; Höhenbild → Gelände |
| **Foto-Scanner** | 16–40 Fotos (oder Video) rund um ein Objekt → Hüllenmodell mit Textur, komplett lokal |
| **Import** | GLB, glTF, VRM, FBX, OBJ (+MTL), DAE, 3DS, 3MF, STL, PLY, ZIP, Punktwolken (XYZ, PTS, CSV, PCD, LAS), Gaussian Splats (`.splat`, 3DGS-PLY) |
| **Export** | Unity (C#), Unreal (C++), Godot, C++/OpenGL, C++-Array, Blender-Python, three.js, OBJ, STL, glTF, GLB |
| **Referenzmodell** | Rettungswagen mit ≈ 164.000 Dreiecken (`{"scene":"rtw"}`) |

Einheiten: 1 Einheit = 1 Meter, Y oben, rechtshändig.

## Bekannte Grenzen

- **Mesh-Modus** arbeitet auf Dreiecken ohne Quad-Topologie. Kantenschleifen sind Ebenenschnitte (achsparallel), Fase gilt für den Rand einer gewählten Fläche, nicht für einzelne Kanten. Kein freies Messer, keine Brücke, kein Kantenfluss-Werkzeug.
- **Negatives Extrudieren** direkt am Außenrand erzeugt überlappende Flächen (wie in Blender). Für Taschen erst „Einsetzen“, dann negativ extrudieren.
- **Booleans** rechnen auf Dreiecksnetzen mit [Manifold](https://github.com/elalish/manifold) (WASM, eingebettet, Apache-2.0). Die Netze müssen wasserdicht sein (z. B. die Reifen des Referenz-Rettungswagens sind es nicht). Wird WebAssembly blockiert (manche Chat-Fenster), springt die einfache BSP-Engine ein, die nur bis 14.000 Dreiecke pro Objekt reicht. Keine exakte B-Rep-Geometrie, kein STEP/DXF, keine Skizzen-Constraints, keine Verlaufsliste.
- **Sculpt** ohne Dynamic Topology und ohne Maskierung; per Befehl gibt es fünf Pinsel (kein Greifen).
- Die Fassungen außer `formwerk3d.offline.html` laden three.js und Schriften aus dem Netz (CDN).
- **glTF/VRM-Import** friert die gespeicherte Pose ein. Texturen, Transparenz (Wimpern, Haarkarten) und Normalmaps werden übernommen; das Skelett kommt als Knochen in den Rig-Modus (nicht an die Meshes gebunden und nur dort sichtbar). Mimik (Morph-Targets), Spring-Bones und MToon-Schatten werden nicht übernommen.
- Mit echten Dateien geprüft: zwei VRM-1.0-Avatare (118.000 und 78.000 Dreiecke, mit Texturen) und ein FBX. Foto-Scanner sowie Splat- und LAS-Import nur mit selbst erzeugten Testdateien.

## Ehrlich zum Foto-Scanner

Der Scanner baut aus den Silhouetten eine **äußere Hülle** (Visual Hull) und legt die Fotos als Textur darüber. Das ist kein Ersatz für echte Photogrammetrie oder Gaussian-Splat-Training: Mulden, Hohlräume, dünne Antennen, Glas und Spiegelungen erfasst er nicht. Die geschätzte Kamerahöhe kann um ca. 10° danebenliegen, Texturen sind an verdeckten Stellen fleckig. Beste Ergebnisse: einfarbiger Untergrund, gleichmäßiges Licht, Objekt füllt das Bild, Fotos der Reihe nach rund um das Objekt.

## Meshroom, COLMAP und andere Photogrammetrie

Meshroom (AliceVision) ist native C++/CUDA-Software und lässt sich nicht in eine HTML-Datei einbauen. Der Weg ist: Meshroom (oder COLMAP, RealityCapture, Polycam, Luma …) rechnet, Formwerk 3D übernimmt das Ergebnis. Den Ausgabeordner (`texturedMesh.obj`, `.mtl`, Textur) als ZIP oder einzeln hineinziehen; Punktwolken (PLY/XYZ/LAS) und Gaussian Splats lassen sich über „In Netz wandeln“ in Dreiecke verwandeln. Danach stehen Vereinfachen, Booleans, Sculpt, Textur, Rig und Export zur Verfügung. Geprüft mit einem nachgebauten Meshroom-Ausgabeordner (490.000 Dreiecke, 1024²-Textur): Import 5 s, Vereinfachen auf 10 % unter 1 s (`test/pw_meshroom.js`). Mit echten Meshroom-Daten noch nicht getestet.

## Mit einer KI benutzen

1. Die Datei `dist/formwerk3d.min.html` (oder `.artifact.min.html`) im Chat als Artefakt/HTML öffnen oder den Inhalt einfügen.
2. Die KI steuert den Editor mit **JSON-Befehlen**. Anleitung für die KI: In der Seite „Hilfe“ → „Komplette KI-Anleitung“, oder im Browser:

```js
Formwerk3D.manual()      // komplette Anleitung als Text
Formwerk3D.llmPrompt()   // Kurzfassung mit allen Befehlen
Formwerk3D.run('[{"add":"box","w":2,"h":1,"d":1}]')   // JSON-Befehle (oder Skript) ausführen
Formwerk3D.api.screenshot()                            // Bild der Ansicht als Data-URL
```

Weitere Befehle für die KI (Details in `Formwerk3D.manual()`):

```json
{"edit":"Block","select":{"normal":[0,1,0]},"op":"extrude","amount":0.3}
{"sculpt":"Kugel","brush":"inflate","top":[0,0],"radius":0.4,"repeat":3}
{"paint":"Wand","generate":{"name":"bricks","a":10},"text":{"text":"RTW","x":512,"y":300}}
{"rig":{"preset":"humanoid"}}
```

Ohne Seitenzugriff der KI: Der Nutzer fügt die Befehle im Modus „Export“ unter „Skript & Befehle“ ein und drückt „Ausführen“. Der Knopf **„Bild“** oben erzeugt ein Bild der aktuellen Ansicht zum Kopieren – so lässt sich das Ergebnis im Chat zeigen.

Beispiel:

```json
[
  {"add":"box","w":2,"h":0.8,"d":1.2,"pos":[0,0.4,0],"name":"Block"},
  {"add":"cylinder","rt":0.3,"rb":0.3,"h":2,"rot":[90,0,0],"pos":[0,0.4,0],"name":"Loch"},
  {"boolean":"subtract","a":"Block","b":"Loch","name":"Lagerblock"},
  {"view":"iso"}
]
```

Vorführ-Szenen: `{"scene":"rtw"}` Rettungswagen · `{"scene":"city"}` Stadt aus Kartendaten · `{"scene":"scan"}` Foto-Scanner-Demo (Original links, aus 20 Fotos berechnetes Modell rechts) · `{"scene":"rig"}` animierte Kette.

Hinweis: In manchen Chat-Fenstern sind Downloads und Skripte gesperrt. Dann funktionieren die Kopieren-Knöpfe und die JSON-Befehle weiterhin.

## Online ansehen (GitHub Pages)

Einmalig einschalten: Repo → Settings → Pages → Source "Deploy from a branch" → Branch `main`, Ordner `/docs`. Danach läuft alles unter **https://zweeback.github.io/formwerk3d/**:

- `/` Startseite mit Links
- `/dortmund/index.html?mesh=city/,city3/` Foto-3D-Stadt (Hörde und Innenstadt), `&game&mode=driver` für die Fluchtfahrt
- `/formwerk3d.html` der Editor

Hinweis: Das Repo enthält außerdem ein älteres, getrenntes Projekt (`src/anticipator`, `tests/`, "Webhook Anticipator"). Es ist unverändert.

## Chat-Fassung (Claude-Artefakt)

`tools/dortmund/lite/` baut eine abgespeckte Fassung nur mit dem Foto-Mesh (Fliegen, Orte, Rundflug), die als Artefakt in einem Claude-Chat läuft:

    python3 -I tools/dortmund/lite/build_lite.py docs/dortmund lite city:19,city3:18 1.5 1100

Das schreibt `lite/index.json` und `lite/packs/pNN.txt` (Base64-Text, weil Artefakte keine rohen Binärdateien ausliefern; Kacheln auf 3-Byte-Grenzen, damit ein Bereichsabruf funktioniert). `lite.html` ist die Seite dazu. Die feinste Stufe liegt nur im Umkreis (hier 1,1 km) von Mathilde, Reinoldikirche und Hauptbahnhof, sonst wäre das Artefakt über dem 256-MB-Limit. Test lokal: `node test/pw_lite.js` (mit `NORANGE=1` ohne Bereichsabruf).

## Selbst bauen

```bash
npm install          # terser, three, jsdom, playwright
node build.js        # schreibt dist/formwerk3d{,.min,.artifact,.artifact.min,.offline}.html
```

Der Quelltext liegt in `src/` als nummerierte Module (`00-core.js` … `99-boot.js`), `build.js` fügt sie zu einer Datei zusammen. three.js (r147) wird zur Laufzeit per CDN nachgeladen (cdnjs, jsDelivr, unpkg).

Tests (`test/`) laufen mit Playwright/Chromium (`pw_*.js`), jsdom (`t1`–`t4`) oder reinem Node (`t5`, `t6`). `node test/pw_vrm_import.js datei.vrm` prüft den VRM-Import mit einer eigenen Datei (ohne Argument wird übersprungen).

## Lizenz

Noch keine festgelegt – bitte vor dem Veröffentlichen eine Lizenz hinzufügen.

## Dortmund-Kacheln (Vorläufig)
`docs/dortmund/` enthält einen Kachel-Viewer mit vier Detailstufen und rollendem Ladefenster (Beschreibung in `docs/dortmund/README.md`), `tools/dortmund/` die Skripte, mit denen aus den 48 Zellen bereinigt und die Kacheln erzeugt wurden. Formwerk selbst führt Sichtweite und Nahebene jetzt mit dem Kameraabstand mit, damit kartengroße Importe (mehrere Kilometer) sichtbar bleiben.
