import React from "react";import{createRoot}from"react-dom/client";import App from"./App";import"./style.css";

async function removeLegacyNexusWorker(){
 try{
  if("serviceWorker"in navigator){const registrations=await navigator.serviceWorker.getRegistrations();await Promise.all(registrations.map(registration=>registration.unregister()))}
  if("caches"in window){const keys=await caches.keys();await Promise.all(keys.filter(key=>key.toLowerCase().includes("nexus")).map(key=>caches.delete(key)))}
 }catch(error){console.warn("Legacy cache cleanup failed",error)}
}

void removeLegacyNexusWorker();
createRoot(document.getElementById("root")!).render(<React.StrictMode><App/></React.StrictMode>);
