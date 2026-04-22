
import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap, Polygon } from 'react-leaflet';
import L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';

// Solución al problema de los iconos de Leaflet en entornos React/Webpack
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Centrado en la UCE San Pedro de Macorís (aprox)
const UCE_CENTER = [18.4590, -69.2948];

function GeomanControl({ onPolygonChange, initialPolygonWKT }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    // Configuración de Geoman
    map.pm.addControls({
      position: 'topleft',
      drawMarker: false,
      drawCircleMarker: false,
      drawPolyline: false,
      drawRectangle: true,
      drawPolygon: true,
      drawCircle: false,
      cutLayer: false,
      rotateMode: false,
      dragMode: true,
      editMode: true,
      removalMode: true,
    });

    map.pm.setLang('es');

    // Cargar polígono inicial si existe
    if (initialPolygonWKT && initialPolygonWKT.startsWith('POLYGON')) {
      try {
        const coordsStr = initialPolygonWKT.replace('POLYGON((', '').replace('))', '');
        const points = coordsStr.split(',').map(p => {
          const [lng, lat] = p.trim().split(' ').map(Number);
          return [lat, lng];
        });
        
        // PostGIS cierra el anillo, Leaflet no lo necesita como último punto duplicado si es un Polygon simple
        // pero Geoman lo manejará. Quitamos el último si es igual al primero.
        if (points.length > 1 && points[0][0] === points[points.length-1][0] && points[0][1] === points[points.length-1][1]) {
            points.pop();
        }

        const polygon = L.polygon(points).addTo(map);
        map.fitBounds(polygon.getBounds());
      } catch (e) {
        console.warn("Error parseando WKT inicial:", e);
      }
    }

    const handleDrawing = (e) => {
      const layer = e.layer;
      const latlngs = layer.getLatLngs()[0]; // Para polígonos simples
      
      const wkt = polygonToWKT(latlngs);
      onPolygonChange(wkt);

      // Limpiar capas previas para mantener solo uno (opcional, según requerimiento)
      map.eachLayer(l => {
          if (l instanceof L.Polygon && l !== layer) {
              map.removeLayer(l);
          }
      });
    };

    map.on('pm:create', handleDrawing);
    map.on('pm:edit', (e) => {
        const latlngs = e.layer.getLatLngs()[0];
        onPolygonChange(polygonToWKT(latlngs));
    });
    map.on('pm:remove', () => onPolygonChange(''));

    return () => {
      map.off('pm:create');
      map.off('pm:edit');
      map.off('pm:remove');
    };
  }, [map]);

  const polygonToWKT = (latlngs) => {
    if (!latlngs || latlngs.length === 0) return '';
    const coords = latlngs.map(p => `${p.lng.toFixed(6)} ${p.lat.toFixed(6)}`).join(', ');
    // PostGIS requiere cerrar el anillo (repetir el primer punto al final)
    const first = `${latlngs[0].lng.toFixed(6)} ${latlngs[0].lat.toFixed(6)}`;
    return `POLYGON((${coords}, ${first}))`;
  };

  return null;
}

export default function MapaZona({ 
  latitud, 
  longitud, 
  wkt, 
  onSave, 
  onClose 
}) {
  const [markerPos, setMarkerPos] = useState(latitud && longitud ? [latitud, longitud] : UCE_CENTER);
  const [currentWkt, setCurrentWkt] = useState(wkt || '');

  const handleMarkerDrag = (e) => {
    const latlng = e.target.getLatLng();
    setMarkerPos([latlng.lat, latlng.lng]);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-5xl h-[85vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-gray-100">
        
        {/* Header */}
        <div className="px-8 py-5 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
            <div>
                <h3 className="text-xl font-black text-gray-800 uppercase tracking-tighter italic">Selector Geospacial</h3>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Define el centro y el perímetro de la zona</p>
            </div>
            <div className="flex items-center gap-4">
                <div className="text-right hidden sm:block">
                    <p className="text-[10px] font-black text-emerald-600 uppercase">Coordenadas Actuales</p>
                    <p className="text-xs font-mono text-gray-500">{markerPos[0].toFixed(6)}, {markerPos[1].toFixed(6)}</p>
                </div>
                <button 
                    onClick={onClose}
                    className="p-2 bg-gray-200 hover:bg-gray-300 text-gray-600 rounded-full transition-all"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
        </div>

        {/* Map Container */}
        <div className="flex-1 relative bg-gray-200">
          <MapContainer 
            center={markerPos} 
            zoom={18} 
            style={{ height: '100%', width: '100%' }}
            className="z-10"
          >
            {/* TileLayer Minimalista (CartoDB Positron) */}
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            />
            
            <Marker 
              position={markerPos} 
              draggable={true} 
              eventHandlers={{ dragend: handleMarkerDrag }}
            />

            <GeomanControl 
              onPolygonChange={setCurrentWkt} 
              initialPolygonWKT={wkt}
            />
          </MapContainer>

          {/* Tutorial Overlay (Auto-hide optional) */}
          <div className="absolute bottom-6 left-6 z-[20] bg-white/90 backdrop-blur p-4 rounded-2xl shadow-xl border border-white max-w-xs pointer-events-none">
              <h4 className="text-xs font-black text-gray-800 uppercase mb-2">Instrucciones</h4>
              <ul className="text-[10px] text-gray-600 space-y-1.5 font-medium">
                  <li className="flex items-start gap-2">
                      <span className="w-3 h-3 bg-blue-500 rounded-full flex-shrink-0 mt-0.5"></span>
                      <span>Arrastra el <b>marcador azul</b> para definir el punto central de entrada.</span>
                  </li>
                  <li className="flex items-start gap-2">
                      <span className="w-3 h-3 bg-emerald-500 rounded-full flex-shrink-0 mt-0.5"></span>
                      <span>Usa las herramientas de la izquierda para dibujar el <b>polígono</b> del área total.</span>
                  </li>
              </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-5 bg-white border-t border-gray-100 flex justify-end items-center gap-4">
            <p className="text-[10px] text-gray-400 font-bold uppercase italic mr-auto">
                * Los cambios se aplicarán al formulario principal tras confirmar.
            </p>
            <button 
                onClick={onClose}
                className="px-6 py-2.5 text-sm font-bold text-gray-500 hover:text-gray-700 transition"
            >
                Cancelar
            </button>
            <button 
                onClick={() => onSave({ latitud: markerPos[0], longitud: markerPos[1], wkt: currentWkt })}
                className="px-10 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-emerald-100 transition-all transform active:scale-95"
            >
                Confirmar Selección
            </button>
        </div>

      </div>
    </div>
  );
}
