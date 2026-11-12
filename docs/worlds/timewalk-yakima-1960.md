# Evercraft Worlds · Timewalk · Yakima 1960

**Scope:** first-person historical exploration alpha, locally runnable and source-labeled. The browser demo is at `public/worlds/timewalk/yakima-1960/index.html`.

## What is factual
- **A.E. Larson Building**, 6 South Second Street: 1931 Art Deco construction, 11 stories, architect John W. Maloney. [Society of Architectural Historians](https://sah-archipedia.org/buildings/WA-01-077-0039) and [NPS](https://npgallery.nps.gov/AssetDetail/NRIS/84003647).
- **Capitol Theatre**, 19 South Third Street: established 1920; existed before the destructive 1975 fire and subsequent restoration. [Official theatre site](https://capitoltheatre.org/venues/historic-theatre/) and [NPS](https://npgallery.nps.gov/AssetDetail/b7cd6bfe-bf93-41d1-9c10-fc9b17187a06/).
- Historical baseline: the Library of Congress [1920–Dec 1950 Sanborn set](https://www.loc.gov/item/sanborn09381_002/) provides earlier street and footprint context; **it does not prove specific 1960 facades or tenants**.
- More evidence is available from [Yakima Valley Libraries](https://www.yvl.org/services/special-collections-and-archive-services/maps-and-atlases/) and the [Yakima Valley Museum archive](https://yvmuseum.org/news/our-library-archives).

## What is reconstructed
The 3D massing, facade colors and details, street width, storefronts, signage, people, cars, trees, lighting, exact coordinates and lengths are **illustrative**, **not surveyed 1960 historical details**. The tour's 1960 year is fixed. Historic source facts live separately from artistic world geometry. No license-restricted archival photographs are embedded.

## Implementation
- Independent, zero-dependency HTML with original code reusing the Evercraft Worlds Mosslight WebGL2 renderer kernel.
- Walk WASD, drag look, E to inspect, mobile joystick, landmark jumps, provenance cards, evidence JSON export.
- Canvas2D perspective fallback retains walking on browsers without WebGL2.
- Rendering coordinates are local world units, not georeferenced GIS coordinates.
- This is a browser-side prototype, **not** an authoritative Systemia World Engine scene.
- No backend, payment integration, external host runtime, or remote API is used.

## Tests and limitations
Local Chromium QA: JS parsed; Canvas2D fallback rendered approximately 1,842 primitives; no page errors; W movement changed camera position; landmark button updated selected evidence and camera; 390px mobile layout and joystick displayed. **Native WebGL2 not validated in sandbox** because headless Chromium did not expose WebGL2. This change should receive a real-device browser smoke and provenance editorial review before publishing.

## Next historical-quality stage
Georeference appropriate Sanborn sheets, validate 1950–1960 changes against period directories, photos and permits, add feature-level confidence and date intervals, and verify rights before displaying archival media. Only then claim high-accuracy 1960 street reconstruction.
