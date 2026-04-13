'use client';

import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';

type SchoolMapPoint = {
  id: string;
  coachName: string;
  schoolName: string;
  division: string | null;
  lat: number;
  lon: number;
};

export function SchoolDistributionMap({ points }: { points: SchoolMapPoint[] }) {
  if (!points.length) {
    return (
      <div className="rounded border border-dashed border-meta-border/60 bg-meta-dark/30 p-6 text-sm text-meta-muted">
        No geocoded schools found yet.
      </div>
    );
  }

  const center = {
    lat: points.reduce((sum, point) => sum + point.lat, 0) / points.length,
    lon: points.reduce((sum, point) => sum + point.lon, 0) / points.length,
  };

  return (
    <div className="overflow-hidden rounded border border-meta-border/50">
      <MapContainer
        center={[center.lat, center.lon]}
        zoom={7}
        scrollWheelZoom={true}
        style={{ height: 420, width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {points.map((point) => (
          <CircleMarker
            key={point.id}
            center={[point.lat, point.lon]}
            radius={8}
            pathOptions={{
              color: '#38bdf8',
              fillColor: '#0ea5e9',
              fillOpacity: 0.8,
              weight: 2,
            }}
          >
            <Popup>
              <div className="space-y-1 text-sm">
                <div className="font-semibold">{point.schoolName}</div>
                <div>Coach: {point.coachName}</div>
                {point.division ? <div>Division: {point.division}</div> : null}
                <div>
                  {point.lat.toFixed(4)}, {point.lon.toFixed(4)}
                </div>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
