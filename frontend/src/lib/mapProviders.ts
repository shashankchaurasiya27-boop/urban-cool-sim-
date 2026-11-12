/**
 * Satellite Basemap Provider Abstraction for UrbanCoolSim
 * Supports:
 *  - 'esri' (Default): Official Esri World Imagery (ArcGIS) with proper legal attribution.
 *  - 'google': Official Google Maps Platform 2D Satellite Tile API (when configured via API key).
 *  - 'none' / 'carto_dark': Fallback high-contrast dark vector/canvas basemap for offline or analytical-only mode.
 */

export type MapProviderType = "esri" | "google" | "carto_dark" | "none" | "osm_vector";

export interface BasemapConfig {
  id: string;
  name: string;
  provider: MapProviderType;
  attribution: string;
  tiles: string[];
  maxZoom: number;
  tileSize: number;
}

export class SatelliteBasemapProvider {
  /**
   * Retrieves the configured basemap style and tile source definitions for MapLibre GL.
   */
  public static getActiveProvider(): MapProviderType {
    const envProvider = process.env.NEXT_PUBLIC_MAP_PROVIDER?.toLowerCase() as MapProviderType;
    if (envProvider && ["esri", "google", "carto_dark", "none", "osm_vector"].includes(envProvider)) {
      return envProvider;
    }
    return "esri"; // Default legitimate free imagery provider
  }

  public static getBasemapConfig(providerOverride?: MapProviderType): BasemapConfig {
    const provider = providerOverride || this.getActiveProvider();

    switch (provider) {
      case "google": {
        const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
        if (!apiKey) {
          // Fallback to Esri if Google key is not present
          return this.getEsriConfig();
        }
        return {
          id: "google-satellite",
          name: "Google Satellite",
          provider: "google",
          attribution: "© Google Maps Platform",
          // Official Google Maps Tile API format (requires session token / API key in URL according to Google docs)
          tiles: [
            `https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=${apiKey}&key=${apiKey}`
          ],
          maxZoom: 20,
          tileSize: 256
        };
      }

      case "osm_vector":
        return {
          id: "osm-raster",
          name: "OpenStreetMap",
          provider: "osm_vector",
          attribution: "© OpenStreetMap contributors",
          tiles: [
            "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          ],
          maxZoom: 19,
          tileSize: 256
        };

      case "carto_dark":
      case "none":
        return {
          id: "carto-dark",
          name: "Dark Analytic Basemap",
          provider: "carto_dark",
          attribution: "© OpenStreetMap contributors, © CARTO",
          tiles: [
            "https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png"
          ],
          maxZoom: 19,
          tileSize: 256
        };

      case "esri":
      default:
        return this.getEsriConfig();
    }
  }

  private static getEsriConfig(): BasemapConfig {
    return {
      id: "esri-world-imagery",
      name: "Esri World Imagery",
      provider: "esri",
      attribution: "Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
      tiles: [
        "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
      ],
      maxZoom: 19,
      tileSize: 256
    };
  }

  /**
   * Generates a minimal MapLibre GL style object referencing the selected satellite basemap.
   */
  public static getMapLibreStyle(providerOverride?: MapProviderType): any {
    const config = this.getBasemapConfig(providerOverride);

    return {
      version: 8,
      sources: {
        "satellite-basemap-source": {
          type: "raster",
          tiles: config.tiles,
          tileSize: config.tileSize,
          attribution: config.attribution,
          maxzoom: config.maxZoom
        }
      },
      layers: [
        {
          id: "satellite-basemap-layer",
          type: "raster",
          source: "satellite-basemap-source",
          minzoom: 0,
          maxzoom: 22,
          paint: {
            "raster-opacity": 1.0,
            "raster-brightness-min": 0.05,
            "raster-contrast": 0.05
          }
        }
      ]
    };
  }
}
