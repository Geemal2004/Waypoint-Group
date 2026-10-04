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
  const currentPoints = useRef(points);
  const lastBounds = useRef("");
  const visibleBounds = useRef<maplibregl.LngLatBounds | null>(null);
  const dataKey = JSON.stringify(points),
    routeKey = JSON.stringify(geometry);
  selected.current = onSelect;
  currentPoints.current = points;
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
      const resize = new ResizeObserver(() => {
        if (!target.current?.clientWidth) return;
        instance.resize();
        if (visibleBounds.current)
          instance.fitBounds(visibleBounds.current, {
            padding: 35,
            maxZoom: 14,
            duration: 0,
          });
      });
      resize.observe(target.current);
      instance.on("remove", () => resize.disconnect());
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
        const clusterLabels = new Map<number, maplibregl.Marker>();
        instance.on("render", () => {
          if (!instance.isSourceLoaded("points")) return;
          const shown = new Set<number>();
          for (const f of instance.querySourceFeatures("points")) {
            if (!f.properties?.cluster || f.geometry.type !== "Point") continue;
            const id = Number(f.properties.cluster_id);
            shown.add(id);
            if (!clusterLabels.has(id)) {
              const label = document.createElement("span");
              label.className = "map-cluster-label";
              label.textContent = String(f.properties.point_count_abbreviated);
              label.style.pointerEvents = "none";
              clusterLabels.set(
                id,
                new maplibregl.Marker({ element: label })
                  .setLngLat(f.geometry.coordinates as [number, number])
                  .addTo(instance),
              );
            }
          }
          for (const [id, marker] of clusterLabels)
            if (!shown.has(id)) {
              marker.remove();
              clusterLabels.delete(id);
            }
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
          const nearby = currentPoints.current.filter((point) => {
            const pixel = instance.project([point.longitude, point.latitude]);
            return Math.hypot(pixel.x - e.point.x, pixel.y - e.point.y) <= 16;
          });
          if (nearby.length > 1) {
            content.textContent = `${nearby.length} locations here — select one:`;
            content.style.maxHeight = "240px";
            content.style.overflowY = "auto";
            for (const point of nearby) {
              const button = document.createElement("button");
              button.className = "text-button";
              button.style.display = "block";
              button.textContent = point.label;
              button.onclick = () => selected.current?.(point.id);
              content.appendChild(button);
            }
          }
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
    const boundsKey = JSON.stringify([
      geometry?.coordinates,
      points.map((p) => p.id),
    ]);
    if (coordinates.length && boundsKey !== lastBounds.current) {
      lastBounds.current = boundsKey;
      const bounds = new maplibregl.LngLatBounds();
      coordinates.forEach((p) => bounds.extend(p as [number, number]));
      visibleBounds.current = bounds;
      m.fitBounds(bounds, { padding: 35, maxZoom: 14, duration: 0 });
    }
    const markers = points
      .filter((p) => p.kind === "checkpoint")
      .map((p) => {
        const label = document.createElement("button");
        label.className = "map-checkpoint" + (p.completed ? " completed" : "");
        label.textContent = String(p.sequence);
        label.title = p.label;
        label.setAttribute("aria-label", `Stop ${p.sequence}: ${p.label}`);
        label.onclick = () => selected.current?.(p.id);
        return new maplibregl.Marker({ element: label })
          .setLngLat([p.longitude, p.latitude])
          .addTo(m);
      });
    return () => markers.forEach((marker) => marker.remove());
  }, [dataKey, routeKey, ready]);
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
