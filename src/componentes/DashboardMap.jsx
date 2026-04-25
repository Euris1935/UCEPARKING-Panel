
import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Solución para iconos de Leaflet
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Coordenadas fijas del Parqueo UCE (Ajustado según referencia)
const UCE_LOCATION = [18.458646, -69.294666];

export default function DashboardMap() {
  return (
    <div className="w-full h-full rounded-2xl overflow-hidden shadow-sm border border-gray-100 relative group">
      <MapContainer 
        center={UCE_LOCATION} 
        zoom={17} 
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
        className="z-10"
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />
        
        <Marker position={UCE_LOCATION} draggable={false}>
          <Popup>
            <div className="text-center">
              <p className="font-bold text-blue-600 uppercase text-[10px] tracking-widest mb-1">Ubicación Principal</p>
              <p className="text-xs font-black text-gray-800">Parqueo Central UCE</p>
              <p className="text-[10px] text-gray-500 mt-1">San Pedro de Macorís, RD</p>
            </div>
          </Popup>
        </Marker>
      </MapContainer>

      {/* Overlay de información rápida */}
      <div className="absolute top-4 right-4 z-[20] bg-white/90 backdrop-blur px-3 py-2 rounded-xl shadow-lg border border-white pointer-events-none">
          <p className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">Geo-Posición</p>
          <p className="text-[11px] font-bold text-gray-800 tabular-nums">18.458646, -69.294666</p>
      </div>

      {/* Etiqueta de estilo */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[20] bg-gray-900/80 backdrop-blur text-white px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-xl opacity-0 group-hover:opacity-100 transition-opacity">
          Vista Satelital Próximamente
      </div>
    </div>
  );
}
