import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import { type GeoJSONSource } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";

maplibregl.setWorkerUrl(workerUrl);

export interface MapPoint {
  id: string;
  label: string;
  longitude: number;
  latitude: number;
  kind: "depot" | "outlet" | "vehicle" | "checkpoint";
  sequence?: number;
  completed?: boolean;
  supplemental?: boolean;
  accuracy?: number;
  stale?: boolean;
}
export interface RoadGeometry {
  type: "LineString";
  coordinates: number[][];
}
export function RoadMap({
  points = [],
  geometry,
  onSelect,
  label = "Road map",
}: {
  points?: MapPoint[];
  geometry?: RoadGeometry | null;
  onSelect?: (id: string) => void;
  label?: string;
}) {
  const target = useRef<HTMLDivElement>(null),
    map = useRef<maplibregl.Map>(null);
  const selected = useRef(onSelect);
  selected.current = onSelect;
  const [ready, setReady] = useState(false),
    [failure, setFailure] = useState("");
  useEffect(() => {
    if (!target.current) return;
    let instance: maplibregl.Map;
    try {
      instance = new maplibregl.Map({
        container: target.current,
        center: [80.2, 7],
        zoom: 7,
        style: {
          version: 8,
          sources: {
            basemap: {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution:
                '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
            },
          },
          layers: [{ id: "basemap", type: "raster", source: "basemap" }],
        },
        attributionControl: { compact: true },
      });
      map.current = instance;
      instance.addControl(
        new maplibregl.NavigationControl({ showCompass: false }),
        "top-right",
      );
      instance.on("style.load", () => {
        instance.addSource("points", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
          cluster: true,
          clusterRadius: 35,
          clusterMaxZoom: 12,
        });
        instance.addLayer({
          id: "clusters",
          type: "circle",
          source: "points",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#145b70",
            "circle-radius": 18,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#fff",
          },
        });
        instance.addLayer({
          id: "points",
          type: "circle",
          source: "points",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": [
              "case",
              ["==", ["get", "completed"], true],
              "#1e6b58",
              ["==", ["get", "stale"], true],
              "#8a5b12",
              ["==", ["get", "kind"], "depot"],
              "#17262f",
              "#145b70",
            ],
            "circle-radius": [
              "case",
              ["==", ["get", "kind"], "vehicle"],
              10,
              7,
            ],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#fff",
          },
        });
        instance.addSource("route", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        instance.addLayer({
          id: "route",
          type: "line",
          source: "route",
          paint: {
            "line-color": "#145b70",
            "line-width": 4,
            "line-opacity": 0.8,
          },
        });
        instance.on("click", "points", (e) => {
          const p = e.features?.[0]?.properties;
          if (!p) return;
          selected.current?.(p.id);
          const content = document.createElement("div");
          content.textContent = `${p.sequence ? `Stop ${p.sequence} · ` : ""}${p.label}${p.supplemental ? " · supplemental waypoint" : ""}${p.completed ? " · completed" : ""}`;
          new maplibregl.Popup()
            .setLngLat(e.lngLat)
            .setDOMContent(content)
            .addTo(instance);
        });
        instance.on("click", "clusters", async (e) => {
          const feature = e.features?.[0];
          if (!feature || feature.geometry.type !== "Point") return;
          const zoom = await (
            instance.getSource("points") as GeoJSONSource
          ).getClusterExpansionZoom(feature.properties?.cluster_id);
          instance.easeTo({
            center: feature.geometry.coordinates as [number, number],
            zoom,
          });
        });
        setReady(true);
      });
      instance.on("error", () =>
        setFailure(
          "Map tiles could not load. Route and checkpoint details remain available; reconnect or retry.",
        ),
      );
    } catch {
      setFailure(
        "This device cannot display the road map. Use the checkpoint list and navigation link.",
      );
    }
    return () => {
      setReady(false);
      map.current = null;
      instance?.remove();
    };
  }, []);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    (m.getSource("points") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: points.map((p) => ({
        type: "Feature",
        properties: p,
        geometry: { type: "Point", coordinates: [p.longitude, p.latitude] },
      })),
    });
    (m.getSource("route") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: geometry ? [{ type: "Feature", properties: {}, geometry }] : [],
    });
    const coordinates =
      geometry?.coordinates || points.map((p) => [p.longitude, p.latitude]);
    if (coordinates.length) {
      const bounds = new maplibregl.LngLatBounds();
      coordinates.forEach((p) => bounds.extend(p as [number, number]));
      m.fitBounds(bounds, { padding: 35, maxZoom: 14, duration: 0 });
    }
  }, [points, geometry, ready]);
  return (
    <div className="road-map-wrap">
      <div ref={target} className="road-map" role="region" aria-label={label} />
      {failure && (
        <p role="status" className="map-warning">
          {failure}
        </p>
      )}
      <small className="map-caption">
        Road basemap · planned OSRM route · supplemental waypoints are labelled.
        No live traffic.
      </small>
    </div>
  );
}
