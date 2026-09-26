import {useEffect} from "react";
import {Circle,MapContainer,Marker,Popup,TileLayer,useMap} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapOrder={id:string;service:string;price?:string;district?:string;customerName?:string;customerAvatar?:string;lat:number;lng:number};

const locationPin=L.divIcon({className:"location-leaflet-pin",html:"<span></span>",iconSize:[24,24],iconAnchor:[12,12],popupAnchor:[0,-14]});
const escapeHtml=(value:string)=>value.replace(/[&<>'"]/g,(char)=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[char]!);
const taskPin=(order:MapOrder)=>{
 const name=(order.customerName||"Пользователь").trim(),title=(order.service||"Задание").trim();
 const avatar=order.customerAvatar
  ? `<img src="${escapeHtml(order.customerAvatar)}" alt="">`
  : `<span>${escapeHtml((name[0]||"?").toUpperCase())}</span>`;
 return L.divIcon({
  className:"task-map-marker",
  html:`<div class="task-map-avatar">${avatar}</div><b>${escapeHtml(title.slice(0,22))}</b>`,
  iconSize:[154,48],iconAnchor:[24,44]
 });
};

function Fly({center}:{center:[number,number]}){const map=useMap();useEffect(()=>{map.flyTo(center,14,{duration:.8})},[center,map]);return null}

export default function MapPanel({orders,center,onSelect}:{orders:MapOrder[];center:[number,number];onSelect:(id:string)=>void}){
 return <MapContainer center={center} zoom={12} minZoom={8} maxZoom={19} scrollWheelZoom zoomControl className="real-map">
  <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>
  <Fly center={center}/><Circle center={center} radius={260} pathOptions={{color:"#176b45",fillColor:"#dafa70",fillOpacity:.22}}/>
  <Marker position={center} icon={locationPin}><Popup>Вы здесь</Popup></Marker>
  {orders.map(o=><Marker key={o.id} position={[o.lat,o.lng]} icon={taskPin(o)} eventHandlers={{click:()=>onSelect(o.id)}}/>)}
 </MapContainer>
}
