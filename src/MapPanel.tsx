import {useEffect} from "react";
import {Circle,MapContainer,Marker,Popup,TileLayer,useMap} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapOrder={id:string;service:string;price?:string;district?:string;lat:number;lng:number};

const pin=L.divIcon({className:"custom-leaflet-pin",html:"<span>🔧</span>",iconSize:[38,38],iconAnchor:[19,38],popupAnchor:[0,-35]});
const locationPin=L.divIcon({className:"location-leaflet-pin",html:"<span></span>",iconSize:[24,24],iconAnchor:[12,12],popupAnchor:[0,-14]});

function Fly({center}:{center:[number,number]}){const map=useMap();useEffect(()=>{map.flyTo(center,14,{duration:.8})},[center,map]);return null}

export default function MapPanel({orders,center,onSelect}:{orders:MapOrder[];center:[number,number];onSelect:(id:string)=>void}){
 return <MapContainer center={center} zoom={12} minZoom={8} maxZoom={19} scrollWheelZoom zoomControl className="real-map">
  <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>
  <Fly center={center}/><Circle center={center} radius={260} pathOptions={{color:"#176b45",fillColor:"#dafa70",fillOpacity:.22}}/>
  <Marker position={center} icon={locationPin}><Popup>Вы здесь</Popup></Marker>
  {orders.map(o=><Marker key={o.id} position={[o.lat,o.lng]} icon={pin} eventHandlers={{click:()=>onSelect(o.id)}}/>)}
 </MapContainer>
}
